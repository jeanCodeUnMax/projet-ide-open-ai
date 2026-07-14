const api = window.desktopAPI

const elements = {
  workspaceName: document.querySelector('#workspace-name'),
  workspacePath: document.querySelector('#workspace-path'),
  workspacePathForm: document.querySelector('#workspace-path-form'),
  chooseWorkspace: document.querySelector('#choose-workspace'),
  refreshTree: document.querySelector('#refresh-tree'),
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
  currentFile: undefined,
  mode: 'openfox',
}

function setStatus(message) {
  elements.statusMessage.textContent = message
}

function setTreeStatus(message, { error = false } = {}) {
  elements.treeStatus.textContent = message
  elements.treeStatus.classList.toggle('error', error)
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

function markSelected(row) {
  state.selectedRow?.classList.remove('selected')
  state.selectedRow = row
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

async function openFile(entry, row) {
  markSelected(row)
  setStatus(`Ouverture de ${entry.relativePath}…`)
  try {
    const file = await api.workspace.readFile(entry.relativePath)
    state.currentFile = file
    elements.fileTab.classList.remove('hidden')
    elements.fileTabIcon.textContent = iconForEntry(entry)
    elements.fileTabLabel.textContent = file.name
    elements.fileTab.title = file.relativePath
    elements.editorFileName.textContent = file.name
    elements.editorFilePath.textContent = file.relativePath
    elements.editorFileMeta.textContent = `${file.language} · ${formatBytes(file.size)}`
    elements.editorContent.textContent = file.binary
      ? 'Aperçu indisponible : ce fichier est binaire. Utilise « Afficher dans l’Explorateur Windows » pour l’ouvrir avec une application adaptée.'
      : file.content
    await setMode('editor')
    setStatus(file.binary ? 'Fichier binaire détecté' : `${file.relativePath} ouvert`)
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error))
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

  let expanded = false
  let loaded = false
  const activate = async () => {
    if (entry.kind === 'file') {
      await openFile(entry, row)
      return
    }

    markSelected(row)
    expanded = !expanded
    toggle.textContent = expanded ? '⌄' : '›'
    children.classList.toggle('hidden', !expanded)
    row.setAttribute('aria-expanded', String(expanded))
    if (!expanded || loaded) return

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
      failure.textContent = error instanceof Error ? error.message : String(error)
      children.append(failure)
    }
  }

  row.addEventListener('click', activate)
  row.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      void activate()
    }
  })
  return wrapper
}

async function refreshTree() {
  elements.tree.replaceChildren()
  setTreeStatus('Lecture de l’arborescence…')
  try {
    const info = await api.workspace.current()
    state.workspace = info.root
    elements.workspaceName.textContent = info.name
    elements.workspaceName.title = info.root
    elements.workspacePath.value = info.root
    elements.statusWorkspace.textContent = info.root
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
    setTreeStatus(error instanceof Error ? error.message : String(error), { error: true })
    setStatus('Impossible de charger le workspace')
  }
}

async function chooseWorkspace() {
  setStatus('Ouverture du sélecteur de dossier…')
  try {
    const result = await api.workspace.choose()
    if (!result.canceled) await refreshTree()
    else setStatus('Sélection annulée')
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error))
  }
}

async function openTypedWorkspace(event) {
  event?.preventDefault()
  const requested = elements.workspacePath.value.trim()
  if (!requested) return
  setStatus(`Ouverture de ${requested}…`)
  try {
    await api.workspace.openPath(requested)
    await refreshTree()
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error))
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
elements.workspacePathForm.addEventListener('submit', openTypedWorkspace)
elements.openFoxTab.addEventListener('click', () => setMode('openfox'))
elements.welcomeOpenOpenFox.addEventListener('click', () => setMode('openfox'))
elements.fileTab.addEventListener('click', () => state.currentFile && setMode('editor'))
elements.revealFile.addEventListener('click', async () => {
  if (!state.currentFile) return
  try {
    await api.workspace.reveal(state.currentFile.relativePath)
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error))
  }
})

api.workspace.onChanged(() => refreshTree())
api.runtime.onStatus(updateRuntimeStatus)

Promise.all([refreshTree(), setMode('openfox')]).catch((error) => {
  setStatus(error instanceof Error ? error.message : String(error))
})
