const api = window.desktopAPI

if (!api?.workspace) {
  throw new Error('Le pont Electron desktopAPI n’est pas disponible.')
}

const elements = {
  workspaceName: document.querySelector('#workspace-name'),
  workspacePath: document.querySelector('#workspace-path'),
  workspacePathForm: document.querySelector('#workspace-path-form'),
  chooseWorkspace: document.querySelector('#choose-workspace'),
  refreshTree: document.querySelector('#refresh-tree'),
  refreshSessions: document.querySelector('#refresh-sessions'),
  syncDot: document.querySelector('#workspace-sync-dot'),
  syncLabel: document.querySelector('#workspace-sync-label'),
  openFoxProject: document.querySelector('#openfox-project'),
  openFoxSession: document.querySelector('#openfox-session'),
  treeStatus: document.querySelector('#tree-status'),
  tree: document.querySelector('#workspace-tree'),
  openFoxTab: document.querySelector('#openfox-tab'),
  fileTab: document.querySelector('#file-tab'),
  fileTabIcon: document.querySelector('#file-tab-icon'),
  fileTabLabel: document.querySelector('#file-tab-label'),
  runtimeState: document.querySelector('#runtime-state'),
  editorPanel: document.querySelector('#editor-panel'),
  welcomePanel: document.querySelector('#welcome-panel'),
  editorFileName: document.querySelector('#editor-file-name'),
  editorFilePath: document.querySelector('#editor-file-path'),
  editorFileMeta: document.querySelector('#editor-file-meta'),
  editorContent: document.querySelector('#editor-content'),
  revealFile: document.querySelector('#reveal-file'),
  statusWorkspace: document.querySelector('#status-workspace'),
  statusMessage: document.querySelector('#status-message'),
  welcomeOpenFolder: document.querySelector('#welcome-open-folder'),
  welcomeOpenOpenFox: document.querySelector('#welcome-open-openfox'),
}

