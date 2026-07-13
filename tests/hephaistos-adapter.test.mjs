import test from 'node:test'
import assert from 'node:assert/strict'
import { HephaistosAdapter, createHephaistosHooks } from '../electron/lib/hephaistos-adapter.mjs'

test('HephaistosAdapter mappe les appels mémoire sans recréer de stockage', async () => {
  const calls = []
  const adapter = new HephaistosAdapter({
    baseUrl: 'http://127.0.0.1:8787',
    workspaceId: 'workspace-1',
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), options })
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })
    },
  })
  await adapter.recall({ query: 'architecture', contextId: 'ctx-1' })
  assert.equal(calls[0].url, 'http://127.0.0.1:8787/memory/search')
  assert.match(calls[0].options.body, /workspace-1/)
})

test('les hooks sont neutres lorsque Hephaistos est absent', async () => {
  const hooks = createHephaistosHooks(undefined)
  assert.equal(hooks.available, false)
  assert.equal(await hooks.beforeTask({}), undefined)
})
