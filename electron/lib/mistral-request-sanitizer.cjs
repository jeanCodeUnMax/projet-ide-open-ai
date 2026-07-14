'use strict'

const { spawn, spawnSync } = require('node:child_process')
const { existsSync } = require('node:fs')
const path = require('node:path')

const INTERNAL_ASSISTANT_FIELDS = Object.freeze([
  'reasoning',
  'reasoning_content',
  'thinking',
])

// OpenFox uses this backend-specific option for local engines such as vLLM.
// Mistral's hosted /chat/completions schema is strict and rejects it with 422.
const UNSUPPORTED_MISTRAL_ROOT_FIELDS = Object.freeze([
  'chat_template_kwargs',
])

const MISTRAL_MODEL_PATTERN = /(?:^|[\/:._-])(mistral|devstral|codestral|ministral|pixtral)(?:$|[\/:._-])/i
const QWEN_MODEL_PATTERN = /qwen/i
const CONTINUATION_PATTERN = /^Continue your previous response(?: exactly where you left off)?\.?/i
const INTERNAL_OLLAMA_ALIAS_PREFIX = 'ide-ai-optimized-'
const DEFAULT_OLLAMA_CONTEXT_LENGTH = 32_768
const DEFAULT_OLLAMA_MIN_OUTPUT_TOKENS = 1_024
const DEFAULT_OLLAMA_MAX_OUTPUT_TOKENS = 4_096
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

const defaultAliasCache = new Map()
const ollamaStartupPromises = new Map()

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(maximum, Math.max(minimum, parsed))
}

function configuredOllamaContextLength(env = process.env) {
  return boundedInteger(
    env.IDE_AI_OLLAMA_CONTEXT_LENGTH ?? env.OLLAMA_CONTEXT_LENGTH,
    DEFAULT_OLLAMA_CONTEXT_LENGTH,
    8_192,
    131_072,
  )
}

function configuredOllamaMinOutputTokens(env = process.env) {
  return boundedInteger(
    env.IDE_AI_OLLAMA_MIN_OUTPUT_TOKENS,
    DEFAULT_OLLAMA_MIN_OUTPUT_TOKENS,
    256,
    8_192,
  )
}

function configuredOllamaMaxOutputTokens(env = process.env) {
  return boundedInteger(
    env.IDE_AI_OLLAMA_MAX_OUTPUT_TOKENS,
    DEFAULT_OLLAMA_MAX_OUTPUT_TOKENS,
    512,
    16_384,
  )
}

function urlFromInput(input) {
  const value = typeof input === 'string'
    ? input
    : (typeof URL !== 'undefined' && input instanceof URL)
      ? input.href
      : input?.url ?? ''
  try {
    return new URL(value)
  } catch {
    return undefined
  }
}

function configuredOllamaPort(env = process.env) {
  const configuredHost = env.OLLAMA_HOST
  if (configuredHost) {
    try {
      const withProtocol = /^[a-z]+:\/\//i.test(configuredHost) ? configuredHost : `http://${configuredHost}`
      return new URL(withProtocol).port || '11434'
    } catch {
      // Use Ollama's default port when OLLAMA_HOST is malformed.
    }
  }
  return '11434'
}

function isLocalOllamaUrl(parsedUrl, env = process.env) {
  if (!parsedUrl || !LOOPBACK_HOSTS.has(parsedUrl.hostname)) return false
  return (parsedUrl.port || (parsedUrl.protocol === 'https:' ? '443' : '80')) === configuredOllamaPort(env)
}

function requestTargetsMistral(url, payload) {
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    if (hostname === 'api.mistral.ai' || hostname.endsWith('.mistral.ai')) return true
  } catch {
    // A relative or malformed URL can still be identified by the model name.
  }

  return typeof payload?.model === 'string' && MISTRAL_MODEL_PATTERN.test(payload.model)
}

function sanitizeMistralChatPayload(payload, { url = '' } = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload
  if (!Array.isArray(payload.messages)) return payload
  if (!requestTargetsMistral(url, payload)) return payload

  let changed = false
  const cleanPayload = { ...payload }

  for (const field of UNSUPPORTED_MISTRAL_ROOT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(cleanPayload, field)) {
      delete cleanPayload[field]
      changed = true
    }
  }

  const messages = payload.messages.map((message) => {
    if (!message || typeof message !== 'object' || Array.isArray(message) || message.role !== 'assistant') {
      return message
    }

    const clean = { ...message }
    for (const field of INTERNAL_ASSISTANT_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(clean, field)) {
        delete clean[field]
        changed = true
      }
    }
    return clean
  })

  if (!changed) return payload
  cleanPayload.messages = messages
  return cleanPayload
}

