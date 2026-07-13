import test from 'node:test'
import assert from 'node:assert/strict'
import { createA2AServer } from '../electron/lib/a2a-server.mjs'

const card = {
  name: 'Test agent',
  description: 'Agent de test',
  version: '1.0.0',
  supportedInterfaces: [{ url: 'http://127.0.0.1:43110', protocolBinding: 'HTTP+JSON', protocolVersion: '1.0' }],
  capabilities: {},
  defaultInputModes: ['text/plain'],
  defaultOutputModes: ['text/plain'],
  skills: [],
}

test('serveur A2A garde Agent Card publique mais protège les tâches', async () => {
  const executor = async () => ({ text: 'ok' })
  const server = createA2AServer({ agentCard: card, executor, port: 0, sharedToken: 'secret' })
  const address = await server.start()
  try {
    const discovery = await fetch(`${address.baseUrl}/.well-known/agent-card.json`)
    assert.equal(discovery.status, 200)

    const unauthorized = await fetch(`${address.baseUrl}/message:send`, {
      method: 'POST', headers: { 'content-type': 'application/a2a+json' },
      body: JSON.stringify({ message: { parts: [{ text: 'test' }] } }),
    })
    assert.equal(unauthorized.status, 401)

    const authorized = await fetch(`${address.baseUrl}/message:send`, {
      method: 'POST',
      headers: { 'content-type': 'application/a2a+json', authorization: 'Bearer secret' },
      body: JSON.stringify({ contextId: 'ctx', message: { parts: [{ text: 'test' }] } }),
    })
    const payload = await authorized.json()
    assert.equal(authorized.status, 200)
    assert.equal(payload.task.status.state, 'TASK_STATE_COMPLETED')
    assert.equal(payload.task.artifacts[0].parts[0].text, 'ok')
    assert.match(authorized.headers.get('content-security-policy'), /default-src/)
  } finally {
    await server.close()
  }
})

test('serveur A2A exposé hors loopback exige une authentification', () => {
  assert.throws(() => createA2AServer({ agentCard: card, executor: async () => ({}), host: '0.0.0.0' }), /authentification/i)
})
