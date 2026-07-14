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

function validateEntryPayload(payload, requiredKeys) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Opération de fichier invalide.')
  }
  for (const key of requiredKeys) {
    if (typeof payload[key] !== 'string') throw new Error(`Champ invalide : ${key}.`)
  }
  if (typeof payload.relativePath === 'string' && payload.relativePath.trim() === '') {
    throw new Error('La racine du workspace ne peut pas être modifiée.')
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

  ipcMain.handle('workspace:rename-entry', async (_event, payload) => {
    validateEntryPayload(payload, ['relativePath', 'newName'])
    const explorer = await activeExplorer()
    return explorer.renameEntry(payload.relativePath, payload.newName)
  })

  ipcMain.handle('workspace:move-entry', async (_event, payload) => {
    validateEntryPayload(payload, ['relativePath', 'targetDirectoryRelativePath'])
    const explorer = await activeExplorer()
    return explorer.moveEntry(payload.relativePath, payload.targetDirectoryRelativePath)
  })

  ipcMain.handle('workspace:trash-entry', async (_event, payload) => {
    validateEntryPayload(payload, ['relativePath'])
    const explorer = await activeExplorer()
    const [targetPath, info] = await Promise.all([
      explorer.absolutePath(payload.relativePath),
      explorer.info(),
    ])
    if (targetPath === info.root) throw new Error('La racine du workspace ne peut pas être envoyée dans la Corbeille.')
    await shell.trashItem(targetPath)
    return { trashed: true, relativePath: payload.relativePath, path: targetPath }
  })
}
