import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const htmlUrl = new URL('../electron/windows/ide-shell.html', import.meta.url)
const scriptUrl = new URL('../electron/windows/ide-shell.js', import.meta.url)
const dndScriptUrl = new URL('../electron/windows/ide-shell-dnd.js', import.meta.url)
const fileOpsScriptUrl = new URL('../electron/windows/ide-shell-file-ops.js', import.meta.url)
const preloadUrl = new URL('../electron/preload.mjs', import.meta.url)
const editorIpcUrl = new URL('../electron/lib/editor-ipc.mjs', import.meta.url)
const mainUrl = new URL('../electron/main.mjs', import.meta.url)
const bootstrapUrl = new URL('../electron/bootstrap.mjs', import.meta.url)

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

test('la coque IDE contient l’explorateur, les onglets, l’éditeur et les actions de fichiers', async () => {
  const html = await readFile(htmlUrl, 'utf8')
  for (const id of [
    'workspace-sidebar',
    'workspace-tree',
    'workspace-drop-overlay',
    'workspace-drop-target',
    'workspace-path',
    'choose-workspace',
    'rename-entry',
    'delete-entry',
    'tree-context-menu',
    'workspace-sync-label',
    'openfox-project',
    'openfox-session',
    'refresh-sessions',
    'openfox-tab',
    'file-tab',
    'editor-content',
    'editor-dirty',
    'save-file',
    'open-vscode',
  ]) {
    assert.match(html, new RegExp(`id=["']${escapeRegExp(id)}["']`))
  }
  assert.match(html, /<textarea[^>]+id=["']editor-content["']/)
  assert.match(html, /ide-shell-dnd\.js/)
  assert.match(html, /ide-shell-file-ops\.js/)
})

test('le preload sandboxé expose les opérations workspace, éditeur, déplacement et corbeille', async () => {
  const preload = await readFile(preloadUrl, 'utf8')
  assert.match(preload, /require\(["']electron["']\)/)
  assert.doesNotMatch(preload, /^import\s/m)
  assert.match(preload, /exposeInMainWorld\(["']desktopAPI["']/)
  for (const channel of [
    'workspace:current',
    'workspace:sync-status',
    'workspace:refresh-sessions',
    'workspace:choose',
    'workspace:open-path',
    'workspace:list',
    'workspace:read-file',
    'workspace:reveal',
    'workspace:files-changed',
    'workspace:import-dropped-paths',
    'workspace:rename-entry',
    'workspace:move-entry',
    'workspace:trash-entry',
    'editor:save-file',
    'editor:open-vscode',
  ]) {
    assert.match(preload, new RegExp(escapeRegExp(channel)))
  }
  assert.match(preload, /webUtils\.getPathForFile/)
})

test('le contrôleur de coque édite avec value, sauvegarde avec contrôle de version et écoute les changements', async () => {
  const script = await readFile(scriptUrl, 'utf8')
  assert.match(script, /editorContent\.value/)
  assert.doesNotMatch(script, /editorContent\.innerHTML/)
  assert.match(script, /expectedModifiedAt/)
  assert.match(script, /writeFile/)
  assert.match(script, /openInVSCode/)
  assert.match(script, /key\.toLowerCase\(\) === 's'/)
  assert.match(script, /onFilesChanged/)
  assert.doesNotMatch(script, /onNavigated/)
})

test('le contrôleur de dépôt importe depuis Windows et déplace les entrées internes', async () => {
  const script = await readFile(dndScriptUrl, 'utf8')
  assert.match(script, /application\/x-ide-open-ai-workspace-entry/)
  assert.match(script, /row\.draggable = true/)
  assert.match(script, /effectAllowed = 'copyMove'/)
  assert.match(script, /dataTransfer\.setData/)
  assert.match(script, /pathForFile/)
  assert.match(script, /importDroppedPaths/)
  assert.match(script, /targetRelativePath/)
  assert.match(script, /workspace\.moveEntry/)
  assert.match(script, /targetDirectoryRelativePath/)
  assert.match(script, /workspace-entry-moved/)
})

test('le contrôleur de fichiers propose renommer, F2, Suppr et Corbeille avec confirmation', async () => {
  const script = await readFile(fileOpsScriptUrl, 'utf8')
  assert.match(script, /workspace\.renameEntry/)
  assert.match(script, /workspace\.trashEntry/)
  assert.match(script, /window\.prompt/)
  assert.match(script, /window\.confirm/)
  assert.match(script, /event\.key === 'F2'/)
  assert.match(script, /event\.key === 'Delete'/)
  assert.match(script, /contextmenu/)
})

test('les IPC envoient les suppressions dans la Corbeille sans autoriser la racine', async () => {
  const source = await readFile(editorIpcUrl, 'utf8')
  assert.match(source, /workspace:rename-entry/)
  assert.match(source, /workspace:move-entry/)
  assert.match(source, /workspace:trash-entry/)
  assert.match(source, /shell\.trashItem/)
  assert.match(source, /targetPath === info\.root/)
})

test('le bootstrap enregistre les IPC éditeur et dépôt sans modifier la boucle OpenFox', async () => {
  const bootstrap = await readFile(bootstrapUrl, 'utf8')
  assert.match(bootstrap, /registerEditorIpc\(\)/)
  assert.match(bootstrap, /registerWorkspaceDropIpc\(\)/)
  assert.match(bootstrap, /import\('\.\/main\.mjs'\)/)
})

test('le processus principal monte OpenFox et le WorkspaceManager', async () => {
  const main = await readFile(mainUrl, 'utf8')
  assert.match(main, /WebContentsView/)
  assert.match(main, /WorkspaceManager/)
  assert.match(main, /workspace:read-file/)
  assert.match(main, /workspace:refresh-sessions/)
  assert.match(main, /defaultPath:\s*activeWorkspace/)
  assert.match(main, /loadOpenFoxUi\(context\.openFoxUrl\)/)
})
