import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  configuredLocalContext,
  optimizeLocalProviderDocument,
} from '../electron/lib/openfox-provider-optimizer.mjs'

const runtimeUrl = new URL('../electron/lib/openfox-runtime.mjs', import.meta.url)

test('le profil Qwen Ollama local est persisté en 32k non-thinking', () => {
  const source = {
    providers: [
      {
        id: 'ollama-local',
        backend: 'ollama',
        url: 'http://localhost:11434',
        models: [
          {
            id: 'qwen3.5:4b',
            contextWindow: 4_096,
            maxTokens: 1,
            thinkingEnabled: true,
            thinkingQueryParams: '{"thinking":true}',
          },
          { id: 'llama3.2:3b', contextWindow: 8_192 },
        ],
      },
      {
        id: 'mistral-cloud',
        backend: 'openai',
        url: 'https://api.mistral.ai/v1',
        models: [{ id: 'mistral-small-latest', contextWindow: 200_000 }],
      },
    ],
  }

  const optimized = optimizeLocalProviderDocument(source, {
    contextWindow: 32_768,
    maxOutputTokens: 4_096,
  })

  const qwen = optimized.providers[0].models[0]
  assert.equal(qwen.contextWindow, 32_768)
  assert.equal(qwen.maxTokens, 4_096)
  assert.equal(qwen.thinkingEnabled, false)
  assert.equal(qwen.nonThinkingEnabled, true)
  assert.equal(qwen.source, 'user')
  assert.equal('thinkingQueryParams' in qwen, false)
  assert.deepEqual(optimized.providers[0].models[1], source.providers[0].models[1])
  assert.deepEqual(optimized.providers[1], source.providers[1])
})

test('la taille de contexte locale est configurable et bornée', () => {
  assert.equal(configuredLocalContext({}), 32_768)
  assert.equal(configuredLocalContext({ IDE_AI_OLLAMA_CONTEXT_LENGTH: '65536' }), 65_536)
  assert.equal(configuredLocalContext({ IDE_AI_OLLAMA_CONTEXT_LENGTH: '1024' }), 8_192)
  assert.equal(configuredLocalContext({ IDE_AI_OLLAMA_CONTEXT_LENGTH: '999999' }), 131_072)
})

test('le runtime optimise la configuration avant de lancer OpenFox', async () => {
  const runtime = await readFile(runtimeUrl, 'utf8')
  const optimizeCall = runtime.indexOf('await optimizeOpenFoxLocalProviders(this.paths)')
  const syncCall = runtime.indexOf('await syncCanonicalMcpToOpenFox(this.paths')
  const locateCliCall = runtime.indexOf('const cliPath = await locateOpenFoxCli()')

  assert.ok(optimizeCall >= 0)
  assert.ok(syncCall >= 0)
  assert.ok(locateCliCall >= 0)
  assert.ok(optimizeCall < syncCall)
  assert.ok(optimizeCall < locateCliCall)
})
