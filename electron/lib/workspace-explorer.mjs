import { readFile, readdir, realpath, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

// Visibility and indexing are deliberately separated. The explorer shows every
// real file and directory returned by the operating system, including dotfiles,
// Windows Hidden/System entries, .git, node_modules and generated directories.
// Heavy directories may still be ignored by watchers or RAG indexing elsewhere.
const DEFAULT_IGNORED_NAMES = new Set()

const DEFAULT_MAX_FILE_BYTES = 2 * 1024 * 1024

function portableRelativePath(root, target) {
  return path.relative(root, target).split(path.sep).join('/')
}

function isPathInside(root, target) {
  const relative = path.relative(root, target)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

function normalizeRequestedRelativePath(value) {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value !== 'string') throw new Error('Le chemin relatif doit être une chaîne.')
  const portable = value.replace(/[\\/]+/g, path.sep)
  if (path.isAbsolute(portable)) throw new Error('Un chemin relatif au workspace est attendu.')
  const normalized = path.normalize(portable)
  return normalized === '.' ? '' : normalized
}

function validateEntryName(value) {
  if (typeof value !== 'string') throw new Error('Le nouveau nom doit être une chaîne.')
  const name = value.trim()
  if (!name || name === '.' || name === '..') throw new Error('Le nouveau nom est invalide.')
  if (name.includes('\0') || /[\\/]/.test(name)) throw new Error('Le nouveau nom ne doit pas contenir de séparateur de chemin.')
  if (process.platform === 'win32' && (/[<>:"|?*]/.test(name) || /[. ]$/.test(name))) {
    throw new Error('Ce nom n’est pas valide sous Windows.')
  }
  return name
}

function languageForFile(filePath) {
  const extension = path.extname(filePath).toLowerCase()
  return ({
    '.js': 'javascript',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.jsx': 'javascript',
    '.json': 'json',
    '.md': 'markdown',
    '.html': 'html',
    '.css': 'css',
    '.scss': 'scss',
    '.yml': 'yaml',
    '.yaml': 'yaml',
    '.xml': 'xml',
    '.py': 'python',
    '.java': 'java',
    '.go': 'go',
    '.rs': 'rust',
    '.sh': 'shell',
    '.ps1': 'powershell',
    '.sql': 'sql',
    '.env': 'dotenv',
    '.txt': 'text',
  })[extension] ?? 'text'
}

function looksBinary(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8_192))
  return sample.includes(0)
}

async function existingRealPath(candidate) {
  try {
    return await realpath(candidate)
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
}

export async function resolveWorkspaceDirectory(candidate) {
  if (typeof candidate !== 'string' || candidate.trim() === '') {
    throw new Error('Le chemin du workspace est obligatoire.')
  }
  const resolved = await realpath(path.resolve(candidate.trim()))
  const details = await stat(resolved)
  if (!details.isDirectory()) throw new Error('Le workspace doit être un dossier.')
  return resolved
}

export class WorkspaceExplorer {
  constructor({ workspace, ignoredNames = DEFAULT_IGNORED_NAMES, maxFileBytes = DEFAULT_MAX_FILE_BYTES } = {}) {
    this.workspace = workspace
    this.ignoredNames = new Set(ignoredNames)
    this.maxFileBytes = maxFileBytes
  }

  setWorkspace(workspace) {
    this.workspace = workspace
  }

  async info() {
    const root = await resolveWorkspaceDirectory(this.workspace)
    return {
      root,
      name: path.basename(root) || root,
      separator: path.sep,
    }
  }

  async #resolveExisting(relativePath = '') {
    const root = await resolveWorkspaceDirectory(this.workspace)
    const normalized = normalizeRequestedRelativePath(relativePath)
    const candidate = path.resolve(root, normalized)
    const target = await realpath(candidate)
    if (!isPathInside(root, target)) throw new Error('Chemin hors du workspace interdit.')
    return { root, target, relativePath: portableRelativePath(root, target) }
  }

  async #resolveDestination(relativePath) {
    const root = await resolveWorkspaceDirectory(this.workspace)
    const normalized = normalizeRequestedRelativePath(relativePath)
    if (!normalized) throw new Error('La racine du workspace ne peut pas être remplacée.')
    const target = path.resolve(root, normalized)
    if (!isPathInside(root, target)) throw new Error('Destination hors du workspace interdite.')
    const parent = await realpath(path.dirname(target))
    if (!isPathInside(root, parent)) throw new Error('Destination hors du workspace interdite.')
    return {
      root,
      target,
      relativePath: portableRelativePath(root, target),
      existing: await existingRealPath(target),
    }
  }

  async list(relativePath = '') {
    const resolved = await this.#resolveExisting(relativePath)
    const details = await stat(resolved.target)
    if (!details.isDirectory()) throw new Error('Le chemin demandé n’est pas un dossier.')

    const entries = []
    for (const entry of await readdir(resolved.target, { withFileTypes: true })) {
      if (this.ignoredNames.has(entry.name)) continue
      // Symbolic links stay excluded: following them could escape the workspace or
      // create recursive loops. All regular hidden files/directories remain visible.
      if (entry.isSymbolicLink()) continue
      const absolutePath = path.join(resolved.target, entry.name)
      const kind = entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other'
      if (kind === 'other') continue
      entries.push({
        name: entry.name,
        kind,
        relativePath: portableRelativePath(resolved.root, absolutePath),
        extension: kind === 'file' ? path.extname(entry.name).toLowerCase() : '',
      })
    }

    entries.sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === 'directory' ? -1 : 1
      return left.name.localeCompare(right.name, 'fr', { numeric: true, sensitivity: 'base' })
    })

    return {
      workspace: resolved.root,
      relativePath: resolved.relativePath,
      entries,
    }
  }

  async read(relativePath) {
    const resolved = await this.#resolveExisting(relativePath)
    const details = await stat(resolved.target)
    if (!details.isFile()) throw new Error('Le chemin demandé n’est pas un fichier.')
    if (details.size > this.maxFileBytes) {
      throw new Error(`Fichier trop volumineux pour l’aperçu (${details.size} octets, maximum ${this.maxFileBytes}).`)
    }

    const buffer = await readFile(resolved.target)
    const binary = looksBinary(buffer)
    return {
      workspace: resolved.root,
      relativePath: resolved.relativePath,
      name: path.basename(resolved.target),
      size: details.size,
      modifiedAt: details.mtime.toISOString(),
      language: languageForFile(resolved.target),
      binary,
      content: binary ? '' : buffer.toString('utf8'),
    }
  }

  async write(relativePath, content, { expectedModifiedAt } = {}) {
    if (typeof content !== 'string') throw new Error('Le contenu du fichier doit être une chaîne de caractères.')
    const contentBytes = Buffer.byteLength(content, 'utf8')
    if (contentBytes > this.maxFileBytes) {
      throw new Error(`Fichier trop volumineux pour l’éditeur (${contentBytes} octets, maximum ${this.maxFileBytes}).`)
    }

    const resolved = await this.#resolveExisting(relativePath)
    const details = await stat(resolved.target)
    if (!details.isFile()) throw new Error('Le chemin demandé n’est pas un fichier.')

    const currentBuffer = await readFile(resolved.target)
    if (looksBinary(currentBuffer)) throw new Error('Les fichiers binaires ne peuvent pas être modifiés dans l’éditeur intégré.')

    const currentModifiedAt = details.mtime.toISOString()
    if (expectedModifiedAt && expectedModifiedAt !== currentModifiedAt) {
      const error = new Error('Conflit de sauvegarde : le fichier a été modifié sur le disque depuis son ouverture. Recharge-le avant d’enregistrer.')
      error.code = 'FILE_CONFLICT'
      error.currentModifiedAt = currentModifiedAt
      throw error
    }

    await writeFile(resolved.target, content, { encoding: 'utf8', flag: 'w' })
    return this.read(resolved.relativePath)
  }

  async renameEntry(relativePath, newName) {
    const source = await this.#resolveExisting(relativePath)
    if (!source.relativePath) throw new Error('La racine du workspace ne peut pas être renommée.')
    const safeName = validateEntryName(newName)
    const destinationRelativePath = portableRelativePath(
      source.root,
      path.join(path.dirname(source.target), safeName),
    )
    const destination = await this.#resolveDestination(destinationRelativePath)

    if (destination.existing && destination.existing !== source.target) {
      throw new Error(`Un élément nommé « ${safeName} » existe déjà dans ce dossier.`)
    }
    if (destination.target === source.target) {
      return { moved: false, from: source.relativePath, to: source.relativePath, name: path.basename(source.target) }
    }

    await rename(source.target, destination.target)
    return {
      moved: true,
      from: source.relativePath,
      to: destination.relativePath,
      name: safeName,
    }
  }

  async moveEntry(relativePath, targetDirectoryRelativePath = '') {
    const source = await this.#resolveExisting(relativePath)
    if (!source.relativePath) throw new Error('La racine du workspace ne peut pas être déplacée.')
    const targetDirectory = await this.#resolveExisting(targetDirectoryRelativePath)
    const targetDetails = await stat(targetDirectory.target)
    if (!targetDetails.isDirectory()) throw new Error('La destination doit être un dossier.')

    const sourceDetails = await stat(source.target)
    if (sourceDetails.isDirectory() && isPathInside(source.target, targetDirectory.target)) {
      throw new Error('Un dossier ne peut pas être déplacé dans lui-même ou dans l’un de ses sous-dossiers.')
    }

    const destinationRelativePath = portableRelativePath(
      source.root,
      path.join(targetDirectory.target, path.basename(source.target)),
    )
    const destination = await this.#resolveDestination(destinationRelativePath)

    if (destination.target === source.target) {
      return { moved: false, from: source.relativePath, to: source.relativePath, name: path.basename(source.target) }
    }
    if (destination.existing) {
      throw new Error(`Un élément nommé « ${path.basename(source.target)} » existe déjà dans le dossier de destination.`)
    }

    await rename(source.target, destination.target)
    return {
      moved: true,
      from: source.relativePath,
      to: destination.relativePath,
      name: path.basename(source.target),
    }
  }

  async absolutePath(relativePath = '') {
    const resolved = await this.#resolveExisting(relativePath)
    return resolved.target
  }
}
