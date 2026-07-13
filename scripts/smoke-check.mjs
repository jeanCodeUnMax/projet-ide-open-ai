import { access, readFile } from 'node:fs/promises'
import { validateAgentCard } from '../electron/lib/a2a-protocol.mjs'

const required = [
  'electron/main.mjs',
  'electron/preload.mjs',
  'electron/lib/config-store.mjs',
  'electron/lib/openfox-runtime.mjs',
  'electron/lib/a2a-protocol.mjs',
  'electron/lib/a2a-server.mjs',
  'electron/lib/hephaistos-adapter.mjs',
  'electron/lib/rag-pipeline.mjs',
  'electron/lib/rag-providers.mjs',
  'electron/lib/document-index.mjs',
  'electron/windows/mcp-manager.html',
  'electron/windows/mcp-manager.js',
  'config/app-schema.json',
  'config/agents/orchestrator.agent-card.json',
  'README.md',
]

for (const file of required) await access(new URL(`../${file}`, import.meta.url))

JSON.parse(await readFile(new URL('../config/app-schema.json', import.meta.url), 'utf8'))
validateAgentCard(JSON.parse(await readFile(new URL('../config/agents/orchestrator.agent-card.json', import.meta.url), 'utf8')))

console.log(`Smoke check: ${required.length} fichiers essentiels présents et configurations valides.`)
