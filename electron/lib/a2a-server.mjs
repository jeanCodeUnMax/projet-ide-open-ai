import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import http from 'node:http'
import { createArtifact, createTextPart, AgentTaskStore, A2A_TASK_STATES, validateAgentCard } from './a2a-protocol.mjs'

const DEFAULT_MAX_BODY_BYTES = 2 * 1024 * 1024
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1'])

class A2ARequestError extends Error {
  constructor(message, statusCode = 400, code = 'BAD_REQUEST') {
    super(message)
    this.statusCode = statusCode
    this.code = code
  }
}

function digest(value) {
  return createHash('sha256').update(String(value)).digest()
}

function safeTokenEqual(left, right) {
  if (!left || !right) return false
  return timingSafeEqual(digest(left), digest(right))
}

function bearerToken(request) {
  const authorization = request.headers.authorization
  if (typeof authorization === 'string' && authorization.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim()
  }
  const alternate = request.headers['x-a2a-token']
  return typeof alternate === 'string' ? alternate : undefined
}

function sendJson(response, statusCode, body, {
  contentType = 'application/a2a+json',
  requestId = randomUUID(),
  retryAfter,
} = {}) {
  response.writeHead(statusCode, {
    'content-type': `${contentType}; charset=utf-8`,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
    'x-request-id': requestId,
    ...(retryAfter ? { 'retry-after': String(retryAfter) } : {}),
  })
  response.end(`${JSON.stringify(body)}\n`)
}

async function readJson(request, maxBodyBytes) {
  const declaredLength = Number(request.headers['content-length'] || 0)
  if (declaredLength > maxBodyBytes) {
    throw new A2ARequestError('Charge A2A trop volumineuse.', 413, 'PAYLOAD_TOO_LARGE')
  }
  const chunks = []
  let total = 0
  for await (const chunk of request) {
    total += chunk.length
    if (total > maxBodyBytes) {
      throw new A2ARequestError('Charge A2A trop volumineuse.', 413, 'PAYLOAD_TOO_LARGE')
    }
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new A2ARequestError('JSON A2A invalide.', 400, 'INVALID_JSON')
  }
}

function routeTaskId(pathname) {
  const match = pathname.match(/^\/tasks\/([^/:]+)(:cancel)?$/)
  return match ? { taskId: decodeURIComponent(match[1]), cancel: Boolean(match[2]) } : undefined
}

function requestIp(request) {
  return request.socket.remoteAddress || 'unknown'
}

function createRateLimiter({ limit, windowMs }) {
  const buckets = new Map()
  return (key) => {
    const now = Date.now()
    const current = buckets.get(key)
    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs })
      return { allowed: true, retryAfter: 0 }
    }
    current.count += 1
    if (current.count <= limit) return { allowed: true, retryAfter: 0 }
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) }
  }
}

async function isAuthorized(request, { sharedToken, authorize }) {
  if (typeof authorize === 'function') return Boolean(await authorize(request))
  if (!sharedToken) return true
  return safeTokenEqual(bearerToken(request), sharedToken)
}