const state = {
  workspace: undefined,
  selectedRow: undefined,
  selectedPath: undefined,
  currentFile: undefined,
  mode: 'openfox',
  expandedPaths: new Set(),
  refreshPromise: undefined,
  refreshTimer: undefined,
  sessionRefreshTimer: undefined,
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function setStatus(message) {
  elements.statusMessage.textContent = message
}

function setTreeStatus(message, { error = false } = {}) {
  elements.treeStatus.textContent = message
  elements.treeStatus.classList.toggle('error', error)
}

function renderSync(payload = {}) {
  const context = payload.context ?? payload.sync ?? payload
  const syncState = payload.state ?? context?.syncState ?? 'starting'
  const message = payload.message
    ?? (syncState === 'ready' ? 'Workspace et OpenFox synchronisés' : 'Synchronisation OpenFox…')

  elements.syncDot.className = `sync-dot ${syncState}`
  elements.syncLabel.textContent = message
  elements.syncLabel.title = message
  elements.openFoxProject.textContent = context?.project
    ? `Projet : ${context.project.name}`
    : 'Projet : en attente'
  elements.openFoxProject.title = context?.project?.workdir ?? ''
  elements.openFoxSession.textContent = context?.activeSession
    ? `Session : ${context.activeSession.title}`
    : context?.project
      ? 'Session : aucune session existante'
      : 'Session : en attente'
  elements.openFoxSession.title = context?.activeSession?.id ?? ''
  if (context?.rootPath) elements.statusWorkspace.textContent = context.rootPath
}

function iconForEntry(entry) {
  if (entry.kind === 'directory') return '📁'
  return ({
    '.js': '🟨', '.mjs': '🟨', '.cjs': '🟨', '.ts': '🔷', '.tsx': '🔷', '.jsx': '🟨',
    '.json': '🧩', '.md': '📝', '.html': '🌐', '.css': '🎨', '.scss': '🎨', '.yml': '⚙️', '.yaml': '⚙️',
    '.png': '🖼️', '.jpg': '🖼️', '.jpeg': '🖼️', '.svg': '🖼️', '.pdf': '📕', '.env': '🔐',
  })[entry.extension] ?? '📄'
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

function markSelected(row, relativePath) {
  state.selectedRow?.classList.remove('selected')
  state.selectedRow = row
  state.selectedPath = relativePath
  state.selectedRow.classList.add('selected')
}

async function setMode(mode) {
  state.mode = mode
  await api.layout.setMode(mode)
  elements.openFoxTab.classList.toggle('active', mode === 'openfox')
  elements.fileTab.classList.toggle('active', mode === 'editor')
  elements.editorPanel.classList.toggle('hidden', mode !== 'editor')
  elements.welcomePanel.classList.toggle('hidden', mode === 'openfox' || mode === 'editor')
}

function displayFile(file, entry) {
  state.currentFile = file
  elements.fileTab.classList.remove('hidden')
  elements.fileTabIcon.textContent = entry ? iconForEntry(entry) : '📄'
  elements.fileTabLabel.textContent = file.name
  elements.fileTab.title = file.relativePath
  elements.editorFileName.textContent = file.name
  elements.editorFilePath.textContent = file.relativePath
  elements.editorFileMeta.textContent = `${file.language} · ${formatBytes(file.size)}`
  elements.editorContent.textContent = file.binary
    ? 'Aperçu indisponible : ce fichier est binaire. Utilise « Afficher dans l’Explorateur Windows » pour l’ouvrir avec une application adaptée.'
    : file.content
}

async function openFile(entry, row) {
  markSelected(row, entry.relativePath)
  setStatus(`Ouverture de ${entry.relativePath}…`)
  try {
    const file = await api.workspace.readFile(entry.relativePath)
    displayFile(file, entry)
    await setMode('editor')
    setStatus(file.binary ? 'Fichier binaire détecté' : `${file.relativePath} ouvert`)
  } catch (error) {
    setStatus(errorMessage(error))
  }
}

async function reloadCurrentFile(changes) {
  if (!state.currentFile) return
  const touched = changes.some((change) =>
    change.relativePath === state.currentFile.relativePath
    || state.currentFile.relativePath.startsWith(`${change.relativePath}/`),
  )
  if (!touched) return
  try {
    const file = await api.workspace.readFile(state.currentFile.relativePath)
    displayFile(file)
  } catch {
    state.currentFile = undefined
    elements.fileTab.classList.add('hidden')
    if (state.mode === 'editor') await setMode('openfox')
  }
}

function createTreeRow(entry, depth) {
  const wrapper = document.createElement('div')
  const row = document.createElement('div')
  const toggle = document.createElement('span')
  const icon = document.createElement('span')
  const label = document.createElement('span')
  const children = document.createElement('div')

  wrapper.className = 'tree-node'
  row.className = 'tree-row'
  row.tabIndex = 0
  row.setAttribute('role', 'treeitem')
  row.style.paddingLeft = `${6 + depth * 16}px`
  row.title = entry.relativePath
  toggle.className = 'tree-toggle'
  toggle.textContent = entry.kind === 'directory' ? '›' : ''
  icon.className = 'tree-icon'
  icon.textContent = iconForEntry(entry)
  label.className = 'tree-label'
  label.textContent = entry.name
  children.className = 'tree-children hidden'
  children.setAttribute('role', 'group')

  row.append(toggle, icon, label)
  wrapper.append(row, children)
  if (state.selectedPath === entry.relativePath) markSelected(row, entry.relativePath)

  let expanded = false
  let loaded = false

  const loadChildren = async () => {
    if (loaded) return
    children.innerHTML = '<div class="tree-empty">Chargement…</div>'
    try {
      const result = await api.workspace.list(entry.relativePath)
      children.replaceChildren()
      if (result.entries.length === 0) {
        const empty = document.createElement('div')
        empty.className = 'tree-empty'
        empty.textContent = 'Dossier vide'
        children.append(empty)
      } else {
        for (const child of result.entries) children.append(createTreeRow(child, depth + 1))
      }
      loaded = true
    } catch (error) {
      children.replaceChildren()
      const failure = document.createElement('div')
      failure.className = 'tree-empty'
      failure.textContent = errorMessage(error)
      children.append(failure)
    }
  }

  const activate = async ({ forceExpand = false } = {}) => {
    if (entry.kind === 'file') {
      await openFile(entry, row)
      return
    }

    markSelected(row, entry.relativePath)
    expanded = forceExpand ? true : !expanded
    toggle.textContent = expanded ? '⌄' : '›'
    children.classList.toggle('hidden', !expanded)
    row.setAttribute('aria-expanded', String(expanded))
    if (expanded) state.expandedPaths.add(entry.relativePath)
    else state.expandedPaths.delete(entry.relativePath)
    if (expanded) await loadChildren()
  }

  row.addEventListener('click', () => void activate())
  row.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      void activate()
    }
  })

  if (entry.kind === 'directory' && state.expandedPaths.has(entry.relativePath)) {
    queueMicrotask(() => void activate({ forceExpand: true }))
  }
  return wrapper
}

