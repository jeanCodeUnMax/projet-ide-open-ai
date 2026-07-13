import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import path from 'node:path'

export const DEFAULT_TOOL_LIMIT = 100
const SERVER_NAME_PATTERN = /^[A-Za-z0-9._-]{1,80}$/
const ENV_PATTERN = /\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g

async function exists(filePath) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

export async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch {
    return structuredClone(fallback)
  }
}

export async function writeJsonAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.${process.pid}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  const { rename } = await import('node:fs/promises')
  await rename(temporaryPath, filePath)
}

export function defaultOpenFoxConfig({ port, workspace }) {
  return {
    providers: [],
    mcpServers: {},
    server: { port, host: '127.0.0.1', openBrowser: false },
    logging: { level: 'info' },
    database: { path: '' },
    workspace: { workdir: workspace },
    visionFallback: {
      enabled: false,
      url: 'http://localhost:11434',
      model: 'qwen3.5:0.8b',
      timeout: 120,
      backend: 'ollama',
    },
  }
}

export async function ensureOpenFoxBootstrap(paths, { port, workspace }) {
  await mkdir(paths.configDir, { recursive: true })
  await mkdir(paths.dataDir, { recursive: true })

  const defaults = defaultOpenFoxConfig({ port, workspace })
  const current = await readJson(paths.configPath, defaults)
  const merged = {
    ...defaults,
    ...current,
    server: { ...(current.server ?? {}), port, host: '127.0.0.1', openBrowser: false },
    workspace: { ...(current.workspace ?? {}), workdir: workspace },
  }
  await writeJsonAtomic(paths.configPath, merged)

  if (!(await exists(paths.authPath))) {
    await writeJsonAtomic(paths.authPath, { strategy: 'local', encryptedPassword: null })
  }

  if (!(await exists(paths.canonicalMcpPath))) {
    await writeJsonAtomic(paths.canonicalMcpPath, {
      toolLimit: DEFAULT_TOOL_LIMIT,
      mcpServers: sanitizeServerMap(current.mcpServers ?? {}),
    })
  }
}

export async function loadDesktopSettings(paths) {
  return readJson(paths.desktopSettingsPath, {})
}

export async function saveDesktopSettings(paths, settings) {
  await writeJsonAtomic(paths.desktopSettingsPath, settings)
}

export async function loadCanonicalMcp(paths) {
  const raw = await readJson(paths.canonicalMcpPath, { toolLimit: DEFAULT_TOOL_LIMIT, mcpServers: {} })
  return normalizeMcpDocument(raw)
}

export async function saveCanonicalMcp(paths, document) {
  const normalized = normalizeMcpDocument(document)
  await writeJsonAtomic(paths.canonicalMcpPath, normalized)
  return normalized
}

export function normalizeMcpDocument(input) {
  const source = input && typeof input === 'object' ? input : {}
  const candidateServers =
    source.mcpServers && typeof source.mcpServers === 'object'
      ? source.mcpServers
      : Object.fromEntries(Object.entries(source).filter(([key]) => key !== 'toolLimit'))
  const requestedLimit = Number(source.toolLimit ?? DEFAULT_TOOL_LIMIT)
  const toolLimit = Number.isInteger(requestedLimit)
    ? Math.max(1, Math.min(DEFAULT_TOOL_LIMIT, requestedLimit))
    : DEFAULT_TOOL_LIMIT
  return { toolLimit, mcpServers: sanitizeServerMap(candidateServers) }
}

export function sanitizeServerMap(serverMap) {
  if (!serverMap || typeof serverMap !== 'object' || Array.isArray(serverMap)) return {}
  const sanitized = {}
  for (const [name, config] of Object.entries(serverMap)) {
    sanitized[name] = validateServerConfig(name, config)
  }
  return sanitized
}

