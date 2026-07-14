import { EventEmitter } from 'node:events'
import path from 'node:path'
import { resolveWorkspaceDirectory } from './workspace-explorer.mjs'
import {
  normalizePath,
  OpenFoxSessionClient,
  OpenFoxSessionRegistry,
  projectNameForWorkspace,
} from './openfox-session-client.mjs'
import { WorkspaceFileWatcher } from './workspace-file-watcher.mjs'

function publicSession(session) {
  if (!session) return undefined
  return {
    id: session.id,
    title: session.title ?? 'Session sans titre',
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    isRunning: Boolean(session.isRunning),
  }
}

function publicProject(project) {
  if (!project) return undefined
  return {
    id: project.id,
    name: project.name,
    workdir: project.workdir,
  }
}

export class WorkspaceManager extends EventEmitter {
  constructor({
    runtime,
    initialWorkspace,
    persistWorkspace,
    applyWorkspace,
    registryPath,
    clientFactory = (baseUrl) => new OpenFoxSessionClient({ baseUrl }),
    watcherFactory = (workspace) => new WorkspaceFileWatcher({ workspace }),
  } = {}) {
    super()
    if (!runtime) throw new Error('runtime est obligatoire pour WorkspaceManager.')
    if (typeof persistWorkspace !== 'function') throw new Error('persistWorkspace est obligatoire.')
    if (typeof applyWorkspace !== 'function') throw new Error('applyWorkspace est obligatoire.')
    if (!registryPath) throw new Error('registryPath est obligatoire.')

    this.runtime = runtime
    this.rootPath = path.resolve(String(initialWorkspace ?? ''))
    this.persistWorkspace = persistWorkspace
    this.applyWorkspace = applyWorkspace
    this.registry = new OpenFoxSessionRegistry({ filePath: registryPath })
    this.clientFactory = clientFactory
    this.watcherFactory = watcherFactory
    this.watcher = undefined
    this.context = {
      rootPath: this.rootPath,
      syncState: 'starting',
      project: undefined,
      activeSession: undefined,
      sessions: [],
      openFoxUrl: runtime.baseUrl,
    }
    this.switchPromise = undefined
  }

  status() {
    return structuredClone(this.context)
  }

  async initialize() {
    const root = await resolveWorkspaceDirectory(this.rootPath)
    await this.applyWorkspace(root)
    const context = await this.#synchronizeOpenFox(root)
    this.rootPath = root
    this.context = { ...context, syncState: 'ready' }
    await this.#startWatcher(root)
    this.emit('changed', this.status())
    this.#emitStatus('ready', `Workspace synchronisé avec OpenFox : ${context.project.name}`)
    return this.status()
  }

