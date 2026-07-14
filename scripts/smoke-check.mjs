import { access, readFile } from 'node:fs/promises'
import { validateAgentCard } from '../electron/lib/a2a-protocol.mjs'

const required = [
  'electron/bootstrap.mjs',
  'electron/main.mjs',
  'electron/preload.mjs',
  'electron/openfox-local-session-preload.cjs',
  'electron/openfox-mistral-fetch-guard.mjs',
  'electron/lib/config-store.mjs',
  'electron/lib/editor-ipc.mjs',
  'electron/lib/external-editor.mjs',
  'electron/lib/mistral-request-sanitizer.mjs',
  'electron/lib/openfox-runtime.mjs',
  'electron/lib/openfox-session-client.mjs',
  'electron/lib/workspace-explorer.mjs',
  'electron/lib/workspace-file-watcher.mjs',
  'electron/lib/workspace-manager.mjs',
  'electron/lib/a2a-protocol.mjs',
  'electron/lib/a2a-server.mjs',
  'electron/lib/a2a-openfox-executor.mjs',
  'electron/lib/agent-registry-store.mjs',
  'electron/lib/hephaistos-adapter.mjs',
  'electron/lib/rag-pipeline.mjs',
  'electron/lib/rag-providers.mjs',
  'electron/lib/rag-workspace-service.mjs',
  'electron/lib/document-index.mjs',
  'electron/windows/ide-shell.html',
  'electron/windows/ide-shell.css',
  'electron/windows/ide-shell.js',
  'electron/windows/mcp-manager.html',
  'electron/windows/mcp-manager.js',
  'electron/windows/agent-rag-dashboard.html',
  'electron/windows/agent-rag-dashboard.js',
  'electron/windows/agent-rag-dashboard.css',
  'scripts/a2a-openfox-server.mjs',
  'config/app-schema.json',
  'config/agents/orchestrator.agent-card.json',
  'README.md',
]

for (const file of required) await access(new URL(`../${file}`, import.meta.url))

const packageDocument = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
if (packageDocument.main !== 'electron/bootstrap.mjs') {
  throw new Error('Le point d’entrée Electron doit utiliser electron/bootstrap.mjs.')
}
if (packageDocument.build?.extraMetadata?.main !== 'electron/bootstrap.mjs') {
  throw new Error('Le paquet distribué doit utiliser electron/bootstrap.mjs.')
}

JSON.parse(await readFile(new URL('../config/app-schema.json', import.meta.url), 'utf8'))
validateAgentCard(JSON.parse(await readFile(new URL('../config/agents/orchestrator.agent-card.json', import.meta.url), 'utf8')))

console.log(`Smoke check: ${required.length} fichiers essentiels présents et configurations valides.`)
