import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const htmlUrl = new URL('../electron/windows/ide-shell.html', import.meta.url)
const scriptUrl = new URL('../electron/windows/ide-shell.js', import.meta.url)
const preloadUrl = new URL('../electron/preload.mjs', import.meta.url)
const mainUrl = new URL('../electron/main.mjs', import.meta.url)

test('la coque IDE contient l’explorateur, les onglets et l’aperçu de fichier', async () => {
  const html = await readFile(htmlUrl, 'utf8')
  for (const id of ['workspace-tree', 'workspace-path', 'choose-workspace', 'openfox-tab', 'file-tab', 'editor-content']) {
    assert.match(html, new RegExp(`id=["']${id}["']`))
  }
})

test('le preload expose seulement les opérations workspace nécessaires', async () => {
  const preload = await readFile(preloadUrl, 'utf8')
  for (const channel of ['workspace:current', 'workspace:choose', 'workspace:open-path', 'workspace:list', 'workspace:read-file', 'workspace:reveal']) {
    assert.match(preload, new RegExp(channel.replace(':', '\\:')))
  }
})

test('le contrôleur de coque utilise textContent pour afficher les fichiers', async () => {
  const script = await readFile(scriptUrl, 'utf8')
  assert.match(script, /editorContent\.textContent/)
  assert.doesNotMatch(script, /editorContent\.innerHTML/)
})

test('le processus principal monte OpenFox dans une WebContentsView', async () => {
  const main = await readFile(mainUrl, 'utf8')
  assert.match(main, /WebContentsView/)
  assert.match(main, /workspace:read-file/)
  assert.match(main, /defaultPath:\s*activeWorkspace/)
})
