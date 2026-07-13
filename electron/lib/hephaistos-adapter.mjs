const DEFAULT_ENDPOINTS = Object.freeze({
  health: '/health',
  recall: '/memory/search',
  remember: '/memory/upsert',
  watchdog: '/watchdog/events',
  context: '/memory/context',
})

function requiredString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} est obligatoire.`)
  return value.trim()
}

export class HephaistosAdapter {
  constructor({
    baseUrl,
    token,
    endpoints = {},
    timeoutMs = 12_000,
    fetchImpl = fetch,
    workspaceId,
  } = {}) {
    this.baseUrl = new URL(requiredString(baseUrl, 'hephaistos.baseUrl'))
    this.token = token
    this.endpoints = { ...DEFAULT_ENDPOINTS, ...endpoints }
    this.timeoutMs = timeoutMs
    this.fetchImpl = fetchImpl
    this.workspaceId = workspaceId
  }

  static fromEnv(env = process.env, options = {}) {
    if (!env.HEPHAISTOS_BASE_URL) return undefined
    return new HephaistosAdapter({
      baseUrl: env.HEPHAISTOS_BASE_URL,
      token: env.HEPHAISTOS_TOKEN,
      workspaceId: env.HEPHAISTOS_WORKSPACE_ID,
      ...options,
    })
  }

  #url(endpointName) {
    const endpoint = this.endpoints[endpointName]
    if (!endpoint) throw new Error(`Endpoint Hephaistos non configuré: ${endpointName}`)
    return new URL(endpoint.replace(/^\//, ''), `${this.baseUrl.toString().replace(/\/$/, '')}/`)
  }

  async #request(endpointName, { method = 'GET', body } = {}) {
    const headers = { accept: 'application/json' }
    if (body !== undefined) headers['content-type'] = 'application/json'
    if (this.token) headers.authorization = `Bearer ${this.token}`

    const response = await this.fetchImpl(this.#url(endpointName), {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(this.timeoutMs),
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(payload.message ?? payload.error ?? `Hephaistos ${endpointName}: HTTP ${response.status}`)
    }
    return payload
  }

  async health() {
    return this.#request('health')
  }

  async isAvailable() {
    try {
      await this.health()
      return true
    } catch {
      return false
    }
  }

  async recall({ query, limit = 8, filters = {}, contextId } = {}) {
    return this.#request('recall', {
      method: 'POST',
      body: {
        query: requiredString(query, 'query'),
        limit,
        filters,
        workspaceId: this.workspaceId,
        contextId,
      },
    })
  }

  async remember({ content, tags = [], metadata = {}, contextId, sourceId } = {}) {
    return this.#request('remember', {
      method: 'POST',
      body: {
        content: requiredString(content, 'content'),
        tags,
        metadata,
        contextId,
        sourceId,
        workspaceId: this.workspaceId,
      },
    })
  }

  async unifiedContext({ contextId, taskId, agentName } = {}) {
    return this.#request('context', {
      method: 'POST',
      body: { contextId, taskId, agentName, workspaceId: this.workspaceId },
    })
  }

  async emitWatchdogEvent({ type, severity = 'info', message, metadata = {}, taskId, contextId } = {}) {
    return this.#request('watchdog', {
      method: 'POST',
      body: {
        type: requiredString(type, 'type'),
        severity,
        message: requiredString(message, 'message'),
        metadata,
        taskId,
        contextId,
        workspaceId: this.workspaceId,
        timestamp: new Date().toISOString(),
      },
    })
  }
}

export function createHephaistosHooks(adapter) {
  if (!adapter) {
    return {
      available: false,
      beforeTask: async () => undefined,
      afterTask: async () => undefined,
      onFailure: async () => undefined,
    }
  }

  return {
    available: true,
    async beforeTask({ query, contextId, taskId, agentName }) {
      const [memory, context] = await Promise.allSettled([
        adapter.recall({ query, contextId }),
        adapter.unifiedContext({ contextId, taskId, agentName }),
      ])
      await adapter.emitWatchdogEvent({
        type: 'a2a.task.started',
        message: `Tâche ${taskId} démarrée par ${agentName}.`,
        taskId,
        contextId,
      }).catch(() => undefined)
      return {
        memory: memory.status === 'fulfilled' ? memory.value : undefined,
        context: context.status === 'fulfilled' ? context.value : undefined,
      }
    },
    async afterTask({ content, tags, metadata, contextId, taskId, agentName }) {
      await Promise.allSettled([
        adapter.remember({ content, tags, metadata: { ...metadata, taskId, agentName }, contextId, sourceId: taskId }),
        adapter.emitWatchdogEvent({
          type: 'a2a.task.completed',
          message: `Tâche ${taskId} terminée par ${agentName}.`,
          taskId,
          contextId,
          metadata,
        }),
      ])
    },
    async onFailure({ error, contextId, taskId, agentName }) {
      await adapter.emitWatchdogEvent({
        type: 'a2a.task.failed',
        severity: 'error',
        message: error instanceof Error ? error.message : String(error),
        taskId,
        contextId,
        metadata: { agentName },
      }).catch(() => undefined)
    },
  }
}
