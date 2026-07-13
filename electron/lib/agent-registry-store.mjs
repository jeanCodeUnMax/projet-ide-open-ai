import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { A2AClient, validateAgentCard } from './a2a-protocol.mjs'

const REGISTRY_SCHEMA_VERSION = '1.0.0'

function normalizeUrl(value) {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Une URL d’agent A2A doit utiliser HTTP ou HTTPS.')
  }
  return url.toString().replace(/\/$/, '')
}

function registryKey(card) {
  return `${card.name}::${card.supportedInterfaces[0]?.url ?? ''}`
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch {
    return structuredClone(fallback)
  }
}

async function writeJsonAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.${process.pid}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, filePath)
}

function emptyRegistry() {
  return {
    schemaVersion: REGISTRY_SCHEMA_VERSION,
    updatedAt: new Date(0).toISOString(),
    agents: [],
  }
}

export function normalizeAgentRegistry(value) {
  const source = value && typeof value === 'object' ? value : {}
  const agents = Array.isArray(source.agents) ? source.agents : []
  const unique = new Map()

  for (const item of agents) {
    try {
      const card = validateAgentCard(item.card ?? item)
      const entry = {
        card,
        enabled: item.enabled !== false,
        sourceUrl: item.sourceUrl ? normalizeUrl(item.sourceUrl) : card.supportedInterfaces[0]?.url,
        addedAt: typeof item.addedAt === 'string' ? item.addedAt : new Date(0).toISOString(),
        lastSeenAt: typeof item.lastSeenAt === 'string' ? item.lastSeenAt : undefined,
      }
      unique.set(registryKey(card), entry)
    } catch {
      // Ignore corrupted entries instead of breaking the complete workspace.
    }
  }

  return {
    schemaVersion: REGISTRY_SCHEMA_VERSION,
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : new Date(0).toISOString(),
    agents: [...unique.values()].sort((a, b) => a.card.name.localeCompare(b.card.name)),
  }
}

export class AgentRegistryStore {
  constructor({ workspace, builtinCardPath, client = new A2AClient() } = {}) {
    if (!workspace) throw new Error('workspace est obligatoire pour le registre A2A.')
    this.workspace = path.resolve(workspace)
    this.registryPath = path.join(this.workspace, '.ide-ai', 'agents', 'index.json')
    this.builtinCardPath = builtinCardPath
    this.client = client
  }

  async #read() {
    return normalizeAgentRegistry(await readJson(this.registryPath, emptyRegistry()))
  }

  async #write(registry) {
    const normalized = normalizeAgentRegistry({
      ...registry,
      updatedAt: new Date().toISOString(),
    })
    await writeJsonAtomic(this.registryPath, normalized)
    return normalized
  }

  async #builtinEntry() {
    if (!this.builtinCardPath) return undefined
    const card = validateAgentCard(JSON.parse(await readFile(this.builtinCardPath, 'utf8')))
    return {
      card,
      enabled: true,
      builtin: true,
      sourceUrl: card.supportedInterfaces[0]?.url,
      addedAt: new Date(0).toISOString(),
    }
  }

  async list() {
    const registry = await this.#read()
    const entries = [...registry.agents]
    const builtin = await this.#builtinEntry().catch(() => undefined)
    if (builtin && !entries.some((entry) => registryKey(entry.card) === registryKey(builtin.card))) {
      entries.unshift(builtin)
    }
    return {
      schemaVersion: registry.schemaVersion,
      updatedAt: registry.updatedAt,
      agents: entries,
      registryPath: this.registryPath,
    }
  }

  async discover(agentUrl) {
    const sourceUrl = normalizeUrl(agentUrl)
    const card = await this.client.discover(sourceUrl)
    return { card, sourceUrl }
  }

  async add(agentUrl) {
    const discovered = await this.discover(agentUrl)
    const registry = await this.#read()
    const key = registryKey(discovered.card)
    const entry = {
      card: discovered.card,
      sourceUrl: discovered.sourceUrl,
      enabled: true,
      addedAt: registry.agents.find((item) => registryKey(item.card) === key)?.addedAt ?? new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    }
    const agents = registry.agents.filter((item) => registryKey(item.card) !== key)
    agents.push(entry)
    await this.#write({ ...registry, agents })
    return entry
  }

  async remove(agentName) {
    const registry = await this.#read()
    const agents = registry.agents.filter((entry) => entry.card.name !== agentName)
    if (agents.length === registry.agents.length) return false
    await this.#write({ ...registry, agents })
    return true
  }

  async setEnabled(agentName, enabled) {
    const registry = await this.#read()
    let changed = false
    const agents = registry.agents.map((entry) => {
      if (entry.card.name !== agentName) return entry
      changed = true
      return { ...entry, enabled: Boolean(enabled) }
    })
    if (!changed) throw new Error(`Agent A2A inconnu: ${agentName}`)
    await this.#write({ ...registry, agents })
    return Boolean(enabled)
  }

  async refresh(agentName) {
    const registry = await this.#read()
    const current = registry.agents.find((entry) => entry.card.name === agentName)
    if (!current) throw new Error(`Agent A2A inconnu: ${agentName}`)
    const card = await this.client.discover(current.sourceUrl)
    const agents = registry.agents.map((entry) => entry.card.name === agentName
      ? { ...entry, card, lastSeenAt: new Date().toISOString() }
      : entry)
    await this.#write({ ...registry, agents })
    return card
  }
}
