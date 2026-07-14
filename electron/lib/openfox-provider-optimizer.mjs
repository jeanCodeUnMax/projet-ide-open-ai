import { readJson, writeJsonAtomic } from './config-store.mjs'

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])
const QWEN_MODEL_PATTERN = /qwen/i

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(maximum, Math.max(minimum, parsed))
}

export function configuredLocalContext(env = process.env) {
  return boundedInteger(
    env.IDE_AI_OLLAMA_CONTEXT_LENGTH ?? env.OLLAMA_CONTEXT_LENGTH,
    32_768,
    8_192,
    131_072,
  )
}

export function isLocalOllamaProvider(provider) {
  if (!provider || typeof provider !== 'object') return false
  if (String(provider.backend ?? '').toLowerCase() === 'ollama') return true
  try {
    const url = new URL(provider.url)
    return LOOPBACK_HOSTS.has(url.hostname) && (url.port || '80') === '11434'
  } catch {
    return false
  }
}

export function optimizeLocalProviderDocument(document, {
  contextWindow = configuredLocalContext(),
  maxOutputTokens = 4_096,
} = {}) {
  if (!document || typeof document !== 'object' || !Array.isArray(document.providers)) return document

  let changed = false
  const providers = document.providers.map((provider) => {
    if (!isLocalOllamaProvider(provider) || !Array.isArray(provider.models)) return provider

    const models = provider.models.map((model) => {
      if (!model || typeof model !== 'object' || !QWEN_MODEL_PATTERN.test(String(model.id ?? ''))) return model

      const optimized = {
        ...model,
        contextWindow,
        maxTokens: maxOutputTokens,
        thinkingEnabled: false,
        nonThinkingEnabled: true,
        source: 'user',
      }
      delete optimized.thinkingExtraKwargs
      delete optimized.thinkingQueryParams
      changed = changed || JSON.stringify(optimized) !== JSON.stringify(model)
      return optimized
    })

    return models === provider.models ? provider : { ...provider, models }
  })

  return changed ? { ...document, providers } : document
}

export async function optimizeOpenFoxLocalProviders(paths, options = {}) {
  const current = await readJson(paths.configPath, {})
  const optimized = optimizeLocalProviderDocument(current, options)
  if (optimized !== current) await writeJsonAtomic(paths.configPath, optimized)
  return optimized
}
