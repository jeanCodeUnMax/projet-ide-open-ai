import { EventEmitter } from 'node:events'
import { watch } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
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

function portableRelative(root, target) {
  return path.relative(root, target).split(path.sep).join('/')
}

function shouldIgnore(relativePath, ignoredNames) {
  if (!relativePath) return false
  return relativePath.split(/[\\/]+/).some((part) => ignoredNames.has(part))
}

async function createSnapshot(root, ignoredNames, maxEntries) {
  const snapshot = new Map()
  const queue = [root]

  while (queue.length > 0 && snapshot.size < maxEntries) {
    const current = queue.shift()
    let entries
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      const target = path.join(current, entry.name)
      const relativePath = portableRelative(root, target)
      if (shouldIgnore(relativePath, ignoredNames) || entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        snapshot.set(relativePath, 'directory')
        queue.push(target)
      } else if (entry.isFile()) {
        try {
          const details = await stat(target)
          snapshot.set(relativePath, `${details.size}:${details.mtimeMs}`)
        } catch {
          // The file may have disappeared between readdir and stat.
        }
      }
      if (snapshot.size >= maxEntries) break
    }
  }

  return snapshot
}

export class WorkspaceFileWatcher extends EventEmitter {
  constructor({
    workspace,
    ignoredNames = DEFAULT_IGNORED_NAMES,
    debounceMs = 180,
    pollingIntervalMs = 1_500,
    maxSnapshotEntries = 20_000,
  } = {}) {
    super()
    this.workspace = path.resolve(String(workspace ?? ''))
    this.ignoredNames = new Set(ignoredNames)
    this.debounceMs = debounceMs
    this.pollingIntervalMs = pollingIntervalMs
    this.maxSnapshotEntries = maxSnapshotEntries
    this.nativeWatcher = undefined
    this.pollTimer = undefined
    this.flushTimer = undefined
    this.pending = new Map()
    this.snapshot = undefined
    this.running = false
  }

  async start() {
    if (this.running) return
    this.running = true

    try {
      this.nativeWatcher = watch(this.workspace, { recursive: true }, (eventType, filename) => {
        const relativePath = String(filename ?? '').split(path.sep).join('/')
        if (shouldIgnore(relativePath, this.ignoredNames)) return
        this.#queue({ eventType: eventType === 'rename' ? 'structure' : 'change', relativePath })
      })
      this.nativeWatcher.on('error', (error) => {
        this.emit('warning', { message: error.message, fallback: 'polling' })
        this.#startPolling().catch((pollingError) => this.emit('error', pollingError))
      })
      this.emit('ready', { mode: 'native', workspace: this.workspace })
    } catch (error) {
      this.emit('warning', { message: error instanceof Error ? error.message : String(error), fallback: 'polling' })
      await this.#startPolling()
    }
  }

  async #startPolling() {
    if (this.pollTimer) return
    this.nativeWatcher?.close()
    this.nativeWatcher = undefined
    this.snapshot = await createSnapshot(this.workspace, this.ignoredNames, this.maxSnapshotEntries)
    this.pollTimer = setInterval(() => {
      void this.#pollOnce().catch((error) => this.emit('error', error))
    }, this.pollingIntervalMs)
    this.pollTimer.unref?.()
    this.emit('ready', { mode: 'polling', workspace: this.workspace })
  }

  async #pollOnce() {
    if (!this.running) return
    const next = await createSnapshot(this.workspace, this.ignoredNames, this.maxSnapshotEntries)
    const previous = this.snapshot ?? new Map()

    for (const [relativePath, signature] of next) {
      if (!previous.has(relativePath)) this.#queue({ eventType: 'created', relativePath })
      else if (previous.get(relativePath) !== signature) this.#queue({ eventType: 'change', relativePath })
    }
    for (const relativePath of previous.keys()) {
      if (!next.has(relativePath)) this.#queue({ eventType: 'deleted', relativePath })
    }
    this.snapshot = next
  }

  #queue(change) {
    const key = change.relativePath || '__workspace__'
    this.pending.set(key, change)
    clearTimeout(this.flushTimer)
    this.flushTimer = setTimeout(() => this.#flush(), this.debounceMs)
  }

  #flush() {
    if (this.pending.size === 0) return
    const changes = [...this.pending.values()]
    this.pending.clear()
    this.emit('change', {
      workspace: this.workspace,
      changes,
      at: new Date().toISOString(),
    })
  }

  stop() {
    this.running = false
    clearTimeout(this.flushTimer)
    this.flushTimer = undefined
    this.nativeWatcher?.close()
    this.nativeWatcher = undefined
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.pollTimer = undefined
    this.pending.clear()
  }
}

export { DEFAULT_IGNORED_NAMES, createSnapshot, shouldIgnore }
