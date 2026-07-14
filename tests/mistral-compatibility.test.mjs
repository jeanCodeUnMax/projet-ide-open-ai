import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import sanitizer from '../electron/lib/mistral-request-sanitizer.cjs'

const {
  createMistralFetchGuard,
  createProviderFetchGuard,
  filterInternalOllamaAliases,
  normalizeOllamaShowPayload,
  ollamaAliasForModel,
  removeTruncationArtifacts,
  sanitizeMistralChatPayload,
  sanitizeOllamaChatPayload,
} = sanitizer

const runtimeUrl = new URL('../electron/lib/openfox-runtime.mjs', import.meta.url)
const preloadUrl = new URL('../electron/openfox-mistral-fetch-guard.cjs', import.meta.url)
const sanitizerUrl = new URL('../electron/lib/mistral-request-sanitizer.cjs', import.meta.url)

test('le garde retire les champs de raisonnement internes et les options backend des requêtes Mistral', () => {
  const payload = {
    model: 'mistral-small-latest',
    chat_template_kwargs: { enable_thinking: true },
    messages: [
      { role: 'user', content: 'HI' },
      {
        role: 'assistant',
        content: 'Bonjour',
        reasoning: 'raisonnement interne',
        reasoning_content: 'autre raisonnement',
        thinking: 'pensée interne',
      },
    ],
  }

  const sanitized = sanitizeMistralChatPayload(payload, {
    url: 'https://api.mistral.ai/v1/chat/completions',
  })

  assert.notEqual(sanitized, payload)
  assert.equal('chat_template_kwargs' in sanitized, false)
  assert.deepEqual(sanitized.messages[1], { role: 'assistant', content: 'Bonjour' })
  assert.equal(payload.messages[1].reasoning, 'raisonnement interne')
  assert.deepEqual(payload.chat_template_kwargs, { enable_thinking: true })
})

test('le garde conserve les champs pour un fournisseur non Mistral', () => {
  const payload = {
    model: 'provider-reasoning-model',
    chat_template_kwargs: { enable_thinking: true },
    messages: [{ role: 'assistant', content: 'ok', reasoning: 'supported' }],
  }

  const sanitized = sanitizeMistralChatPayload(payload, {
    url: 'https://example.com/v1/chat/completions',
  })

  assert.equal(sanitized, payload)
})

test('le garde fetch réécrit uniquement le corps JSON Mistral', async () => {
  const calls = []
  const guardedFetch = createMistralFetchGuard(async (input, init) => {
    calls.push({ input, init })
    return { ok: true }
  })

  await guardedFetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    body: JSON.stringify({
      model: 'devstral-2512',
      chat_template_kwargs: { enable_thinking: true },
      messages: [{ role: 'assistant', content: 'ok', reasoning: 'remove me' }],
    }),
  })

  const sent = JSON.parse(calls[0].init.body)
  assert.equal('chat_template_kwargs' in sent, false)
  assert.deepEqual(sent.messages[0], { role: 'assistant', content: 'ok' })
})

test('le nettoyage Qwen retire les boucles de continuation et réserve une vraie sortie', () => {
  const payload = {
    model: 'qwen3.5:4b',
    max_tokens: 1,
    temperature: 0.7,
    top_p: 0.95,
    chat_template_kwargs: { enable_thinking: true },
    messages: [
      { role: 'system', content: 'Builder tools' },
      { role: 'assistant', content: 'The', reasoning: 'truncated' },
      { role: 'user', content: 'Continue your previous response exactly where you left off.' },
      { role: 'user', content: '@mon-ide/patate.md enlève Desiree' },
    ],
  }

  const sanitized = sanitizeOllamaChatPayload(payload, {
    modelAlias: ollamaAliasForModel(payload.model, 32_768),
    minimumOutputTokens: 1_024,
    maximumOutputTokens: 4_096,
  })

  assert.match(sanitized.model, /^ide-ai-optimized-qwen3-5-4b-ctx32k:/)
  assert.equal(sanitized.max_tokens, 1_024)
  assert.equal(sanitized.temperature, 0.2)
  assert.equal(sanitized.top_p, 0.9)
  assert.equal(sanitized.reasoning_effort, 'none')
  assert.equal('chat_template_kwargs' in sanitized, false)
  assert.deepEqual(sanitized.messages, [
    { role: 'system', content: 'Builder tools' },
    { role: 'user', content: '@mon-ide/patate.md enlève Desiree' },
  ])
})

test('le nettoyage conserve le max_tokens=1 du préchauffage OpenFox', () => {
  const sanitized = sanitizeOllamaChatPayload({
    model: 'qwen3.5:4b',
    max_tokens: 1,
    temperature: 0,
    messages: [{ role: 'system', content: 'warmup' }],
  }, {
    modelAlias: 'ide-ai-optimized-qwen3-5-4b-ctx32k:latest',
  })

  assert.equal(sanitized.max_tokens, 1)
  assert.equal(sanitized.temperature, 0)
})

