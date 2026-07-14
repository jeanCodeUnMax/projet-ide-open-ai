import { app, session } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerEditorIpc } from './lib/editor-ipc.mjs'
import { registerWorkspaceDropIpc } from './lib/workspace-drop-ipc.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const localSessionPreload = path.join(__dirname, 'openfox-local-session-preload.cjs')
const LOCAL_SESSION_PRELOAD_ID = 'ide-open-ai-openfox-local-session'

// These handlers do not create windows and can safely be registered before
// app.whenReady(). Their workspace is resolved lazily for each invocation.
registerEditorIpc()
registerWorkspaceDropIpc()

// Register this callback before loading electron/main.mjs. When Electron becomes
// ready, its promise reaction runs first and installs the session preload before
// main.mjs creates the BrowserWindow or the OpenFox WebContentsView.
//
// Do not top-level-await app.whenReady() here: Electron waits for its entry
// module to finish evaluating before completing startup, which would deadlock
// the process before any window can be created.
const sessionPreloadReady = app.whenReady().then(() => {
  const current = session.defaultSession.getPreloadScripts()
  const alreadyRegistered = current.some((script) =>
    script.id === LOCAL_SESSION_PRELOAD_ID
    || path.resolve(script.filePath) === path.resolve(localSessionPreload),
  )

  if (!alreadyRegistered) {
    session.defaultSession.registerPreloadScript({
      type: 'frame',
      id: LOCAL_SESSION_PRELOAD_ID,
      filePath: localSessionPreload,
    })
  }
})

void sessionPreloadReady.catch((error) => {
  console.error('[IDE bootstrap] Impossible d’installer le preload OpenFox local.', error)
})

void import('./main.mjs').catch((error) => {
  console.error('[IDE bootstrap] Échec du chargement du processus principal.', error)
  app.exitCode = 1
  app.quit()
})
