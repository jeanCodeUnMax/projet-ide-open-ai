import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const htmlUrl = new URL('../electron/windows/ide-shell.html', import.meta.url)
const scriptUrl = new URL('../electron/windows/ide-shell.js', import.meta.url)
const preloadUrl = new URL('../electron/preload.mjs', import.meta.url)
const mainUrl = new URL('../electron/main.mjs', import.meta.url)

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

test('la coque IDE contient l’explorateur, les onglets, l’aperçu et l’état OpenFox', async () => {
  const html = await readFile(htmlUrl, 'utf8')
  for (const id of [
    'workspace-tree',
    'workspace-path',
    'choose-workspace',
    'workspace-sync-label',
    'openfox-project',
    'openfox-session',
    'refresh-sessions',
    'openfox-tab',
    'file-tab',
    'editor-content',
  ]) {
    assert.match(html, new RegExp(`id=["']${escapeRegExp(id)}["']`))
  }
})

test('le preload sandboxé expose les opérations workspace avec require Electron', async () => {
  const preload = await readFile(preloadUrl, 'utf8')
  assert.match(preload, /require\(['"]electron['"]\)/)
  assert.doesNotMatch(preload, /^import\s/m)
  assert.match(preload, /exposeInMainWorld\(['"]desktopAPI['"]/)
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
  ]) {
    assert.match(preload, new RegExp(escapeRegExp(channel)))
  }
})

test('le contrôleur de coque utilise textContent et écoute les changements fichiers', async () => {
  const script = await readFile(scriptUrl, 'utf8')
  assert.match(script, /editorContent\.textContent/)
  assert.doesNotMatch(script, /editorContent\.innerHTML/)
  assert.match(script, /onFilesChanged/)
  assert.match(script, /refreshSessions/)
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
