import { readFile } from 'node:fs/promises'
import { createA2AServer } from '../electron/lib/a2a-server.mjs'
import { createArtifact, createTextPart } from '../electron/lib/a2a-protocol.mjs'
import { createHephaistosHooks, HephaistosAdapter } from '../electron/lib/hephaistos-adapter.mjs'

const card = JSON.parse(await readFile(new URL('../config/agents/orchestrator.agent-card.json', import.meta.url), 'utf8'))
const hephaistos = HephaistosAdapter.fromEnv()
const hooks = createHephaistosHooks(hephaistos)

function messageText(message) {
  return (message.parts ?? []).map((part) => part.text ?? '').filter(Boolean).join('\n')
}

const server = createA2AServer({
  agentCard: card,
  port: Number(process.env.A2A_PORT || 43110),
  async executor({ task, message, contextId }) {
    const query = messageText(message)
    const memory = await hooks.beforeTask({
      query,
      contextId,
      taskId: task.id,
      agentName: card.name,
    })
    const text = [
      'Tâche reçue par l’orchestrateur IDE Open AI.',
      `Demande: ${query || '(aucun texte)'}`,
      hooks.available ? 'Hephaistos est configuré comme mémoire/watchdog externe.' : 'Hephaistos n’est pas configuré; aucun service mémoire n’a été recréé.',
      memory?.memory ? 'Un contexte mémoire a été récupéré.' : 'Aucun contexte mémoire récupéré.',
    ].join('\n')
    await hooks.afterTask({
      content: text,
      tags: ['a2a', 'orchestration', 'ide-open-ai'],
      metadata: { kind: 'a2a-demo' },
      contextId,
      taskId: task.id,
      agentName: card.name,
    })
    return {
      artifacts: [createArtifact({ name: 'Accusé de réception', parts: [createTextPart(text)] })],
    }
  },
})

const address = await server.start()
console.log(`A2A local démarré sur ${address.baseUrl}`)
console.log(`Agent Card: ${address.baseUrl}/.well-known/agent-card.json`)

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    await server.close()
    process.exit(0)
  })
}
