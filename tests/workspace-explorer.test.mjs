import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { WorkspaceExplorer, resolveWorkspaceDirectory } from '../electron/lib/workspace-explorer.mjs'

test('WorkspaceExplorer liste les dossiers avant les fichiers et masque les répertoires lourds', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'ide-workspace-'))
  await mkdir(path.join(workspace, 'src'))
  await mkdir(path.join(workspace, 'node_modules'))
  await writeFile(path.join(workspace, 'README.md'), '# Projet\n', 'utf8')
  await writeFile(path.join(workspace, 'zeta.txt'), 'zeta', 'utf8')

  const explorer = new WorkspaceExplorer({ workspace })
  const result = await explorer.list()

  assert.deepEqual(result.entries.map((entry) => entry.name), ['src', 'README.md', 'zeta.txt'])
  assert.equal(result.entries[0].kind, 'directory')
})

test('WorkspaceExplorer lit un fichier texte avec ses métadonnées', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'ide-workspace-read-'))
  await mkdir(path.join(workspace, 'docs'))
  await writeFile(path.join(workspace, 'docs', 'guide.md'), '# Guide\nContenu', 'utf8')

  const explorer = new WorkspaceExplorer({ workspace })
  const file = await explorer.read('docs/guide.md')

  assert.equal(file.relativePath, 'docs/guide.md')
  assert.equal(file.language, 'markdown')
  assert.equal(file.binary, false)
  assert.match(file.content, /Contenu/)
})

test('WorkspaceExplorer refuse une sortie du workspace', async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'ide-workspace-safe-'))
  const workspace = path.join(parent, 'workspace')
  await mkdir(workspace)
  await writeFile(path.join(parent, 'secret.txt'), 'secret', 'utf8')

  const explorer = new WorkspaceExplorer({ workspace })
  await assert.rejects(() => explorer.read('../secret.txt'), /hors du workspace/i)
})

test('WorkspaceExplorer refuse les fichiers binaires et trop volumineux dans l’aperçu', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'ide-workspace-limit-'))
  await writeFile(path.join(workspace, 'binary.bin'), Buffer.from([1, 0, 2, 3]))
  await writeFile(path.join(workspace, 'large.txt'), '123456', 'utf8')

  const explorer = new WorkspaceExplorer({ workspace, maxFileBytes: 5 })
  const binaryExplorer = new WorkspaceExplorer({ workspace })
  const binary = await binaryExplorer.read('binary.bin')
  assert.equal(binary.binary, true)
  await assert.rejects(() => explorer.read('large.txt'), /trop volumineux/i)
})

test('resolveWorkspaceDirectory valide un dossier réel', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'ide-workspace-root-'))
  assert.equal(await resolveWorkspaceDirectory(workspace), await resolveWorkspaceDirectory(path.resolve(workspace)))
})
