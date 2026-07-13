import http from 'node:http'
import { createArtifact, createTextPart, AgentTaskStore, A2A_TASK_STATES, validateAgentCard } from './a2a-protocol.mjs'

const MAX_BODY_BYTES = 2 * 1024 * 1024

function sendJson(response, statusCode, body, contentType = 'application/a2a+json') {
  response.writeHead(statusCode, {
    'content-type': `${contentType}; charset=utf-8`,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  response.end(`${JSON.stringify(body)}\n`)
}

async function readJson(request) {
  const chunks = []
  let total = 0
  for await (const chunk of request) {
    total += chunk.length
    if (total > MAX_BODY_BYTES) throw new Error('Charge A2A trop volumineuse.')
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function routeTaskId(pathname) {
  const match = pathname.match(/^\/tasks\/([^/:]+)(:cancel)?$/)
  return match ? { taskId: decodeURIComponent(match[1]), cancel: Boolean(match[2]) } : undefined
}

export function createA2AServer({
  agentCard,
  executor,
  taskStore = new AgentTaskStore(),
  host = '127.0.0.1',
  port = 43110,
  logger = console,
} = {}) {
  const normalizedCard = validateAgentCard(agentCard)
  if (typeof executor !== 'function') throw new Error('Un executor A2A est obligatoire.')

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `${host}:${port}`}`)

      if (request.method === 'GET' && url.pathname === '/.well-known/agent-card.json') {
        sendJson(response, 200, normalizedCard, 'application/json')
        return
      }

      if (request.method === 'GET' && url.pathname === '/tasks') {
        const tasks = taskStore.list({
          contextId: url.searchParams.get('contextId') ?? undefined,
          state: url.searchParams.get('state') ?? undefined,
        })
        sendJson(response, 200, { tasks })
        return
      }

      const taskRoute = routeTaskId(url.pathname)
      if (request.method === 'GET' && taskRoute && !taskRoute.cancel) {
        const task = taskStore.get(taskRoute.taskId)
        if (!task) return sendJson(response, 404, { error: { code: 'TASK_NOT_FOUND', message: 'Tâche inconnue.' } })
        sendJson(response, 200, { task })
        return
      }

      if (request.method === 'POST' && taskRoute?.cancel) {
        const task = taskStore.cancel(taskRoute.taskId)
        sendJson(response, 200, { task })
        return
      }

      if (request.method === 'POST' && url.pathname === '/message:stream') {
        sendJson(response, 501, { error: { code: 'UNSUPPORTED_OPERATION', message: 'Le streaming A2A sera ajouté dans une tranche suivante.' } })
        return
      }

      if (request.method === 'POST' && url.pathname === '/message:send') {
        const payload = await readJson(request)
        if (!payload.message || typeof payload.message !== 'object') {
          return sendJson(response, 400, { error: { code: 'INVALID_ARGUMENT', message: 'message est obligatoire.' } })
        }

        let task = taskStore.create({
          message: payload.message,
          contextId: payload.contextId,
          metadata: payload.metadata,
        })
        task = taskStore.transition(task.id, A2A_TASK_STATES.WORKING)

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
          task = taskStore.transition(task.id, A2A_TASK_STATES.COMPLETED, { metadata: result?.metadata })
        } catch (error) {
          logger.error?.('[A2A] executor failure', error)
          task = taskStore.transition(task.id, A2A_TASK_STATES.FAILED, {
            metadata: { error: error instanceof Error ? error.message : String(error) },
          })
        }

        sendJson(response, 200, { task: taskStore.get(task.id) })
        return
      }

      sendJson(response, 404, { error: { code: 'NOT_FOUND', message: 'Route A2A inconnue.' } })
    } catch (error) {
      logger.error?.('[A2A] request failure', error)
      sendJson(response, 400, {
        error: { code: 'BAD_REQUEST', message: error instanceof Error ? error.message : String(error) },
      })
    }
  })

  return {
    agentCard: normalizedCard,
    taskStore,
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
