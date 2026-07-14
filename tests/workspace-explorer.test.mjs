import test from 'node:test'
import assert from 'node:assert/strict'
import { access, mkdir, mkdtemp, readFile, utimes, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { WorkspaceExplorer, resolveWorkspaceDirectory } from '../electron/lib/workspace-explorer.mjs'

test('WorkspaceExplorer liste tous les dossiers et fichiers cachés avant les fichiers ordinaires', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'ide-workspace-'))
  await mkdir(path.join(workspace, '.git'))
  await mkdir(path.join(workspace, '.vscode'))
  await mkdir(path.join(workspace, 'node_modules'))
  await mkdir(path.join(workspace, 'src'))
  await writeFile(path.join(workspace, '.env'), 'SECRET=local\n', 'utf8')
  await writeFile(path.join(workspace, 'README.md'), '# Projet\n', 'utf8')
  await writeFile(path.join(workspace, 'zeta.txt'), 'zeta', 'utf8')

  const explorer = new WorkspaceExplorer({ workspace })
  const result = await explorer.list()

  assert.deepEqual(
    result.entries.map((entry) => entry.name),
    ['.git', '.vscode', 'node_modules', 'src', '.env', 'README.md', 'zeta.txt'],
  )
  assert.equal(result.entries[0].kind, 'directory')
  assert.equal(result.entries.find((entry) => entry.name === '.env')?.kind, 'file')
})

test('WorkspaceExplorer conserve un filtre explicite lorsque le caller en demande un', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'ide-workspace-filter-'))
  await mkdir(path.join(workspace, '.git'))
  await mkdir(path.join(workspace, 'src'))

  const explorer = new WorkspaceExplorer({ workspace, ignoredNames: ['.git'] })
  const result = await explorer.list()

  assert.deepEqual(result.entries.map((entry) => entry.name), ['src'])
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

test('WorkspaceExplorer enregistre un fichier texte dans le workspace', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'ide-workspace-write-'))
  const target = path.join(workspace, 'README.md')
  await writeFile(target, '# Avant\n', 'utf8')

  const explorer = new WorkspaceExplorer({ workspace })
  const before = await explorer.read('README.md')
  const saved = await explorer.write('README.md', '# Après\n', { expectedModifiedAt: before.modifiedAt })

  assert.equal(saved.content, '# Après\n')
  assert.equal(await readFile(target, 'utf8'), '# Après\n')
})

test('WorkspaceExplorer renomme un fichier sans écraser un voisin', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'ide-workspace-rename-'))
  await writeFile(path.join(workspace, 'avant.txt'), 'contenu', 'utf8')
  await writeFile(path.join(workspace, 'existant.txt'), 'conserver', 'utf8')

  const explorer = new WorkspaceExplorer({ workspace })
  const renamed = await explorer.renameEntry('avant.txt', 'apres.txt')

  assert.equal(renamed.from, 'avant.txt')
  assert.equal(renamed.to, 'apres.txt')
  assert.equal(await readFile(path.join(workspace, 'apres.txt'), 'utf8'), 'contenu')
  await assert.rejects(() => access(path.join(workspace, 'avant.txt')))
  await assert.rejects(() => explorer.renameEntry('apres.txt', 'existant.txt'), /existe déjà/i)
  assert.equal(await readFile(path.join(workspace, 'existant.txt'), 'utf8'), 'conserver')
})

test('WorkspaceExplorer déplace fichiers et dossiers uniquement dans le workspace', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'ide-workspace-move-'))
  await mkdir(path.join(workspace, 'source'))
  await mkdir(path.join(workspace, 'source', 'enfant'))
  await mkdir(path.join(workspace, 'destination'))
  await writeFile(path.join(workspace, 'source', 'note.txt'), 'note', 'utf8')

  const explorer = new WorkspaceExplorer({ workspace })
  const movedFile = await explorer.moveEntry('source/note.txt', 'destination')

  assert.equal(movedFile.to, 'destination/note.txt')
  assert.equal(await readFile(path.join(workspace, 'destination', 'note.txt'), 'utf8'), 'note')
  await assert.rejects(
    () => explorer.moveEntry('source', 'source/enfant'),
    /lui-même|sous-dossiers/i,
  )
  await assert.rejects(() => explorer.moveEntry('source', '../'), /hors du workspace/i)
  await assert.rejects(() => explorer.renameEntry('', 'racine'), /racine/i)
})

test('WorkspaceExplorer refuse d’écraser une modification externe', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'ide-workspace-conflict-'))
  const target = path.join(workspace, 'README.md')
  await writeFile(target, '# Initial\n', 'utf8')

  const explorer = new WorkspaceExplorer({ workspace })
  const opened = await explorer.read('README.md')
  await writeFile(target, '# OpenFox\n', 'utf8')
  const future = new Date(Date.now() + 5_000)
  await utimes(target, future, future)

  await assert.rejects(
    () => explorer.write('README.md', '# Utilisateur\n', { expectedModifiedAt: opened.modifiedAt }),
    /conflit de sauvegarde/i,
  )
  assert.equal(await readFile(target, 'utf8'), '# OpenFox\n')
})

test('WorkspaceExplorer refuse une sortie du workspace', async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'ide-workspace-safe-'))
  const workspace = path.join(parent, 'workspace')
  await mkdir(workspace)
  await writeFile(path.join(parent, 'secret.txt'), 'secret', 'utf8')

  const explorer = new WorkspaceExplorer({ workspace })
  await assert.rejects(() => explorer.read('../secret.txt'), /hors du workspace/i)
  await assert.rejects(() => explorer.write('../secret.txt', 'écrasement'), /hors du workspace/i)
})

test('WorkspaceExplorer refuse les fichiers binaires et trop volumineux dans l’aperçu et l’éditeur', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'ide-workspace-limit-'))
  await writeFile(path.join(workspace, 'binary.bin'), Buffer.from([1, 0, 2, 3]))
  await writeFile(path.join(workspace, 'large.txt'), '123456', 'utf8')

  const explorer = new WorkspaceExplorer({ workspace, maxFileBytes: 5 })
  const binaryExplorer = new WorkspaceExplorer({ workspace })
  const binary = await binaryExplorer.read('binary.bin')
  assert.equal(binary.binary, true)
  await assert.rejects(() => binaryExplorer.write('binary.bin', 'texte'), /binaires/i)
  await assert.rejects(() => explorer.read('large.txt'), /trop volumineux/i)
  await assert.rejects(() => explorer.write('large.txt', '123456'), /trop volumineux/i)
})

test('resolveWorkspaceDirectory valide un dossier réel', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'ide-workspace-root-'))
  assert.equal(await resolveWorkspaceDirectory(workspace), await resolveWorkspaceDirectory(path.resolve(workspace)))
})
