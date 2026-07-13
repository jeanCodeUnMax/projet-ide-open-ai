import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createA2AOpenFoxExecutor } from '../electron/lib/a2a-openfox-executor.mjs'
import { createA2AServer } from '../electron/lib/a2a-server.mjs'
import { HephaistosAdapter } from '../electron/lib/hephaistos-adapter.mjs'
import { OpenFoxSessionClient } from '../electron/lib/openfox-session-client.mjs'
import { RagWorkspaceService } from '../electron/lib/rag-workspace-service.mjs'

function integerEnv(name, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} doit être un entier entre ${min} et ${max}.`)
  }
  return value
}

const workspace = path.resolve(process.env.WORKSPACE_PATH || process.cwd())
const host = process.env.A2A_HOST || '127.0.0.1'
const port = integerEnv('A2A_PORT', 43110, { min: 1, max: 65_535 })
const publicBaseUrl = (process.env.A2A_PUBLIC_URL || `http://${host}:${port}`).replace(/\/$/, '')
const card = JSON.parse(await readFile(new URL('../config/agents/orchestrator.agent-card.json', import.meta.url), 'utf8'))
card.supportedInterfaces = card.supportedInterfaces.map((entry, index) => index === 0
  ? { ...entry, url: publicBaseUrl }
  : entry)
if (process.env.A2A_SHARED_TOKEN) {
  card.securitySchemes = { bearerAuth: { type: 'http', scheme: 'bearer' } }
  card.securityRequirements = [{ bearerAuth: [] }]
}

const openFoxClient = new OpenFoxSessionClient({
  baseUrl: process.env.OPENFOX_BASE_URL || 'http://127.0.0.1:10369',
  sessionToken: process.env.OPENFOX_SESSION_TOKEN,
  executionTimeoutMs: integerEnv('OPENFOX_EXECUTION_TIMEOUT_MS', 15 * 60_000, { min: 1_000 }),
  pollIntervalMs: integerEnv('OPENFOX_POLL_INTERVAL_MS', 500, { min: 100, max: 30_000 }),
})
const ragService = RagWorkspaceService.fromEnvironment({ workspace })
const hephaistos = HephaistosAdapter.fromEnv()
const executor = createA2AOpenFoxExecutor({
  workspace,
  projectId: process.env.OPENFOX_PROJECT_ID || undefined,
  openFoxClient,
  ragService,
  hephaistos,
})

const server = createA2AServer({
  agentCard: card,
  executor,
  host,
  port,
  sharedToken: process.env.A2A_SHARED_TOKEN || undefined,
  rateLimitPerMinute: integerEnv('A2A_RATE_LIMIT_PER_MINUTE', 120, { min: 1, max: 100_000 }),
  maxConcurrentTasks: integerEnv('A2A_MAX_CONCURRENT_TASKS', 4, { min: 1, max: 100 }),
})

await openFoxClient.health()
const address = await server.start()
console.log(`Bridge A2A → OpenFox démarré sur ${address.baseUrl}`)
console.log(`Agent Card : ${address.baseUrl}/.well-known/agent-card.json`)
console.log(`Workspace  : ${workspace}`)
console.log(`OpenFox    : ${openFoxClient.baseUrl}`)
console.log(`RAG        : ${ragService.outputRoot}`)
console.log(`Auth A2A   : ${process.env.A2A_SHARED_TOKEN ? 'activée' : 'désactivée (boucle locale uniquement)'}`)

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    await server.close()
    process.exit(0)
  })
}