  async switchWorkspace(candidate) {
    if (this.switchPromise) return this.switchPromise
    this.switchPromise = this.#switchWorkspace(candidate).finally(() => {
      this.switchPromise = undefined
    })
    return this.switchPromise
  }

  async #switchWorkspace(candidate) {
    const nextRoot = await resolveWorkspaceDirectory(candidate)
    if (normalizePath(nextRoot) === normalizePath(this.rootPath)) {
      return this.resynchronize()
    }

    const previousRoot = this.rootPath
    const previousContext = this.status()
    this.#emitStatus('switching', `Synchronisation du workspace ${nextRoot}…`)
    this.#stopWatcher()

    try {
      await this.runtime.restart({ workspace: nextRoot })
      await this.persistWorkspace(nextRoot)
      await this.applyWorkspace(nextRoot)
      const context = await this.#synchronizeOpenFox(nextRoot)
      this.rootPath = nextRoot
      this.context = { ...context, syncState: 'ready' }
      await this.#startWatcher(nextRoot)
      this.emit('changed', this.status())
      this.#emitStatus('ready', `Projet OpenFox actif : ${context.project.name}`)
      return this.status()
    } catch (error) {
      const originalMessage = error instanceof Error ? error.message : String(error)
      this.#emitStatus('rollback', `Échec de synchronisation, restauration de ${previousRoot}…`)
      try {
        await this.runtime.restart({ workspace: previousRoot })
        await this.persistWorkspace(previousRoot)
        await this.applyWorkspace(previousRoot)
        const restored = await this.#synchronizeOpenFox(previousRoot)
        this.rootPath = previousRoot
        this.context = { ...restored, syncState: 'ready' }
        await this.#startWatcher(previousRoot)
        this.emit('changed', this.status())
      } catch (rollbackError) {
        this.rootPath = previousRoot
        this.context = { ...previousContext, syncState: 'error' }
        const rollbackMessage = rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
        this.#emitStatus('error', `Rollback impossible : ${rollbackMessage}`)
        const fatal = new Error(`Le changement de workspace a échoué (${originalMessage}) et le rollback a échoué (${rollbackMessage}).`)
        fatal.cause = error
        throw fatal
      }

      this.#emitStatus('error', `Workspace non modifié : ${originalMessage}`)
      const failure = new Error(`Impossible de synchroniser le workspace avec OpenFox. ${originalMessage}`)
      failure.cause = error
      throw failure
    }
  }

  async resynchronize({ runtimeAlreadyRestarted = false } = {}) {
    this.#emitStatus('switching', 'Resynchronisation du projet et des sessions OpenFox…')
    if (!runtimeAlreadyRestarted) await this.runtime.restart({ workspace: this.rootPath })
    await this.persistWorkspace(this.rootPath)
    await this.applyWorkspace(this.rootPath)
    const context = await this.#synchronizeOpenFox(this.rootPath)
    this.context = { ...context, syncState: 'ready' }
    await this.#startWatcher(this.rootPath)
    this.emit('changed', this.status())
    this.#emitStatus('ready', `Workspace synchronisé avec OpenFox : ${context.project.name}`)
    return this.status()
  }

  async refreshSessions() {
    if (!this.context.project?.id) return this.resynchronize({ runtimeAlreadyRestarted: true })
    const client = this.clientFactory(this.runtime.baseUrl)
    const { sessions } = await client.listSessions(this.context.project.id)
    const activeSession = client.selectSession(sessions, this.context.activeSession?.id)
    this.context = {
      ...this.context,
      sessions: sessions.map(publicSession),
      activeSession: publicSession(activeSession),
      openFoxUrl: client.projectUrl(this.context.project.id, activeSession?.id),
    }
    await this.registry.set(normalizePath(this.rootPath), {
      projectId: this.context.project.id,
      sessionId: activeSession?.id,
    })
    this.emit('changed', this.status())
    return this.status()
  }

  async #synchronizeOpenFox(root) {
    const client = this.clientFactory(this.runtime.baseUrl)
    await client.health()
    const project = await client.ensureProject({
      workspace: root,
      name: projectNameForWorkspace(root),
    })
    const { sessions } = await client.listSessions(project.id)
    const saved = await this.registry.get(normalizePath(root))
    const preferredSessionId = saved?.projectId === project.id ? saved.sessionId : undefined
    const activeSession = client.selectSession(sessions, preferredSessionId)

    await this.registry.set(normalizePath(root), {
      projectId: project.id,
      sessionId: activeSession?.id,
    })

    return {
      rootPath: root,
      project: publicProject(project),
      sessions: sessions.map(publicSession),
      activeSession: publicSession(activeSession),
      openFoxUrl: client.projectUrl(project.id, activeSession?.id),
    }
  }

  async #startWatcher(root) {
    this.#stopWatcher()
    const watcher = this.watcherFactory(root)
    this.watcher = watcher
    watcher.on('change', (payload) => this.emit('files-changed', payload))
    watcher.on('ready', (payload) => this.emit('watcher-ready', payload))
    watcher.on('warning', (payload) => this.emit('watcher-warning', payload))
    watcher.on('error', (error) => this.emit('watcher-error', error))
    await watcher.start()
  }

  #stopWatcher() {
    this.watcher?.stop()
    this.watcher = undefined
  }

  #emitStatus(state, message) {
    this.context = { ...this.context, syncState: state }
    this.emit('status', { state, message, context: this.status() })
  }

  stop() {
    this.#stopWatcher()
  }
}
