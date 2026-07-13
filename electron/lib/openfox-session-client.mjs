import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

function createHttpError(message, status, payload) {
  const error = new Error(message)
  error.name = 'OpenFoxHttpError'
  error.status = status
  error.payload = payload
  return error
}

function normalizePath(value) {
  const resolved = path.resolve(String(value ?? ''))
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function queueHasPending(value) {
  if (!value) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'number') return value > 0
  if (typeof value !== 'object') return false
  return Object.values(value).some((entry) => queueHasPending(entry))
}

function assistantMessages(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter((message) => message?.role === 'assistant' && typeof message.content === 'string' && message.content.trim())
}

export class OpenFoxSessionClient {
  constructor({
    baseUrl = 'http://127.0.0.1:10369',
    fetchImpl = fetch,
    requestTimeoutMs = 30_000,
    executionTimeoutMs = 15 * 60_000,
    pollIntervalMs = 500,
    sessionToken,
  } = {}) {
    const parsed = new URL(baseUrl)
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('OpenFox doit utiliser HTTP ou HTTPS.')
    if (!['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname) && !sessionToken) {
      throw new Error('Un token OpenFox est obligatoire pour une adresse non locale.')
    }
    this.baseUrl = parsed.toString().replace(/\/$/, '')
    this.fetchImpl = fetchImpl
    this.requestTimeoutMs = requestTimeoutMs
    this.executionTimeoutMs = executionTimeoutMs
    this.pollIntervalMs = pollIntervalMs
    this.sessionToken = sessionToken
  }

  async request(endpoint, { method = 'GET', body, timeoutMs = this.requestTimeoutMs } = {}) {
    const headers = { accept: 'application/json' }
    if (body !== undefined) headers['content-type'] = 'application/json'
    if (this.sessionToken) headers['x-session-token'] = this.sessionToken
    const response = await this.fetchImpl(new URL(endpoint, `${this.baseUrl}/`), {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(timeoutMs),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw createHttpError(payload.error ?? `OpenFox HTTP ${response.status}`, response.status, payload)
    }
    return payload
  }

  async health() {
    return this.request('/api/health')
  }

  async listProjects() {
    const payload = await this.request('/api/projects')
    return Array.isArray(payload.projects) ? payload.projects : []
  }

  async resolveProject({ workspace, projectId } = {}) {
    const projects = await this.listProjects()
    if (projectId) {
      const project = projects.find((entry) => entry.id === projectId)
      if (!project) throw createHttpError(`Projet OpenFox inconnu: ${projectId}`, 404, { projectId })
      return project
    }
    const target = normalizePath(workspace)
    const project = projects.find((entry) => normalizePath(entry.workdir) === target)
    if (!project) {
      const error = new Error(`Le workspace n'est pas encore enregistré comme projet OpenFox: ${workspace}`)
      error.name = 'OpenFoxProjectNotFoundError'
      error.code = 'OPENFOX_PROJECT_NOT_FOUND'
      error.projects = projects.map(({ id, name, workdir }) => ({ id, name, workdir }))
      throw error
    }
    return project
  }

  async createSession({ projectId, title } = {}) {
    const payload = await this.request('/api/sessions', {
      method: 'POST',
      body: { projectId, ...(title ? { title: String(title).slice(0, 100) } : {}) },
    })
    if (!payload.session?.id) throw new Error('OpenFox n’a pas renvoyé de session valide.')
    return payload.session
  }

  async getSession(sessionId) {
    return this.request(`/api/sessions/${encodeURIComponent(sessionId)}`)
  }

  async sendMessage(sessionId, content, { attachments, messageKind = 'user' } = {}) {
    if (typeof content !== 'string' || !content.trim()) throw new Error('Le message OpenFox doit être non vide.')
    return this.request(`/api/sessions/${encodeURIComponent(sessionId)}/message`, {
      method: 'POST',
      body: {
        content,
        ...(Array.isArray(attachments) && attachments.length ? { attachments } : {}),
        ...(messageKind ? { messageKind } : {}),
      },
    })
  }

  async stopSession(sessionId) {
    return this.request(`/api/sessions/${encodeURIComponent(sessionId)}/stop`, { method: 'POST' })
  }

  async waitForCompletion(sessionId, {
    baselineAssistantIds = [],
    timeoutMs = this.executionTimeoutMs,
  } = {}) {
    const baseline = new Set(baselineAssistantIds)
    const deadline = Date.now() + timeoutMs
    let lastState

    while (Date.now() < deadline) {
      lastState = await this.getSession(sessionId)
      const pendingQuestions = Array.isArray(lastState.pendingQuestions) ? lastState.pendingQuestions : []
      if (pendingQuestions.length > 0) {
        const error = new Error('OpenFox attend une réponse utilisateur avant de poursuivre.')
        error.name = 'OpenFoxInputRequiredError'
        error.pendingQuestions = pendingQuestions
        throw error
      }

      const freshMessages = assistantMessages(lastState.messages)
        .filter((message) => !baseline.has(message.id))
      const isRunning = Boolean(lastState.session?.isRunning)
      const queued = queueHasPending(lastState.queueState)

      if (!isRunning && !queued && freshMessages.length > 0) {
        return {
          ...lastState,
          assistantMessages: freshMessages,
          text: freshMessages.map((message) => message.content.trim()).join('\n\n'),
        }
      }
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs))
    }

    const error = new Error(`OpenFox n’a pas terminé la session ${sessionId} dans le délai imparti.`)
    error.name = 'OpenFoxExecutionTimeoutError'
    error.sessionId = sessionId
    error.lastState = lastState
    throw error
  }

