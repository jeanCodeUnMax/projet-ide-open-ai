import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { OpenFoxSessionClient, projectNameForWorkspace } from '../electron/lib/openfox-session-client.mjs'
import { createSnapshot, shouldIgnore } from '../electron/lib/workspace-file-watcher.mjs'
import { WorkspaceManager } from '../electron/lib/workspace-manager.mjs'

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
}

test('OpenFoxSessionClient crée le projet manquant puis sélectionne la session la plus récente', async () => {
  const calls = []
  let projects = []
  const fetchImpl = async (url, options = {}) => {
    const target = new URL(url)
    calls.push({ path: `${target.pathname}${target.search}`, method: options.method ?? 'GET', body: options.body })
    if (target.pathname === '/api/projects' && (options.method ?? 'GET') === 'GET') {
      return jsonResponse(200, { projects })
    }
    if (target.pathname === '/api/projects' && options.method === 'POST') {
      projects = [{ id: 'project-1', name: 'demo', workdir: 'C:\\demo' }]
      return jsonResponse(201, { project: projects[0] })
    }
    if (target.pathname === '/api/sessions') {
      return jsonResponse(200, {
        sessions: [
          { id: 'old', projectId: 'project-1', updatedAt: '2026-01-01T00:00:00.000Z' },
          { id: 'new', projectId: 'project-1', updatedAt: '2026-02-01T00:00:00.000Z' },
        ],
      })
    }
    throw new Error(`Route non simulée: ${target.pathname}`)
  }

  const client = new OpenFoxSessionClient({ baseUrl: 'http://127.0.0.1:10369', fetchImpl })
  const project = await client.ensureProject({ workspace: 'C:\\demo', name: 'demo' })
  const { sessions } = await client.listSessions(project.id)
  const selected = client.selectSession(sessions)

  assert.equal(project.id, 'project-1')
  assert.equal(selected.id, 'new')
  assert.equal(client.projectUrl(project.id, selected.id), 'http://127.0.0.1:10369/p/project-1/s/new')
  assert.equal(calls.filter((call) => call.method === 'POST').length, 1)
})

test('projectNameForWorkspace produit un nom accepté par OpenFox', () => {
  assert.equal(projectNameForWorkspace('/tmp/mon:projet'), 'mon-projet')
})

test('le snapshot ignore les dossiers techniques et conserve les fichiers utiles', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ide-ai-watch-'))
  try {
    await mkdir(path.join(root, 'src'))
    await mkdir(path.join(root, 'node_modules'))
    await writeFile(path.join(root, 'src', 'index.js'), 'export {}\n')
    await writeFile(path.join(root, 'node_modules', 'ignored.js'), 'x')
    const ignored = new Set(['node_modules'])
    const snapshot = await createSnapshot(root, ignored, 100)
    assert.equal(snapshot.has('src'), true)
    assert.equal(snapshot.has('src/index.js'), true)
    assert.equal([...snapshot.keys()].some((entry) => entry.includes('node_modules')), false)
    assert.equal(shouldIgnore('node_modules/pkg/index.js', ignored), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

class FakeWatcher extends EventEmitter {
  async start() {
    this.emit('ready', { mode: 'fake' })
  }
  stop() {}
}

test('WorkspaceManager synchronise projet, sessions et restaure le contexte précédent après un échec', async () => {
  const first = await mkdtemp(path.join(os.tmpdir(), 'ide-ai-first-'))
  const second = await mkdtemp(path.join(os.tmpdir(), 'ide-ai-second-'))
  const registryRoot = await mkdtemp(path.join(os.tmpdir(), 'ide-ai-registry-'))
  const registry = path.join(registryRoot, 'contexts.json')
  const applied = []
  const persisted = []
  const restarts = []
  let failTarget

  const runtime = {
    baseUrl: 'http://127.0.0.1:10369',
    async restart({ workspace }) {
      restarts.push(workspace)
      if (workspace === failTarget) {
        failTarget = undefined
        throw new Error('runtime failure')
      }
    },
  }

  const clientFactory = () => ({
    async health() { return { status: 'ok' } },
    async ensureProject({ workspace }) { return { id: `project:${workspace}`, name: path.basename(workspace), workdir: workspace } },
    async listSessions(projectId) { return { sessions: [{ id: `session:${projectId}`, title: 'Session', updatedAt: '2026-01-01T00:00:00.000Z' }] } },
    selectSession(sessions, preferred) { return sessions.find((entry) => entry.id === preferred) ?? sessions[0] },
    projectUrl(projectId, sessionId) { return `http://127.0.0.1:10369/p/${encodeURIComponent(projectId)}/s/${encodeURIComponent(sessionId)}` },
  })

  const manager = new WorkspaceManager({
    runtime,
    initialWorkspace: first,
    registryPath: registry,
    persistWorkspace: async (workspace) => persisted.push(workspace),
    applyWorkspace: async (workspace) => applied.push(workspace),
    clientFactory,
    watcherFactory: () => new FakeWatcher(),
  })

  try {
    const initial = await manager.initialize()
    assert.equal(initial.rootPath, first)
    assert.match(initial.openFoxUrl, /project%3A/)

    const switched = await manager.switchWorkspace(second)
    assert.equal(switched.rootPath, second)
    assert.equal(restarts.at(-1), second)

    failTarget = first
    await assert.rejects(() => manager.switchWorkspace(first), /Impossible de synchroniser|runtime failure/)
    assert.equal(manager.status().rootPath, second)
    assert.equal(restarts.at(-1), second)
    assert.equal(persisted.includes(second), true)
    assert.equal(applied.includes(second), true)
  } finally {
    manager.stop()
    await rm(first, { recursive: true, force: true })
    await rm(second, { recursive: true, force: true })
    await rm(registryRoot, { recursive: true, force: true })
  }
})