export function createA2AServer({
  agentCard,
  executor,
  taskStore = new AgentTaskStore(),
  host = '127.0.0.1',
  port = 43110,
  logger = console,
  sharedToken,
  authorize,
  maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
  rateLimitPerMinute = 120,
  maxConcurrentTasks = 4,
} = {}) {
  const normalizedCard = validateAgentCard(agentCard)
  if (typeof executor !== 'function') throw new Error('Un executor A2A est obligatoire.')
  if (!LOOPBACK_HOSTS.has(host) && !sharedToken && typeof authorize !== 'function') {
    throw new Error('Un serveur A2A non local doit avoir une authentification.')
  }
  if (!Number.isInteger(maxConcurrentTasks) || maxConcurrentTasks < 1) {
    throw new Error('maxConcurrentTasks doit être un entier positif.')
  }

  const checkRate = createRateLimiter({ limit: rateLimitPerMinute, windowMs: 60_000 })
  let runningTasks = 0

  const server = http.createServer(async (request, response) => {
    const requestId = randomUUID()
    try {
      const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `${host}:${port}`}`)

      if (request.method === 'GET' && url.pathname === '/.well-known/agent-card.json') {
        sendJson(response, 200, normalizedCard, { contentType: 'application/json', requestId })
        return
      }

      const rate = checkRate(requestIp(request))
      if (!rate.allowed) {
        sendJson(response, 429, { error: { code: 'RATE_LIMITED', message: 'Trop de requêtes A2A.' } }, {
          requestId,
          retryAfter: rate.retryAfter,
        })
        return
      }

      if (!(await isAuthorized(request, { sharedToken, authorize }))) {
        sendJson(response, 401, { error: { code: 'UNAUTHORIZED', message: 'Authentification A2A requise.' } }, { requestId })
        return
      }

      if (request.method === 'GET' && url.pathname === '/tasks') {
        const tasks = taskStore.list({
          contextId: url.searchParams.get('contextId') ?? undefined,
          state: url.searchParams.get('state') ?? undefined,
        })
        sendJson(response, 200, { tasks }, { requestId })
        return
      }

      const taskRoute = routeTaskId(url.pathname)
      if (request.method === 'GET' && taskRoute && !taskRoute.cancel) {
        const task = taskStore.get(taskRoute.taskId)
        if (!task) {
          sendJson(response, 404, { error: { code: 'TASK_NOT_FOUND', message: 'Tâche inconnue.' } }, { requestId })
          return
        }
        sendJson(response, 200, { task }, { requestId })
        return
      }

      if (request.method === 'POST' && taskRoute?.cancel) {
        const before = taskStore.get(taskRoute.taskId)
        if (!before) {
          sendJson(response, 404, { error: { code: 'TASK_NOT_FOUND', message: 'Tâche inconnue.' } }, { requestId })
          return
        }
        if (typeof executor.cancel === 'function') await executor.cancel({ task: before })
        const task = taskStore.cancel(taskRoute.taskId)
        sendJson(response, 200, { task }, { requestId })
        return
      }

      if (request.method === 'POST' && url.pathname === '/message:stream') {
        sendJson(response, 501, { error: { code: 'UNSUPPORTED_OPERATION', message: 'Le streaming A2A sera ajouté dans une tranche suivante.' } }, { requestId })
        return
      }

      if (request.method === 'POST' && url.pathname === '/message:send') {
        if (runningTasks >= maxConcurrentTasks) {
          sendJson(response, 503, { error: { code: 'CAPACITY_EXCEEDED', message: 'Capacité A2A temporairement atteinte.' } }, {
            requestId,
            retryAfter: 2,
          })
          return
        }
        const payload = await readJson(request, maxBodyBytes)
        if (!payload.message || typeof payload.message !== 'object') {
          sendJson(response, 400, { error: { code: 'INVALID_ARGUMENT', message: 'message est obligatoire.' } }, { requestId })
          return
        }

        let task = taskStore.create({
          message: payload.message,
          contextId: payload.contextId,
          metadata: { ...(payload.metadata ?? {}), requestId },
        })
        task = taskStore.transition(task.id, A2A_TASK_STATES.WORKING)
        runningTasks += 1

        try {
          const result = await executor({ task, message: payload.message, contextId: task.contextId })
          if (result?.messages) {
            for (const message of result.messages) taskStore.appendMessage(task.id, message)
          }
          if (result?.artifacts) {
            for (const artifact of result.artifacts) taskStore.addArtifact(task.id, artifact)
          } else if (result?.text) {
            taskStore.addArtifact(task.id, createArtifact({
              name: 'Résultat',
              parts: [createTextPart(result.text)],
            }))
          }
          const current = taskStore.get(task.id)
          task = current?.status.state === A2A_TASK_STATES.CANCELED
            ? current
            : taskStore.transition(task.id, A2A_TASK_STATES.COMPLETED, { metadata: result?.metadata })
        } catch (error) {
          logger.error?.('[A2A] executor failure', { requestId, error })
          const current = taskStore.get(task.id)
          task = current?.status.state === A2A_TASK_STATES.CANCELED
            ? current
            : taskStore.transition(task.id, A2A_TASK_STATES.FAILED, {
                metadata: { error: error instanceof Error ? error.message : String(error), requestId },
              })
        } finally {
          runningTasks -= 1
        }

        sendJson(response, 200, { task: taskStore.get(task.id) }, { requestId })
        return
      }

      sendJson(response, 404, { error: { code: 'NOT_FOUND', message: 'Route A2A inconnue.' } }, { requestId })
    } catch (error) {
      logger.error?.('[A2A] request failure', { requestId, error })
      const statusCode = error instanceof A2ARequestError ? error.statusCode : 400
      const code = error instanceof A2ARequestError ? error.code : 'BAD_REQUEST'
      sendJson(response, statusCode, {
        error: { code, message: error instanceof Error ? error.message : String(error) },
      }, { requestId })
    }
  })

  return {
    agentCard: normalizedCard,
    taskStore,
    get runningTasks() {
      return runningTasks
    },
    async start() {
      await new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(port, host, resolve)
      })
      const address = server.address()
      const actualPort = typeof address === 'object' && address ? address.port : port
      return { host, port: actualPort, baseUrl: `http://${host}:${actualPort}` }
    },
    async close() {
      if (!server.listening) return
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    },
  }
}

export { A2ARequestError, safeTokenEqual }