function isQwenModel(model) {
  return typeof model === 'string' && QWEN_MODEL_PATTERN.test(model)
}

function normalizedAliasComponent(model) {
  return String(model)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 54) || 'model'
}

function ollamaAliasForModel(model, contextLength = DEFAULT_OLLAMA_CONTEXT_LENGTH) {
  const contextK = Math.round(contextLength / 1_024)
  return `${INTERNAL_OLLAMA_ALIAS_PREFIX}${normalizedAliasComponent(model)}-ctx${contextK}k:latest`
}

function isWarmupPayload(payload) {
  return payload?.max_tokens === 1
    && Number(payload?.temperature) === 0
    && Array.isArray(payload?.messages)
    && payload.messages.length === 1
    && payload.messages[0]?.role === 'system'
}

function removeTruncationArtifacts(messages) {
  const clean = []
  for (const message of messages) {
    const isContinuation = message?.role === 'user'
      && typeof message.content === 'string'
      && CONTINUATION_PATTERN.test(message.content.trim())

    if (isContinuation) {
      const previous = clean.at(-1)
      const previousContent = typeof previous?.content === 'string' ? previous.content.trim() : ''
      const previousHasTools = Array.isArray(previous?.tool_calls) && previous.tool_calls.length > 0
      if (previous?.role === 'assistant' && previousContent.length <= 32 && !previousHasTools) clean.pop()
      continue
    }
    clean.push(message)
  }
  return clean
}

function sanitizeOllamaChatPayload(payload, {
  modelAlias,
  minimumOutputTokens = DEFAULT_OLLAMA_MIN_OUTPUT_TOKENS,
  maximumOutputTokens = DEFAULT_OLLAMA_MAX_OUTPUT_TOKENS,
} = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload
  if (!Array.isArray(payload.messages) || !isQwenModel(payload.model)) return payload

  const warmup = isWarmupPayload(payload)
  const clean = { ...payload }
  if (modelAlias) clean.model = modelAlias

  delete clean.chat_template_kwargs
  delete clean.reasoning
  clean.reasoning_effort = 'none'

  const withoutArtifacts = removeTruncationArtifacts(payload.messages)
  clean.messages = withoutArtifacts.map((message) => {
    if (!message || typeof message !== 'object' || Array.isArray(message) || message.role !== 'assistant') {
      return message
    }
    const assistant = { ...message }
    for (const field of INTERNAL_ASSISTANT_FIELDS) delete assistant[field]
    return assistant
  })

  if (!warmup) {
    const requested = Number(payload.max_tokens)
    clean.max_tokens = Number.isFinite(requested)
      ? Math.min(maximumOutputTokens, Math.max(minimumOutputTokens, requested))
      : minimumOutputTokens

    const temperature = Number(payload.temperature)
    clean.temperature = Number.isFinite(temperature) ? Math.min(0.2, Math.max(0, temperature)) : 0.2
    const topP = Number(payload.top_p)
    clean.top_p = Number.isFinite(topP) ? Math.min(0.9, Math.max(0.1, topP)) : 0.9
  }

  return clean
}

function detectedModelContext(modelInfo) {
  if (!modelInfo || typeof modelInfo !== 'object') return undefined
  const values = []
  for (const [key, value] of Object.entries(modelInfo)) {
    if (!/context_length$/i.test(key)) continue
    const numeric = Number(value)
    if (Number.isFinite(numeric) && numeric > 0) values.push(numeric)
  }
  return values.length > 0 ? Math.max(...values) : undefined
}

function normalizeOllamaShowPayload(payload, {
  model,
  contextLength = DEFAULT_OLLAMA_CONTEXT_LENGTH,
} = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !isQwenModel(model)) return payload
  const modelInfo = payload.model_info && typeof payload.model_info === 'object'
    ? payload.model_info
    : {}
  const modelMaximum = detectedModelContext(modelInfo)
  const effectiveContext = modelMaximum
    ? Math.min(contextLength, modelMaximum)
    : contextLength

  return {
    ...payload,
    model_info: {
      ...modelInfo,
      context_length: effectiveContext,
    },
  }
}