test('les artefacts de plusieurs continuations tronquées sont supprimés sans perdre la demande réelle', () => {
  const messages = [
    { role: 'assistant', content: 'The' },
    { role: 'user', content: 'Continue your previous response exactly where you left off.' },
    { role: 'assistant', content: 'The' },
    { role: 'user', content: 'Continue your previous response exactly where you left off.' },
    { role: 'user', content: 'Supprime Desiree' },
  ]

  assert.deepEqual(removeTruncationArtifacts(messages), [
    { role: 'user', content: 'Supprime Desiree' },
  ])
})

test('la détection Ollama expose à OpenFox un contexte Qwen effectif de 32k', () => {
  const normalized = normalizeOllamaShowPayload({
    model_info: {
      'qwen3.context_length': 262_144,
      'general.architecture': 'qwen3',
    },
  }, {
    model: 'qwen3.5:4b',
    contextLength: 32_768,
  })

  assert.equal(normalized.model_info.context_length, 32_768)
  assert.equal(normalized.model_info['qwen3.context_length'], 262_144)
})

test('les profils Ollama internes restent invisibles dans la liste des modèles', () => {
  const filtered = filterInternalOllamaAliases({
    models: [
      { name: 'qwen3.5:4b' },
      { name: 'ide-ai-optimized-qwen3-5-4b-ctx32k:latest' },
    ],
  })
  assert.deepEqual(filtered.models, [{ name: 'qwen3.5:4b' }])
})

test('le garde crée le profil Ollama 32k puis réécrit la requête Qwen', async () => {
  const calls = []
  const nativeFetch = async (input, init = {}) => {
    const url = String(input)
    calls.push({ url, init })
    if (url.endsWith('/api/create')) {
      return new Response(JSON.stringify({ status: 'success' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (url.endsWith('/v1/chat/completions')) {
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    throw new Error(`URL inattendue dans le test: ${url}`)
  }

  const guardedFetch = createProviderFetchGuard(nativeFetch, {
    contextLength: 32_768,
    minimumOutputTokens: 1_024,
    maximumOutputTokens: 4_096,
    ensureOllama: async () => ({ started: false }),
    aliasCache: new Map(),
    logger: { error() {} },
  })

  await guardedFetch('http://127.0.0.1:11434/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'qwen3.5:4b',
      max_tokens: 1,
      temperature: 0.7,
      messages: [
        { role: 'system', content: 'builder' },
        { role: 'user', content: 'Supprime Desiree' },
      ],
    }),
  })

  assert.equal(calls.length, 2)
  const creation = JSON.parse(calls[0].init.body)
  assert.equal(calls[0].url, 'http://127.0.0.1:11434/api/create')
  assert.equal(creation.from, 'qwen3.5:4b')
  assert.deepEqual(creation.parameters, { num_ctx: 32_768 })
  assert.equal(creation.stream, false)

  const chat = JSON.parse(calls[1].init.body)
  assert.equal(chat.model, creation.model)
  assert.equal(chat.max_tokens, 1_024)
  assert.equal(chat.reasoning_effort, 'none')
  assert.equal(chat.temperature, 0.2)
})

test('OpenFox charge le garde CommonJS avant son CLI sans utiliser --import', async () => {
  const [runtime, preload, source] = await Promise.all([
    readFile(runtimeUrl, 'utf8'),
    readFile(preloadUrl, 'utf8'),
    readFile(sanitizerUrl, 'utf8'),
  ])

  assert.match(runtime, /openfox-mistral-fetch-guard\.cjs/)
  assert.match(runtime, /\['--require', compatibilityGuard, cliPath/)
  assert.doesNotMatch(runtime, /--import/)
  assert.ok(runtime.indexOf("'--require', compatibilityGuard, cliPath") < runtime.indexOf("'--port'"))
  assert.match(preload, /OpenFox continue sans garde/)
  assert.match(preload, /installProviderFetchGuard/)
  assert.match(source, /OLLAMA_CONTEXT_LENGTH/)
  assert.match(source, /spawn\(binary, \['serve'\]/)
  assert.match(source, /parameters: \{ num_ctx: contextLength \}/)
})

test('le runtime confirme deux fois la santé avant de charger une session', async () => {
  const runtime = await readFile(runtimeUrl, 'utf8')
  assert.match(runtime, /OpenFox s’est arrêté juste après son contrôle de santé/)
  assert.match(runtime, /const confirmation = await fetch/)
  assert.match(runtime, /startupDiagnostics\(\)/)
})
