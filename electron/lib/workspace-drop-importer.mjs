import path from 'node:path'
import { copyFile, lstat, mkdir, readdir } from 'node:fs/promises'

const DEFAULT_MAX_FILES = 10_000
const DEFAULT_MAX_BYTES = 1024 * 1024 * 1024

function normalizeForComparison(value) {
  const resolved = path.resolve(value)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function isInside(candidate, parent) {
  const normalizedCandidate = normalizeForComparison(candidate)
  const normalizedParent = normalizeForComparison(parent)
  return normalizedCandidate === normalizedParent || normalizedCandidate.startsWith(`${normalizedParent}${path.sep}`)
}

function resolveWorkspaceTarget(workspace, relativePath = '') {
  const root = path.resolve(workspace)
  const target = path.resolve(root, String(relativePath || ''))
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error('Le dossier de destination est hors du workspace.')
  }
  return { root, target }
}

function portableRelative(root, target) {
  return path.relative(root, target).split(path.sep).join('/')
}

async function uniqueDestination(directory, sourceName, kind) {
  let candidate = path.join(directory, sourceName)
  try {
    await lstat(candidate)
  } catch (error) {
    if (error?.code === 'ENOENT') return candidate
    throw error
  }

  const extension = kind === 'file' ? path.extname(sourceName) : ''
  const stem = extension ? sourceName.slice(0, -extension.length) : sourceName
  for (let index = 1; index <= 10_000; index += 1) {
    candidate = path.join(directory, `${stem} (${index})${extension}`)
    try {
      await lstat(candidate)
    } catch (error) {
      if (error?.code === 'ENOENT') return candidate
      throw error
    }
  }
  throw new Error(`Impossible de trouver un nom libre pour ${sourceName}.`)
}

async function scanEntry(sourcePath, budget) {
  const details = await lstat(sourcePath)
  if (details.isSymbolicLink()) {
    throw new Error(`Les liens symboliques ne sont pas importés : ${sourcePath}`)
  }
  if (details.isFile()) {
    budget.files += 1
    budget.bytes += details.size
    if (budget.files > budget.maxFiles) {
      throw new Error(`Dépôt refusé : plus de ${budget.maxFiles} fichiers.`)
    }
    if (budget.bytes > budget.maxBytes) {
      throw new Error(`Dépôt refusé : volume supérieur à ${Math.round(budget.maxBytes / (1024 * 1024))} Mo.`)
    }
    return
  }
  if (!details.isDirectory()) {
    throw new Error(`Type de fichier non pris en charge : ${sourcePath}`)
  }
  for (const entry of await readdir(sourcePath, { withFileTypes: true })) {
    await scanEntry(path.join(sourcePath, entry.name), budget)
  }
}

async function copyEntry(sourcePath, destinationPath) {
  const details = await lstat(sourcePath)
  if (details.isFile()) {
    await copyFile(sourcePath, destinationPath)
    return 'file'
  }
  await mkdir(destinationPath, { recursive: false })
  for (const entry of await readdir(sourcePath, { withFileTypes: true })) {
    await copyEntry(path.join(sourcePath, entry.name), path.join(destinationPath, entry.name))
  }
  return 'directory'
}

export class WorkspaceDropImporter {
  constructor({ workspace, maxFiles = DEFAULT_MAX_FILES, maxBytes = DEFAULT_MAX_BYTES } = {}) {
    if (!workspace) throw new Error('workspace est obligatoire.')
    this.workspace = path.resolve(workspace)
    this.maxFiles = maxFiles
    this.maxBytes = maxBytes
  }

  setWorkspace(workspace) {
    this.workspace = path.resolve(workspace)
  }

  async importPaths(sourcePaths, { targetRelativePath = '' } = {}) {
    if (!Array.isArray(sourcePaths) || sourcePaths.length === 0) {
      throw new Error('Aucun fichier ou dossier à importer.')
    }
    if (sourcePaths.length > 100) {
      throw new Error('Dépôt refusé : 100 éléments sources maximum.')
    }

    const { root, target } = resolveWorkspaceTarget(this.workspace, targetRelativePath)
    const targetDetails = await lstat(target)
    if (!targetDetails.isDirectory()) throw new Error('La destination du dépôt doit être un dossier.')

    const sources = sourcePaths.map((sourcePath) => path.resolve(String(sourcePath)))
    const skipped = []
    const accepted = []
    const budget = { files: 0, bytes: 0, maxFiles: this.maxFiles, maxBytes: this.maxBytes }

    for (const sourcePath of sources) {
      const details = await lstat(sourcePath)
      if (isInside(sourcePath, root)) {
        skipped.push({ sourcePath, reason: 'already-in-workspace' })
        continue
      }
      if (details.isDirectory() && isInside(target, sourcePath)) {
        throw new Error(`Copie récursive impossible : la destination se trouve dans ${sourcePath}.`)
      }
      await scanEntry(sourcePath, budget)
      accepted.push({ sourcePath, kind: details.isDirectory() ? 'directory' : 'file' })
    }

    const imported = []
    for (const source of accepted) {
      const destination = await uniqueDestination(target, path.basename(source.sourcePath), source.kind)
      const kind = await copyEntry(source.sourcePath, destination)
      imported.push({
        sourcePath: source.sourcePath,
        relativePath: portableRelative(root, destination),
        kind,
      })
    }

    return {
      workspace: root,
      targetRelativePath: portableRelative(root, target),
      imported,
      skipped,
      fileCount: budget.files,
      totalBytes: budget.bytes,
    }
  }
}
