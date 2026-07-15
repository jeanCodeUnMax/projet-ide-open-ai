import { app, session } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerEditorIpc } from './lib/editor-ipc.mjs'
import { registerWorkspaceDropIpc } from './lib/workspace-drop-ipc.mjs'
import { registerSecurityAuditIpc } from './lib/security-audit-ipc.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SESSION_PRELOADS = Object.freeze([
  {
    id: 'ide-open-ai-openfox-local-session',
    filePath: path.join(__dirname, 'openfox-local-session-preload.cjs'),
  },
  {
    id: 'ide-open-ai-openfox-workflow-designer',
    filePath: path.join(__dirname, 'openfox-workflow-designer-preload.cjs'),
  },
])

// These handlers do not create windows and can safely be registered before
// app.whenReady(). Their workspace is resolved lazily for each invocation.
registerEditorIpc()
registerWorkspaceDropIpc()
registerSecurityAuditIpc()

// Register this callback before loading electron/main.mjs. When Electron becomes
// ready, its promise reaction runs first and installs the session preloads before
// main.mjs creates the BrowserWindow or the OpenFox WebContentsView.
//
// Do not top-level-await app.whenReady() here: Electron waits for its entry
// module to finish evaluating before completing startup, which would deadlock
// the process before any window can be created.
const sessionPreloadReady = app.whenReady().then(() => {
  const current = session.defaultSession.getPreloadScripts()

  for (const preload of SESSION_PRELOADS) {
    const alreadyRegistered = current.some((script) =>
      script.id === preload.id
      || path.resolve(script.filePath) === path.resolve(preload.filePath),
    )

    if (!alreadyRegistered) {
      session.defaultSession.registerPreloadScript({
        type: 'frame',
        id: preload.id,
        filePath: preload.filePath,
      })
    }
  }
})

void sessionPreloadReady.catch((error) => {
  console.error('[IDE bootstrap] Impossible d’installer les preloads OpenFox.', error)
})

void import('./main.mjs').catch((error) => {
  console.error('[IDE bootstrap] Échec du chargement du processus principal.', error)
  app.exitCode = 1
  app.quit()
})
