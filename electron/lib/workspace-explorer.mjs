import { readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

const DEFAULT_IGNORED_NAMES = new Set([
  '.git',
  '.ide-ai',
  '.openfox',
  'node_modules',
  'release',
  'dist',
  'build',
  'coverage',
  '.next',
  '.cache',
])

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

  async list(relativePath = '') {
    const resolved = await this.#resolveExisting(relativePath)
    const details = await stat(resolved.target)
    if (!details.isDirectory()) throw new Error('Le chemin demandé n’est pas un dossier.')

    const entries = []
    for (const entry of await readdir(resolved.target, { withFileTypes: true })) {
      if (this.ignoredNames.has(entry.name)) continue
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

  async absolutePath(relativePath = '') {
    const resolved = await this.#resolveExisting(relativePath)
    return resolved.target
  }
}