async function refreshTree() {
  if (state.refreshPromise) return state.refreshPromise
  state.refreshPromise = (async () => {
    elements.tree.replaceChildren()
    setTreeStatus('Lecture de l’arborescence…')
    try {
      const info = await api.workspace.current()
      state.workspace = info.root
      elements.workspaceName.textContent = info.name
      elements.workspaceName.title = info.root
      elements.workspacePath.value = info.root
      elements.statusWorkspace.textContent = info.root
      renderSync(info.sync ?? {})

      const result = await api.workspace.list('')
      if (result.entries.length === 0) {
        const empty = document.createElement('div')
        empty.className = 'tree-empty'
        empty.textContent = 'Ce workspace est vide.'
        elements.tree.append(empty)
      } else {
        for (const entry of result.entries) elements.tree.append(createTreeRow(entry, 0))
      }
      setTreeStatus(`${result.entries.length} éléments à la racine`)
      setStatus('Workspace chargé')
    } catch (error) {
      setTreeStatus(errorMessage(error), { error: true })
      setStatus('Impossible de charger le workspace')
    }
  })().finally(() => {
    state.refreshPromise = undefined
  })
  return state.refreshPromise
}

function scheduleTreeRefresh(delay = 280) {
  clearTimeout(state.refreshTimer)
  state.refreshTimer = setTimeout(() => void refreshTree(), delay)
}

async function chooseWorkspace() {
  setStatus('Ouverture du sélecteur et synchronisation OpenFox…')
  try {
    const result = await api.workspace.choose()
    if (!result.canceled) {
      state.expandedPaths.clear()
      state.selectedPath = undefined
      await refreshTree()
      setStatus(`Projet OpenFox actif : ${result.project?.name ?? result.workspace}`)
    } else {
      setStatus('Sélection annulée')
    }
  } catch (error) {
    setStatus(errorMessage(error))
  }
}

async function openTypedWorkspace(event) {
  event?.preventDefault()
  const requested = elements.workspacePath.value.trim()
  if (!requested) return
  setStatus(`Ouverture et synchronisation de ${requested}…`)
  try {
    const result = await api.workspace.openPath(requested)
    state.expandedPaths.clear()
    state.selectedPath = undefined
    await refreshTree()
    setStatus(`Projet OpenFox actif : ${result.project?.name ?? requested}`)
  } catch (error) {
    setStatus(errorMessage(error))
  }
}

async function refreshSessions() {
  setStatus('Actualisation des sessions OpenFox…')
  try {
    const context = await api.workspace.refreshSessions()
    renderSync(context)
    setStatus(`${context.sessions?.length ?? 0} session(s) OpenFox chargée(s)`)
  } catch (error) {
    setStatus(errorMessage(error))
  }
}

function updateRuntimeStatus(payload) {
  const stateName = payload?.state ?? 'starting'
  elements.runtimeState.className = `runtime-state ${stateName}`
  elements.runtimeState.textContent = payload?.message ?? `OpenFox : ${stateName}`
}

elements.chooseWorkspace.addEventListener('click', chooseWorkspace)
elements.welcomeOpenFolder.addEventListener('click', chooseWorkspace)
elements.refreshTree.addEventListener('click', refreshTree)
elements.refreshSessions.addEventListener('click', refreshSessions)
elements.workspacePathForm.addEventListener('submit', openTypedWorkspace)
elements.openFoxTab.addEventListener('click', () => setMode('openfox'))
elements.welcomeOpenOpenFox.addEventListener('click', () => setMode('openfox'))
elements.fileTab.addEventListener('click', () => state.currentFile && setMode('editor'))
elements.revealFile.addEventListener('click', async () => {
  if (!state.currentFile) return
  try {
    await api.workspace.reveal(state.currentFile.relativePath)
  } catch (error) {
    setStatus(errorMessage(error))
  }
})

api.workspace.onChanged((context) => {
  renderSync(context)
  scheduleTreeRefresh(60)
})
api.workspace.onSyncStatus(renderSync)
api.workspace.onFilesChanged((payload) => {
  const changes = Array.isArray(payload?.changes) ? payload.changes : []
  const count = changes.length
  setStatus(`${count} changement(s) détecté(s) dans le workspace`)
  void reloadCurrentFile(changes)
  scheduleTreeRefresh()
})
api.runtime.onStatus(updateRuntimeStatus)
api.openFox?.onNavigated(({ url }) => {
  if (!/\/p\/[^/]+/.test(new URL(url).pathname)) return
  clearTimeout(state.sessionRefreshTimer)
  state.sessionRefreshTimer = setTimeout(() => void refreshSessions(), 700)
})

Promise.all([refreshTree(), setMode('openfox')]).catch((error) => {
  setStatus(errorMessage(error))
})
