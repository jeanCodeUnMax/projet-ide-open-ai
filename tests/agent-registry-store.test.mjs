import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { AgentRegistryStore } from '../electron/lib/agent-registry-store.mjs'

const builtinCard = {
  name: 'Orchestrator',
  description: 'Agent intégré',
  version: '1.0.0',
  supportedInterfaces: [{ url: 'http://127.0.0.1:43110', protocolBinding: 'HTTP+JSON', protocolVersion: '1.0' }],
  capabilities: { streaming: false },
  defaultInputModes: ['text/plain'],
  defaultOutputModes: ['text/plain'],
  skills: [{ id: 'orchestrate', name: 'Orchestration', description: 'Coordonne les tâches', tags: ['a2a'], examples: [] }],
}

const remoteCard = {
  ...builtinCard,
  name: 'Security Agent',
  description: 'Audite le code',
  supportedInterfaces: [{ url: 'http://127.0.0.1:43200', protocolBinding: 'HTTP+JSON', protocolVersion: '1.0' }],
  skills: [{ id: 'security', name: 'Security', description: 'Audit', tags: ['security'], examples: [] }],
}

test('AgentRegistryStore combine agent intégré et agents persistés', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'ide-ai-agent-store-'))
  const builtinCardPath = path.join(workspace, 'orchestrator.json')
  await writeFile(builtinCardPath, JSON.stringify(builtinCard), 'utf8')
  const store = new AgentRegistryStore({
    workspace,
    builtinCardPath,
    client: { discover: async () => remoteCard },
  })

  await store.add('http://127.0.0.1:43200')
  const registry = await store.list()
  assert.equal(registry.agents.length, 2)
  assert.equal(registry.agents[0].builtin, true)
  assert.equal(registry.agents[1].card.name, 'Security Agent')

  await store.setEnabled('Security Agent', false)
  assert.equal((await store.list()).agents[1].enabled, false)
  const persisted = JSON.parse(await readFile(path.join(workspace, '.ide-ai', 'agents', 'index.json'), 'utf8'))
  assert.equal(persisted.agents.length, 1)
})

test('AgentRegistryStore supprime un agent distant', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'ide-ai-agent-remove-'))
  const store = new AgentRegistryStore({ workspace, client: { discover: async () => remoteCard } })
  await store.add('http://127.0.0.1:43200')
  assert.equal(await store.remove('Security Agent'), true)
  assert.equal((await store.list()).agents.length, 0)
})
