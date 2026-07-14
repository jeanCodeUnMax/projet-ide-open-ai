import { app, session } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const localSessionPreload = path.join(__dirname, 'openfox-local-session-preload.cjs')

// Register the session preload before electron/main.mjs creates BrowserWindow
// or WebContentsView instances. Session preloads run in addition to each
// window-specific preload and execute before the OpenFox frontend bundle.
const sessionPreloadReady = app.whenReady().then(() => {
  const current = session.defaultSession.getPreloads()
  if (!current.includes(localSessionPreload)) {
    session.defaultSession.setPreloads([...current, localSessionPreload])
  }
})

await import('./main.mjs')
await sessionPreloadReady
