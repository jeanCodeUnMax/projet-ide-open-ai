import { app, ipcMain, shell } from 'electron'
import { createRuntimePaths } from './runtime-paths.mjs'
import { loadDesktopSettings } from './config-store.mjs'
import { WorkspaceExplorer, resolveWorkspaceDirectory } from './workspace-explorer.mjs'
import { openInVSCode } from './external-editor.mjs'

let registered = false

async function activeExplorer() {
  const runtimePaths = createRuntimePaths(app.getPath('userData'))
  const settings = await loadDesktopSettings(runtimePaths)
  const workspace = await resolveWorkspaceDirectory(settings.workspace || process.cwd())
  return new WorkspaceExplorer({ workspace })
}

function validateSavePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Charge utile de sauvegarde invalide.')
  }
  if (typeof payload.relativePath !== 'string' || payload.relativePath.trim() === '') {
    throw new Error('Le chemin relatif du fichier est obligatoire.')
  }
  if (typeof payload.content !== 'string') {
    throw new Error('Le contenu à sauvegarder doit être une chaîne de caractères.')
  }
}

export function registerEditorIpc() {
  if (registered) return
  registered = true

  ipcMain.handle('editor:save-file', async (_event, payload) => {
    validateSavePayload(payload)
    const explorer = await activeExplorer()
    return explorer.write(payload.relativePath, payload.content, {
      expectedModifiedAt: payload.expectedModifiedAt,
    })
  })

  ipcMain.handle('editor:open-vscode', async (_event, relativePath) => {
    if (typeof relativePath !== 'string' || relativePath.trim() === '') {
      throw new Error('Le chemin du fichier à ouvrir est obligatoire.')
    }
    const explorer = await activeExplorer()
    const targetPath = await explorer.absolutePath(relativePath)
    return openInVSCode(targetPath, { shellApi: shell })
  })
}
