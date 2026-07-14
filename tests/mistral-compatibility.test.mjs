import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import sanitizer from '../electron/lib/mistral-request-sanitizer.cjs'

const {
  createMistralFetchGuard,
  sanitizeMistralChatPayload,
} = sanitizer

const runtimeUrl = new URL('../electron/lib/openfox-runtime.mjs', import.meta.url)
const preloadUrl = new URL('../electron/openfox-mistral-fetch-guard.cjs', import.meta.url)

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

test('OpenFox charge le garde CommonJS avant son CLI sans utiliser --import', async () => {
  const [runtime, preload] = await Promise.all([
    readFile(runtimeUrl, 'utf8'),
    readFile(preloadUrl, 'utf8'),
  ])

  assert.match(runtime, /openfox-mistral-fetch-guard\.cjs/)
  assert.match(runtime, /\['--require', compatibilityGuard, cliPath/)
  assert.doesNotMatch(runtime, /--import/)
  assert.ok(runtime.indexOf("'--require', compatibilityGuard, cliPath") < runtime.indexOf("'--port'"))
  assert.match(preload, /OpenFox continue sans garde/)
})

test('le runtime confirme deux fois la santé avant de charger une session', async () => {
  const runtime = await readFile(runtimeUrl, 'utf8')
  assert.match(runtime, /OpenFox s’est arrêté juste après son contrôle de santé/)
  assert.match(runtime, /const confirmation = await fetch/)
  assert.match(runtime, /startupDiagnostics\(\)/)
})
