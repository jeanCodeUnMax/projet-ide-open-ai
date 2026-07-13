import { randomUUID } from 'node:crypto'

export const A2A_TASK_STATES = Object.freeze({
  UNSPECIFIED: 'TASK_STATE_UNSPECIFIED',
  SUBMITTED: 'TASK_STATE_SUBMITTED',
  WORKING: 'TASK_STATE_WORKING',
  INPUT_REQUIRED: 'TASK_STATE_INPUT_REQUIRED',
  AUTH_REQUIRED: 'TASK_STATE_AUTH_REQUIRED',
  COMPLETED: 'TASK_STATE_COMPLETED',
  FAILED: 'TASK_STATE_FAILED',
  CANCELED: 'TASK_STATE_CANCELED',
  REJECTED: 'TASK_STATE_REJECTED',
})

const TERMINAL_STATES = new Set([
  A2A_TASK_STATES.COMPLETED,
  A2A_TASK_STATES.FAILED,
  A2A_TASK_STATES.CANCELED,
  A2A_TASK_STATES.REJECTED,
])

const TRANSITIONS = new Map([
  [A2A_TASK_STATES.UNSPECIFIED, new Set([A2A_TASK_STATES.SUBMITTED])],
  [A2A_TASK_STATES.SUBMITTED, new Set([
    A2A_TASK_STATES.WORKING,
    A2A_TASK_STATES.REJECTED,
    A2A_TASK_STATES.CANCELED,
  ])],
  [A2A_TASK_STATES.WORKING, new Set([
    A2A_TASK_STATES.INPUT_REQUIRED,
    A2A_TASK_STATES.AUTH_REQUIRED,
    A2A_TASK_STATES.COMPLETED,
    A2A_TASK_STATES.FAILED,
    A2A_TASK_STATES.CANCELED,
  ])],
  [A2A_TASK_STATES.INPUT_REQUIRED, new Set([
    A2A_TASK_STATES.WORKING,
    A2A_TASK_STATES.CANCELED,
    A2A_TASK_STATES.FAILED,
  ])],
  [A2A_TASK_STATES.AUTH_REQUIRED, new Set([
    A2A_TASK_STATES.WORKING,
    A2A_TASK_STATES.CANCELED,
    A2A_TASK_STATES.FAILED,
  ])],
])

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} doit être une chaîne non vide.`)
  }
  return value.trim()
}

function assertStringArray(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim() === '')) {
    throw new Error(`${label} doit être un tableau de chaînes non vides.`)
  }
  return [...new Set(value.map((item) => item.trim()))]
}

export function validateAgentCard(rawCard) {
  if (!rawCard || typeof rawCard !== 'object' || Array.isArray(rawCard)) {
    throw new Error('AgentCard invalide.')
  }

  const supportedInterfaces = rawCard.supportedInterfaces
  if (!Array.isArray(supportedInterfaces) || supportedInterfaces.length === 0) {
    throw new Error('AgentCard.supportedInterfaces doit contenir au moins une interface.')
  }

  const normalizedInterfaces = supportedInterfaces.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`AgentCard.supportedInterfaces[${index}] est invalide.`)
    }
    const url = new URL(assertNonEmptyString(entry.url, `supportedInterfaces[${index}].url`))
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error(`L’interface A2A ${index} doit utiliser HTTP ou HTTPS.`)
    }
    return {
      url: url.toString().replace(/\/$/, ''),
      protocolBinding: assertNonEmptyString(entry.protocolBinding, `supportedInterfaces[${index}].protocolBinding`),
      protocolVersion: assertNonEmptyString(entry.protocolVersion, `supportedInterfaces[${index}].protocolVersion`),
      ...(entry.tenant ? { tenant: assertNonEmptyString(entry.tenant, `supportedInterfaces[${index}].tenant`) } : {}),
    }
  })

  const skills = rawCard.skills
  if (!Array.isArray(skills)) throw new Error('AgentCard.skills doit être un tableau.')
  const normalizedSkills = skills.map((skill, index) => {
    if (!skill || typeof skill !== 'object' || Array.isArray(skill)) {
      throw new Error(`AgentCard.skills[${index}] est invalide.`)
    }
    return {
      id: assertNonEmptyString(skill.id, `skills[${index}].id`),
      name: assertNonEmptyString(skill.name, `skills[${index}].name`),
      description: assertNonEmptyString(skill.description, `skills[${index}].description`),
      tags: assertStringArray(skill.tags ?? [], `skills[${index}].tags`),
      examples: assertStringArray(skill.examples ?? [], `skills[${index}].examples`),
      ...(skill.inputModes ? { inputModes: assertStringArray(skill.inputModes, `skills[${index}].inputModes`) } : {}),
      ...(skill.outputModes ? { outputModes: assertStringArray(skill.outputModes, `skills[${index}].outputModes`) } : {}),
    }
  })

  const capabilities = rawCard.capabilities && typeof rawCard.capabilities === 'object'
    ? structuredClone(rawCard.capabilities)
    : {}

  return {
    name: assertNonEmptyString(rawCard.name, 'AgentCard.name'),
    description: assertNonEmptyString(rawCard.description, 'AgentCard.description'),
    version: assertNonEmptyString(rawCard.version, 'AgentCard.version'),
    supportedInterfaces: normalizedInterfaces,
    capabilities,
    defaultInputModes: assertStringArray(rawCard.defaultInputModes, 'AgentCard.defaultInputModes'),
    defaultOutputModes: assertStringArray(rawCard.defaultOutputModes, 'AgentCard.defaultOutputModes'),
    skills: normalizedSkills,
    ...(rawCard.provider ? { provider: structuredClone(rawCard.provider) } : {}),
    ...(rawCard.documentationUrl ? { documentationUrl: new URL(rawCard.documentationUrl).toString() } : {}),
    ...(rawCard.securitySchemes ? { securitySchemes: structuredClone(rawCard.securitySchemes) } : {}),
    ...(rawCard.securityRequirements ? { securityRequirements: structuredClone(rawCard.securityRequirements) } : {}),
  }
}

export function createTextPart(text) {
  return { text: assertNonEmptyString(text, 'Part.text') }
}

export function createMessage({ role = 'ROLE_USER', parts, messageId = randomUUID(), metadata } = {}) {
  if (!['ROLE_USER', 'ROLE_AGENT'].includes(role)) throw new Error(`Rôle A2A invalide: ${role}`)
  if (!Array.isArray(parts) || parts.length === 0) throw new Error('Message.parts doit contenir au moins une partie.')
  return {
    role,
    parts: structuredClone(parts),
    messageId: assertNonEmptyString(messageId, 'Message.messageId'),
    ...(metadata ? { metadata: structuredClone(metadata) } : {}),
  }
}

export function createArtifact({ name, parts, artifactId = randomUUID(), description, metadata } = {}) {
  if (!Array.isArray(parts) || parts.length === 0) throw new Error('Artifact.parts doit contenir au moins une partie.')
  return {
    artifactId: assertNonEmptyString(artifactId, 'Artifact.artifactId'),
    name: assertNonEmptyString(name, 'Artifact.name'),
    parts: structuredClone(parts),
    ...(description ? { description: String(description) } : {}),
    ...(metadata ? { metadata: structuredClone(metadata) } : {}),
  }
}

export class AgentTaskStore {
  #tasks = new Map()

  create({ message, contextId = randomUUID(), metadata } = {}) {
    const task = {
      id: randomUUID(),
      contextId: assertNonEmptyString(contextId, 'Task.contextId'),
      status: {
        state: A2A_TASK_STATES.SUBMITTED,
        timestamp: new Date().toISOString(),
      },
      history: message ? [structuredClone(message)] : [],
      artifacts: [],
      ...(metadata ? { metadata: structuredClone(metadata) } : {}),
    }
    this.#tasks.set(task.id, task)
    return this.get(task.id)
  }

  get(taskId) {
    const task = this.#tasks.get(taskId)
    return task ? structuredClone(task) : undefined
  }

  list({ contextId, state } = {}) {
    return [...this.#tasks.values()]
      .filter((task) => !contextId || task.contextId === contextId)
      .filter((task) => !state || task.status.state === state)
      .map((task) => structuredClone(task))
  }

  transition(taskId, nextState, { message, metadata } = {}) {
    const task = this.#tasks.get(taskId)
    if (!task) throw new Error(`Tâche A2A inconnue: ${taskId}`)
    const currentState = task.status.state
    const allowed = TRANSITIONS.get(currentState) ?? new Set()
    if (!allowed.has(nextState)) {
      throw new Error(`Transition A2A interdite: ${currentState} → ${nextState}`)
    }
    task.status = {
      state: nextState,
      timestamp: new Date().toISOString(),
      ...(message ? { message: structuredClone(message) } : {}),
    }
    if (metadata) task.metadata = { ...(task.metadata ?? {}), ...structuredClone(metadata) }
    return this.get(taskId)
  }

  appendMessage(taskId, message) {
    const task = this.#tasks.get(taskId)
    if (!task) throw new Error(`Tâche A2A inconnue: ${taskId}`)
    task.history.push(structuredClone(message))
    return this.get(taskId)
  }

  addArtifact(taskId, artifact) {
    const task = this.#tasks.get(taskId)
    if (!task) throw new Error(`Tâche A2A inconnue: ${taskId}`)
    task.artifacts.push(structuredClone(artifact))
    return this.get(taskId)
  }

  cancel(taskId) {
    const task = this.#tasks.get(taskId)
    if (!task) throw new Error(`Tâche A2A inconnue: ${taskId}`)
    if (TERMINAL_STATES.has(task.status.state)) return this.get(taskId)
    return this.transition(taskId, A2A_TASK_STATES.CANCELED)
  }
}

export class AgentRegistry {
  #cards = new Map()

  register(card) {
    const normalized = validateAgentCard(card)
    this.#cards.set(normalized.name, normalized)
    return structuredClone(normalized)
  }

  remove(agentName) {
    return this.#cards.delete(agentName)
  }

  get(agentName) {
    const card = this.#cards.get(agentName)
    return card ? structuredClone(card) : undefined
  }

  list() {
    return [...this.#cards.values()].map((card) => structuredClone(card))
  }

  findByTags(tags, { requireAll = false } = {}) {
    const requested = new Set(assertStringArray(tags, 'tags').map((tag) => tag.toLowerCase()))
    return this.list()
      .map((card) => {
        const agentTags = new Set(card.skills.flatMap((skill) => skill.tags.map((tag) => tag.toLowerCase())))
        const matches = [...requested].filter((tag) => agentTags.has(tag)).length
        return { card, matches }
      })
      .filter(({ matches }) => requireAll ? matches === requested.size : matches > 0)
      .sort((a, b) => b.matches - a.matches)
      .map(({ card }) => card)
  }
}

export class A2AClient {
  constructor({ fetchImpl = fetch, timeoutMs = 30_000 } = {}) {
    this.fetchImpl = fetchImpl
    this.timeoutMs = timeoutMs
  }

  async discover(agentBaseUrl) {
    const url = new URL('/.well-known/agent-card.json', agentBaseUrl)
    const response = await this.fetchImpl(url, { signal: AbortSignal.timeout(this.timeoutMs) })
    if (!response.ok) throw new Error(`Découverte A2A impossible (${response.status}).`)
    return validateAgentCard(await response.json())
  }

  async sendMessage(card, message, { contextId, metadata, headers = {} } = {}) {
    const normalized = validateAgentCard(card)
    const endpoint = new URL('/message:send', normalized.supportedInterfaces[0].url)
    const response = await this.fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/a2a+json', accept: 'application/a2a+json', ...headers },
      body: JSON.stringify({ message, ...(contextId ? { contextId } : {}), ...(metadata ? { metadata } : {}) }),
      signal: AbortSignal.timeout(this.timeoutMs),
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body.error?.message ?? `Échec A2A (${response.status}).`)
    return body.task ?? body
  }
}
