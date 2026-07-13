import test from 'node:test'
import assert from 'node:assert/strict'
import {
  A2A_TASK_STATES,
  AgentRegistry,
  AgentTaskStore,
  createArtifact,
  createMessage,
  createTextPart,
  validateAgentCard,
} from '../electron/lib/a2a-protocol.mjs'

const card = {
  name: 'RAG Agent',
  description: 'Ingestion documentaire',
  version: '1.0.0',
  supportedInterfaces: [{ url: 'http://127.0.0.1:43110', protocolBinding: 'HTTP+JSON', protocolVersion: '1.0' }],
  capabilities: { streaming: false },
  defaultInputModes: ['application/pdf'],
  defaultOutputModes: ['application/json'],
  skills: [{
    id: 'rag',
    name: 'RAG',
    description: 'Indexe les documents',
    tags: ['rag', 'ocr'],
    examples: ['Indexe ce PDF'],
  }],
}

test('validateAgentCard normalise une carte A2A', () => {
  const normalized = validateAgentCard(card)
  assert.equal(normalized.name, 'RAG Agent')
  assert.equal(normalized.supportedInterfaces[0].url, 'http://127.0.0.1:43110')
})

test('AgentRegistry recherche les agents par tags', () => {
  const registry = new AgentRegistry()
  registry.register(card)
  assert.equal(registry.findByTags(['ocr'])[0].name, 'RAG Agent')
  assert.equal(registry.findByTags(['security']).length, 0)
})

test('AgentTaskStore applique le cycle de vie A2A', () => {
  const store = new AgentTaskStore()
  const message = createMessage({ parts: [createTextPart('Indexe le document')] })
  const task = store.create({ message })
  assert.equal(task.status.state, A2A_TASK_STATES.SUBMITTED)
  store.transition(task.id, A2A_TASK_STATES.WORKING)
  store.addArtifact(task.id, createArtifact({ name: 'Index', parts: [createTextPart('Terminé')] }))
  const completed = store.transition(task.id, A2A_TASK_STATES.COMPLETED)
  assert.equal(completed.status.state, A2A_TASK_STATES.COMPLETED)
  assert.equal(store.get(task.id).artifacts.length, 1)
  assert.throws(() => store.transition(task.id, A2A_TASK_STATES.WORKING), /Transition A2A interdite/)
})