function filterInternalOllamaAliases(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.models)) return payload
  return {
    ...payload,
    models: payload.models.filter((model) => {
      const name = model?.model ?? model?.name ?? ''
      return !String(name).startsWith(INTERNAL_OLLAMA_ALIAS_PREFIX)
    }),
  }
}

function responseWithJson(response, payload) {
  if (typeof Response !== 'function') return response
  const headers = new Headers(response.headers)
  headers.delete('content-length')
  headers.delete('content-encoding')
  headers.set('content-type', 'application/json')
  return new Response(JSON.stringify(payload), {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

async function parseRequestBody(init) {
  if (typeof init?.body !== 'string') return undefined
  try {
    return JSON.parse(init.body)
  } catch {
    return undefined
  }
}

async function probeOllama(nativeFetch, origin) {
  try {
    const response = await nativeFetch(`${origin}/api/tags`, {
      signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(1_500) : undefined,
    })
    return Boolean(response?.ok)
  } catch {
    return false
  }
}

function locateOllamaBinary(env = process.env) {
  const localAppData = env.LOCALAPPDATA
  const candidates = [
    env.IDE_AI_OLLAMA_BINARY,
    localAppData ? path.join(localAppData, 'Programs', 'Ollama', 'ollama.exe') : undefined,
    localAppData ? path.join(localAppData, 'Ollama', 'ollama.exe') : undefined,
    'ollama',
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (path.isAbsolute(candidate) && !existsSync(candidate)) continue
    const result = spawnSync(candidate, ['--version'], {
      encoding: 'utf8',
      timeout: 4_000,
      windowsHide: true,
      stdio: 'ignore',
    })
    if (!result.error && result.status === 0) return candidate
  }
  return undefined
}

async function startLocalOllama(nativeFetch, origin, contextLength, env = process.env) {
  if (await probeOllama(nativeFetch, origin)) return { started: false, origin }
  if (ollamaStartupPromises.has(origin)) return ollamaStartupPromises.get(origin)

  const startup = (async () => {
    const binary = locateOllamaBinary(env)
    if (!binary) throw new Error('Ollama est introuvable. Installe Ollama ou définis IDE_AI_OLLAMA_BINARY.')

    const parsedOrigin = new URL(origin)
    const host = parsedOrigin.hostname.includes(':') ? `[${parsedOrigin.hostname.replace(/^\[|\]$/g, '')}]` : parsedOrigin.hostname
    const child = spawn(binary, ['serve'], {
      env: {
        ...env,
        OLLAMA_CONTEXT_LENGTH: String(contextLength),
        OLLAMA_HOST: `${host}:${parsedOrigin.port || '11434'}`,
      },
      stdio: 'ignore',
      windowsHide: true,
      detached: true,
    })
    child.unref()

    const deadline = Date.now() + 20_000
    while (Date.now() < deadline) {
      if (await probeOllama(nativeFetch, origin)) return { started: true, origin, pid: child.pid }
      await new Promise((resolve) => setTimeout(resolve, 350))
    }
    throw new Error(`Ollama ne répond pas sur ${origin} après son démarrage.`)
  })().finally(() => ollamaStartupPromises.delete(origin))

  ollamaStartupPromises.set(origin, startup)
  return startup
}

async function ensureOptimizedOllamaAlias(nativeFetch, {
  origin,
  sourceModel,
  contextLength,
  aliasCache = defaultAliasCache,
} = {}) {
  const alias = ollamaAliasForModel(sourceModel, contextLength)
  const cacheKey = `${origin}|${sourceModel}|${contextLength}`
  if (aliasCache.has(cacheKey)) return aliasCache.get(cacheKey)

  const creation = (async () => {
    const response = await nativeFetch(`${origin}/api/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: alias,
        from: sourceModel,
        parameters: { num_ctx: contextLength },
        stream: false,
      }),
    })
    const body = await response.text().catch(() => '')
    if (!response.ok) {
      throw new Error(`Création du profil Ollama optimisé impossible (${response.status})${body ? ` : ${body}` : ''}`)
    }
    return alias
  })().catch((error) => {
    aliasCache.delete(cacheKey)
    throw error
  })

  aliasCache.set(cacheKey, creation)
  return creation
}

function createProviderFetchGuard(nativeFetch, {
  contextLength = configuredOllamaContextLength(),
  minimumOutputTokens = configuredOllamaMinOutputTokens(),
  maximumOutputTokens = configuredOllamaMaxOutputTokens(),
  ensureOllama = (origin) => startLocalOllama(nativeFetch, origin, contextLength),
  aliasCache = defaultAliasCache,
  logger = console,
} = {}) {
  if (typeof nativeFetch !== 'function') throw new Error('Une fonction fetch native est requise.')

  return async function providerCompatibleFetch(input, init) {
    const parsedUrl = urlFromInput(input)
    const url = parsedUrl?.href ?? ''
    const localOllama = isLocalOllamaUrl(parsedUrl)
    const pathname = parsedUrl?.pathname ?? ''

    if (localOllama && /\/(?:api\/tags|api\/show|v1\/models|v1\/chat\/completions)$/.test(pathname)) {
      await ensureOllama(parsedUrl.origin)
    }

    if (localOllama && /\/api\/tags$/.test(pathname)) {
      const response = await nativeFetch(input, init)
      if (!response?.ok || typeof response.clone !== 'function') return response
      try {
        return responseWithJson(response, filterInternalOllamaAliases(await response.clone().json()))
      } catch {
        return response
      }
    }

    if (localOllama && /\/api\/show$/.test(pathname)) {
      const requestPayload = await parseRequestBody(init)
      const response = await nativeFetch(input, init)
      if (!response?.ok || typeof response.clone !== 'function') return response
      try {
        const body = await response.clone().json()
        const model = requestPayload?.model ?? requestPayload?.name
        return responseWithJson(response, normalizeOllamaShowPayload(body, { model, contextLength }))
      } catch {
        return response
      }
    }

    if (/\/chat\/completions(?:\?|$)/i.test(url) && typeof init?.body === 'string') {
      const payload = await parseRequestBody(init)
      if (payload) {
        if (localOllama && isQwenModel(payload.model)) {
          let modelAlias
          try {
            modelAlias = await ensureOptimizedOllamaAlias(nativeFetch, {
              origin: parsedUrl.origin,
              sourceModel: payload.model,
              contextLength,
              aliasCache,
            })
          } catch (error) {
            logger.error?.('[IDE-AI Ollama] Profil optimisé indisponible, utilisation du modèle original.', error)
          }

          const optimized = sanitizeOllamaChatPayload(payload, {
            modelAlias,
            minimumOutputTokens,
            maximumOutputTokens,
          })
          return nativeFetch(input, { ...init, body: JSON.stringify(optimized) })
        }

        const sanitized = sanitizeMistralChatPayload(payload, { url })
        if (sanitized !== payload) {
          return nativeFetch(input, { ...init, body: JSON.stringify(sanitized) })
        }
      }
    }

    return nativeFetch(input, init)
  }
}

function installProviderFetchGuard(target = globalThis) {
  if (target.__ideAiProviderFetchGuardInstalled || target.__ideAiMistralFetchGuardInstalled) return false
  if (typeof target.fetch !== 'function') throw new Error('fetch global est indisponible dans le processus OpenFox.')

  const nativeFetch = target.fetch.bind(target)
  target.fetch = createProviderFetchGuard(nativeFetch)
  for (const marker of ['__ideAiProviderFetchGuardInstalled', '__ideAiMistralFetchGuardInstalled']) {
    Object.defineProperty(target, marker, {
      value: true,
      configurable: false,
      enumerable: false,
      writable: false,
    })
  }
  return true
}

module.exports = {
  configuredOllamaContextLength,
  createMistralFetchGuard: createProviderFetchGuard,
  createProviderFetchGuard,
  ensureOptimizedOllamaAlias,
  filterInternalOllamaAliases,
  installMistralFetchGuard: installProviderFetchGuard,
  installProviderFetchGuard,
  normalizeOllamaShowPayload,
  ollamaAliasForModel,
  removeTruncationArtifacts,
  sanitizeMistralChatPayload,
  sanitizeOllamaChatPayload,
}
