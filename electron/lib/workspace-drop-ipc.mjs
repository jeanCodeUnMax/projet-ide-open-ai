import { app, ipcMain } from 'electron'
import { createRuntimePaths } from './runtime-paths.mjs'
import { loadDesktopSettings } from './config-store.mjs'
import { resolveWorkspaceDirectory } from './workspace-explorer.mjs'
import { WorkspaceDropImporter } from './workspace-drop-importer.mjs'

let registered = false

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Charge utile de dépôt invalide.')
  }
  if (!Array.isArray(payload.sourcePaths) || payload.sourcePaths.length === 0) {
    throw new Error('Aucun chemin source fourni.')
  }
  for (const sourcePath of payload.sourcePaths) {
    if (typeof sourcePath !== 'string' || sourcePath.trim() === '') {
      throw new Error('Un chemin source du dépôt est invalide.')
    }
  }
  if (payload.targetRelativePath !== undefined && typeof payload.targetRelativePath !== 'string') {
    throw new Error('Le chemin de destination doit être une chaîne de caractères.')
  }
}

async function activeImporter() {
  const runtimePaths = createRuntimePaths(app.getPath('userData'))
  const settings = await loadDesktopSettings(runtimePaths)
  const workspace = await resolveWorkspaceDirectory(settings.workspace || process.cwd())
  return new WorkspaceDropImporter({ workspace })
}

export function registerWorkspaceDropIpc() {
  if (registered) return
  registered = true

  ipcMain.handle('workspace:import-dropped-paths', async (_event, payload) => {
    validatePayload(payload)
    const importer = await activeImporter()
    return importer.importPaths(payload.sourcePaths, {
      targetRelativePath: payload.targetRelativePath || '',
    })
  })
}
