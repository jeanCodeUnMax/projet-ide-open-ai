import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { WorkspaceDropImporter } from '../electron/lib/workspace-drop-importer.mjs'

test('le dépôt copie récursivement fichiers et dossiers dans le workspace', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ide-drop-'))
  const workspace = path.join(root, 'workspace')
  const source = path.join(root, 'documentation')
  await mkdir(workspace)
  await mkdir(path.join(source, 'guides'), { recursive: true })
  await writeFile(path.join(source, 'README.md'), '# Documentation\n', 'utf8')
  await writeFile(path.join(source, 'guides', 'install.md'), '# Installation\n', 'utf8')

  const importer = new WorkspaceDropImporter({ workspace })
  const result = await importer.importPaths([source])

  assert.equal(result.imported.length, 1)
  assert.equal(result.imported[0].relativePath, 'documentation')
  assert.equal(result.fileCount, 2)
  assert.equal(await readFile(path.join(workspace, 'documentation', 'guides', 'install.md'), 'utf8'), '# Installation\n')
})

test('le dépôt dans un dossier existant renomme les conflits sans écraser', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ide-drop-conflict-'))
  const workspace = path.join(root, 'workspace')
  const source = path.join(root, 'README.md')
  await mkdir(path.join(workspace, 'docs'), { recursive: true })
  await writeFile(path.join(workspace, 'docs', 'README.md'), 'ancien', 'utf8')
  await writeFile(source, 'nouveau', 'utf8')

  const importer = new WorkspaceDropImporter({ workspace })
  const result = await importer.importPaths([source], { targetRelativePath: 'docs' })

  assert.equal(result.imported[0].relativePath, 'docs/README (1).md')
  assert.equal(await readFile(path.join(workspace, 'docs', 'README.md'), 'utf8'), 'ancien')
  assert.equal(await readFile(path.join(workspace, 'docs', 'README (1).md'), 'utf8'), 'nouveau')
})

test('le dépôt refuse une destination hors du workspace et ignore un fichier déjà présent', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ide-drop-safe-'))
  const workspace = path.join(root, 'workspace')
  await mkdir(workspace)
  const existing = path.join(workspace, 'existing.txt')
  await writeFile(existing, 'déjà là', 'utf8')

  const importer = new WorkspaceDropImporter({ workspace })
  await assert.rejects(
    () => importer.importPaths([existing], { targetRelativePath: '..' }),
    /hors du workspace/i,
  )

  const result = await importer.importPaths([existing])
  assert.equal(result.imported.length, 0)
  assert.equal(result.skipped[0].reason, 'already-in-workspace')
})
