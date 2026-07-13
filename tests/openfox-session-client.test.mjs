import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { OpenFoxSessionClient, OpenFoxSessionRegistry } from '../electron/lib/openfox-session-client.mjs'

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return structuredClone(payload) },
  }
}

test('OpenFoxSessionClient crée une session, envoie un message et récupère la réponse', async () => {
  const calls = []
  let sessionReads = 0
  const fetchImpl = async (url, options = {}) => {
    const pathname = new URL(url).pathname
    const method = options.method ?? 'GET'
    calls.push({ pathname, method, body: options.body ? JSON.parse(options.body) : undefined })

    if (method === 'GET' && pathname === '/api/projects') {
      return jsonResponse(200, { projects: [{ id: 'p1', name: 'Projet', workdir: '/workspace' }] })
    }
    if (method === 'POST' && pathname === '/api/sessions') {
      return jsonResponse(201, { session: { id: 's1', projectId: 'p1' } })
    }
    if (method === 'POST' && pathname === '/api/sessions/s1/message') {
      return jsonResponse(200, { success: true, queueState: { asap: ['q1'] } })
    }
    if (method === 'GET' && pathname === '/api/sessions/s1') {
      sessionReads += 1
      if (sessionReads === 1) {
        return jsonResponse(200, { session: { id: 's1', projectId: 'p1', isRunning: false }, messages: [], queueState: {} })
      }
      if (sessionReads === 2) {
        return jsonResponse(200, { session: { id: 's1', projectId: 'p1', isRunning: true }, messages: [], queueState: {} })
      }
      return jsonResponse(200, {
        session: { id: 's1', projectId: 'p1', isRunning: false },
        messages: [{ id: 'a1', role: 'assistant', content: 'Réponse OpenFox' }],
        queueState: {},
      })
    }
    throw new Error(`Appel inattendu: ${method} ${pathname}`)
  }

  const client = new OpenFoxSessionClient({
    baseUrl: 'http://127.0.0.1:10369',
    fetchImpl,
    pollIntervalMs: 1,
    executionTimeoutMs: 1_000,
  })
  const result = await client.execute({ workspace: '/workspace', content: 'Analyse le projet' })

  assert.equal(result.sessionId, 's1')
  assert.equal(result.text, 'Réponse OpenFox')
  assert.ok(calls.some((call) => call.pathname === '/api/sessions/s1/message' && call.body.content === 'Analyse le projet'))
})

test('OpenFoxSessionClient signale un projet inexistant', async () => {
  const client = new OpenFoxSessionClient({
    fetchImpl: async () => jsonResponse(200, { projects: [] }),
  })
  await assert.rejects(
    () => client.resolveProject({ workspace: '/workspace' }),
    (error) => error.code === 'OPENFOX_PROJECT_NOT_FOUND',
  )
})

test('OpenFoxSessionRegistry conserve le mapping contextId vers session', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ide-ai-openfox-registry-'))
  const registry = new OpenFoxSessionRegistry({ filePath: path.join(directory, 'sessions.json') })
  await registry.set('ctx-1', { sessionId: 's1', projectId: 'p1' })
  assert.equal((await registry.get('ctx-1')).sessionId, 's1')
  assert.equal(await registry.remove('ctx-1'), true)
  assert.equal(await registry.get('ctx-1'), undefined)
})
