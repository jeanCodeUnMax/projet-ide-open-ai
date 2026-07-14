import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { openInVSCode } from '../electron/lib/external-editor.mjs'

const sourceUrl = new URL('../electron/lib/external-editor.mjs', import.meta.url)

test('VS Code est lancé dans une nouvelle fenêtre visible sous Windows', async () => {
  const localAppData = await mkdtemp(path.join(os.tmpdir(), 'ide-vscode-visible-'))
  const executable = path.join(localAppData, 'Programs', 'Microsoft VS Code', 'Code.exe')
  await mkdir(path.dirname(executable), { recursive: true })
  await writeFile(executable, '', 'utf8')

  const calls = []
  const targetPath = 'E:\\projets\\mon-ide\\patate.md'
  const result = await openInVSCode(targetPath, {
    platform: 'win32',
    env: { LOCALAPPDATA: localAppData },
    launch: async (...args) => calls.push(args),
  })

  assert.equal(result.opened, true)
  assert.equal(result.method, 'executable')
  assert.deepEqual(calls, [[
    executable,
    ['--new-window', '--goto', targetPath],
    { platform: 'win32' },
  ]])
})

test('le lanceur ne masque plus le processus graphique Windows', async () => {
  const source = await readFile(sourceUrl, 'utf8')
  assert.match(source, /windowsHide:\s*platform\s*!==\s*['"]win32['"]/)
  assert.doesNotMatch(source, /windowsHide:\s*true/)
  assert.match(source, /--new-window/)
})
