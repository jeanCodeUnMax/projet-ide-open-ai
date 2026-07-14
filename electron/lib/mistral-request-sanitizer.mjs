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

function requestTargetsMistral(url, payload) {
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    if (hostname === 'api.mistral.ai' || hostname.endsWith('.mistral.ai')) return true
  } catch {
    // A relative or malformed URL can still be identified by the model name.
  }

  return typeof payload?.model === 'string' && MISTRAL_MODEL_PATTERN.test(payload.model)
}

export function sanitizeMistralChatPayload(payload, { url = '' } = {}) {
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

export function createMistralFetchGuard(nativeFetch) {
  if (typeof nativeFetch !== 'function') throw new Error('Une fonction fetch native est requise.')

  return async function mistralCompatibleFetch(input, init) {
    const url = typeof input === 'string' || input instanceof URL
      ? String(input)
      : input?.url ?? ''

    if (!/\/chat\/completions(?:\?|$)/i.test(url) || typeof init?.body !== 'string') {
      return nativeFetch(input, init)
    }

    try {
      const payload = JSON.parse(init.body)
      const sanitized = sanitizeMistralChatPayload(payload, { url })
      if (sanitized !== payload) {
        return nativeFetch(input, { ...init, body: JSON.stringify(sanitized) })
      }
    } catch {
      // Preserve the original request when the body is not JSON.
    }

    return nativeFetch(input, init)
  }
}

export function installMistralFetchGuard(target = globalThis) {
  if (target.__ideAiMistralFetchGuardInstalled) return false
  if (typeof target.fetch !== 'function') throw new Error('fetch global est indisponible dans le processus OpenFox.')

  const nativeFetch = target.fetch.bind(target)
  target.fetch = createMistralFetchGuard(nativeFetch)
  Object.defineProperty(target, '__ideAiMistralFetchGuardInstalled', {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  })
  return true
}