  async execute({ workspace, projectId, sessionId, title, content, attachments, timeoutMs } = {}) {
    const project = await this.resolveProject({ workspace, projectId })
    let activeSessionId = sessionId
    let initial
    if (activeSessionId) {
      initial = await this.getSession(activeSessionId)
      if (initial.session?.projectId !== project.id) {
        throw new Error('La session OpenFox existante appartient à un autre projet.')
      }
    } else {
      const session = await this.createSession({ projectId: project.id, title })
      activeSessionId = session.id
      initial = await this.getSession(activeSessionId)
    }

    const baselineAssistantIds = assistantMessages(initial.messages).map((message) => message.id)
    await this.sendMessage(activeSessionId, content, { attachments })
    const result = await this.waitForCompletion(activeSessionId, { baselineAssistantIds, timeoutMs })
    return { ...result, project, sessionId: activeSessionId }
  }
}

export class OpenFoxSessionRegistry {
  constructor({ filePath } = {}) {
    if (!filePath) throw new Error('filePath est obligatoire pour le registre de sessions OpenFox.')
    this.filePath = path.resolve(filePath)
  }

  async read() {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8'))
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? { schemaVersion: '1.0.0', contexts: parsed.contexts ?? {} }
        : { schemaVersion: '1.0.0', contexts: {} }
    } catch {
      return { schemaVersion: '1.0.0', contexts: {} }
    }
  }

  async get(contextId) {
    const data = await this.read()
    const value = data.contexts[String(contextId)]
    return value ? structuredClone(value) : undefined
  }

  async set(contextId, value) {
    const data = await this.read()
    data.contexts[String(contextId)] = { ...structuredClone(value), updatedAt: new Date().toISOString() }
    await mkdir(path.dirname(this.filePath), { recursive: true })
    const temporary = `${this.filePath}.${process.pid}.tmp`
    await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
    await rename(temporary, this.filePath)
    return structuredClone(data.contexts[String(contextId)])
  }

  async remove(contextId) {
    const data = await this.read()
    const existed = delete data.contexts[String(contextId)]
    if (!existed) return false
    await mkdir(path.dirname(this.filePath), { recursive: true })
    const temporary = `${this.filePath}.${process.pid}.tmp`
    await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
    await rename(temporary, this.filePath)
    return true
  }
}

export { assistantMessages, queueHasPending }