export function validateServerConfig(name, rawConfig) {
  if (!SERVER_NAME_PATTERN.test(name)) {
    throw new Error(`Nom MCP invalide: « ${name} ». Utilise lettres, chiffres, point, tiret ou underscore.`)
  }
  if (!rawConfig || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) {
    throw new Error(`Configuration invalide pour le MCP « ${name} ».`)
  }

  const inferredTransport = rawConfig.transport ?? (rawConfig.url || rawConfig.serverUrl ? 'http' : 'stdio')
  if (inferredTransport === 'sse') {
    throw new Error(`Le transport SSE du MCP « ${name} » n'est pas encore pris en charge par OpenFox.`)
  }
  if (inferredTransport !== 'stdio' && inferredTransport !== 'http') {
    throw new Error(`Transport invalide pour « ${name} »: ${String(inferredTransport)}.`)
  }

  const config = { transport: inferredTransport }
  if (inferredTransport === 'stdio') {
    if (typeof rawConfig.command !== 'string' || rawConfig.command.trim() === '') {
      throw new Error(`Le MCP stdio « ${name} » exige une commande.`)
    }
    config.command = rawConfig.command.trim()
    if (rawConfig.args !== undefined) config.args = stringArray(rawConfig.args, `${name}.args`)
    if (rawConfig.env !== undefined) config.env = stringRecord(rawConfig.env, `${name}.env`)
  } else {
    const url = rawConfig.url ?? rawConfig.serverUrl
    if (typeof url !== 'string') throw new Error(`Le MCP HTTP « ${name} » exige une URL.`)
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error(`L'URL de « ${name} » doit utiliser HTTP ou HTTPS.`)
    }
    config.url = parsed.toString()
    if (rawConfig.headers !== undefined) config.headers = stringRecord(rawConfig.headers, `${name}.headers`)
  }

  if (rawConfig.disabledTools !== undefined) {
    config.disabledTools = [...new Set(stringArray(rawConfig.disabledTools, `${name}.disabledTools`))]
  }
  return config
}

function stringArray(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${label} doit être un tableau de chaînes.`)
  }
  return value
}

function stringRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} doit être un objet clé/valeur.`)
  }
  const result = {}
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== 'string') throw new Error(`${label}.${key} doit être une chaîne.`)
    result[key] = item
  }
  return result
}

export function resolveEnvPlaceholders(value, env = process.env) {
  if (typeof value === 'string') {
    return value.replace(ENV_PATTERN, (_match, variableName) => {
      const resolved = env[variableName]
      if (resolved === undefined || resolved === '') {
        throw new Error(`Variable d'environnement manquante: ${variableName}`)
      }
      return resolved
    })
  }
  if (Array.isArray(value)) return value.map((item) => resolveEnvPlaceholders(item, env))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveEnvPlaceholders(item, env)]))
  }
  return value
}

function runtimeEnvironment(env) {
  const allowed = [
    'PATH',
    'Path',
    'HOME',
    'USERPROFILE',
    'HOMEDRIVE',
    'HOMEPATH',
    'APPDATA',
    'LOCALAPPDATA',
    'SystemRoot',
    'COMSPEC',
    'PATHEXT',
    'TEMP',
    'TMP',
    'SHELL',
    'LANG',
  ]
  return Object.fromEntries(allowed.filter((key) => env[key] !== undefined).map((key) => [key, env[key]]))
}

export async function syncCanonicalMcpToOpenFox(paths, env = process.env) {
  const canonical = await loadCanonicalMcp(paths)
  const resolvedServers = resolveEnvPlaceholders(canonical.mcpServers, env)
  const inherited = runtimeEnvironment(env)
  const runnableServers = Object.fromEntries(
    Object.entries(resolvedServers).map(([name, config]) => [
      name,
      config.transport === 'stdio'
        ? { ...config, env: { ...inherited, ...(config.env ?? {}) } }
        : config,
    ]),
  )
  const openfox = await readJson(paths.configPath, {})
  await writeJsonAtomic(paths.configPath, { ...openfox, mcpServers: runnableServers })
  return canonical
}

export async function setWorkspace(paths, workspace) {
  const current = await readJson(paths.configPath, {})
  await writeJsonAtomic(paths.configPath, {
    ...current,
    workspace: { ...(current.workspace ?? {}), workdir: workspace },
  })
  const settings = await loadDesktopSettings(paths)
  await saveDesktopSettings(paths, { ...settings, workspace })
}

export async function upsertCanonicalServer(paths, name, config) {
  const canonical = await loadCanonicalMcp(paths)
  canonical.mcpServers[name] = validateServerConfig(name, config)
  return saveCanonicalMcp(paths, canonical)
}

export async function removeCanonicalServer(paths, name) {
  const canonical = await loadCanonicalMcp(paths)
  delete canonical.mcpServers[name]
  return saveCanonicalMcp(paths, canonical)
}

export async function updateCanonicalDisabledTools(paths, serverName, disabledTools) {
  const canonical = await loadCanonicalMcp(paths)
  const server = canonical.mcpServers[serverName]
  if (!server) return canonical
  server.disabledTools = [...new Set(disabledTools)]
  return saveCanonicalMcp(paths, canonical)
}
