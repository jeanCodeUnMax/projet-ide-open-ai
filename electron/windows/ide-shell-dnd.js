'use strict'

const dndApi = window.desktopAPI
const WORKSPACE_ENTRY_MIME = 'application/x-ide-open-ai-workspace-entry'
const WORKSPACE_TEXT_PREFIX = 'ide-open-ai-workspace:'

if (!dndApi?.workspace?.importDroppedPaths || !dndApi.workspace.pathForFile || !dndApi.workspace.moveEntry) {
  throw new Error('Le pont de glisser-déposer du workspace est indisponible.')
}

const dndElements = {
  sidebar: document.querySelector('#workspace-sidebar'),
  tree: document.querySelector('#workspace-tree'),
  overlay: document.querySelector('#workspace-drop-overlay'),
  overlayTitle: document.querySelector('#workspace-drop-title'),
  overlayTarget: document.querySelector('#workspace-drop-target'),
  status: document.querySelector('#status-message'),
  refresh: document.querySelector('#refresh-tree'),
  editorPath: document.querySelector('#editor-file-path'),
  editorDirty: document.querySelector('#editor-dirty'),
}

let dragDepth = 0
let activeDropRow

function setDndStatus(message) {
  if (dndElements.status) dndElements.status.textContent = message
}

function parseWorkspaceEntry(raw) {
  if (!raw) return undefined
  try {
    const entry = JSON.parse(raw)
    if (!entry || typeof entry.relativePath !== 'string' || entry.relativePath.trim() === '') return undefined
    return {
      relativePath: entry.relativePath.replace(/\\/g, '/').replace(/^\/+/, ''),
      kind: entry.kind === 'directory' ? 'directory' : 'file',
    }
  } catch {
    return undefined
  }
}

function transferredWorkspaceEntry(dataTransfer) {
  if (!dataTransfer) return undefined
  const custom = parseWorkspaceEntry(dataTransfer.getData(WORKSPACE_ENTRY_MIME))
  if (custom) return custom
  const plain = dataTransfer.getData('text/plain')
  return plain?.startsWith(WORKSPACE_TEXT_PREFIX)
    ? parseWorkspaceEntry(plain.slice(WORKSPACE_TEXT_PREFIX.length))
    : undefined
}

function entryForRow(row) {
  if (!(row instanceof HTMLElement)) return undefined
  const relativePath = row.dataset.ideRelativePath || row.title?.split('\n')[0]?.trim()
  if (!relativePath) return undefined
  const toggle = row.querySelector('.tree-toggle')
  const kind = row.dataset.ideEntryKind || (toggle?.textContent ? 'directory' : 'file')
  return { relativePath, kind }
}

function rowDirectoryTarget(target) {
  const row = target instanceof Element ? target.closest('.tree-row') : null
  const entry = entryForRow(row)
  return entry?.kind === 'directory' ? { row, relativePath: entry.relativePath } : undefined
}

function isExternalFileDrag(dataTransfer) {
  return Array.from(dataTransfer?.types ?? []).includes('Files')
}

function isWorkspaceEntryDrag(dataTransfer) {
  return Array.from(dataTransfer?.types ?? []).includes(WORKSPACE_ENTRY_MIME)
}

function clearDropTarget() {
  activeDropRow?.classList.remove('drop-target')
  activeDropRow = undefined
}

function hideDropOverlay() {
  dragDepth = 0
  clearDropTarget()
  dndElements.sidebar?.classList.remove('drop-active')
  dndElements.overlay?.classList.add('hidden')
}

function showDropOverlay(target, { mode = 'import' } = {}) {
  clearDropTarget()
  if (target?.row) {
    activeDropRow = target.row
    activeDropRow.classList.add('drop-target')
  }
  dndElements.sidebar?.classList.add('drop-active')
  dndElements.overlay?.classList.remove('hidden')
  if (dndElements.overlayTitle) {
    dndElements.overlayTitle.textContent = mode === 'move' ? 'Déplacer dans le workspace' : 'Déposer dans le workspace'
  }
  if (dndElements.overlayTarget) {
    dndElements.overlayTarget.textContent = target?.relativePath || 'Racine du projet'
  }
}

function affectsPath(entryPath, candidatePath) {
  return Boolean(entryPath && candidatePath)
    && (candidatePath === entryPath || candidatePath.startsWith(`${entryPath}/`))
}

function confirmDirtyMove(entry) {
  const currentPath = dndElements.editorPath?.textContent?.trim()
  const dirty = dndElements.editorDirty && !dndElements.editorDirty.classList.contains('hidden')
  if (!dirty || !affectsPath(entry.relativePath, currentPath)) return true
  return window.confirm(
    `Le fichier « ${currentPath} » contient des modifications non enregistrées. Les abandonner avant de déplacer « ${entry.relativePath} » ?`,
  )
}

function enableTreeRowDrag(row) {
  if (!(row instanceof HTMLElement) || row.dataset.ideDndReady === 'true') return
  const entry = entryForRow(row)
  if (!entry) return
  row.dataset.ideDndReady = 'true'
  row.dataset.ideRelativePath = entry.relativePath
  row.dataset.ideEntryKind = entry.kind
  row.draggable = true
  row.title = `${entry.relativePath}\nGlisser sur un dossier pour déplacer, ou vers le chat OpenFox pour ajouter au contexte.`

  row.addEventListener('dragstart', (event) => {
    if (!event.dataTransfer) return
    const payload = JSON.stringify(entry)
    row.classList.add('dragging')
    event.dataTransfer.effectAllowed = 'copyMove'
    event.dataTransfer.setData(WORKSPACE_ENTRY_MIME, payload)
    event.dataTransfer.setData('text/plain', `${WORKSPACE_TEXT_PREFIX}${payload}`)
    setDndStatus(`${entry.relativePath} : déplace-le dans l’explorateur ou dépose-le dans OpenFox`)
  })

  row.addEventListener('dragend', () => {
    row.classList.remove('dragging')
    hideDropOverlay()
  })
}

function scanTreeRows(root = dndElements.tree) {
  if (!root) return
  if (root instanceof HTMLElement && root.matches('.tree-row')) enableTreeRowDrag(root)
  for (const row of root.querySelectorAll?.('.tree-row') ?? []) enableTreeRowDrag(row)
}

const treeObserver = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node instanceof HTMLElement) scanTreeRows(node)
    }
  }
})

if (dndElements.tree) {
  scanTreeRows()
  treeObserver.observe(dndElements.tree, { childList: true, subtree: true })
}

dndElements.sidebar?.addEventListener('dragenter', (event) => {
  const internal = isWorkspaceEntryDrag(event.dataTransfer)
  const external = isExternalFileDrag(event.dataTransfer) && !internal
  if (!internal && !external) return
  event.preventDefault()
  dragDepth += 1
  showDropOverlay(rowDirectoryTarget(event.target), { mode: internal ? 'move' : 'import' })
})

dndElements.sidebar?.addEventListener('dragover', (event) => {
  const internal = isWorkspaceEntryDrag(event.dataTransfer)
  const external = isExternalFileDrag(event.dataTransfer) && !internal
  if (!internal && !external) return
  event.preventDefault()
  event.stopPropagation()
  if (event.dataTransfer) event.dataTransfer.dropEffect = internal ? 'move' : 'copy'
  showDropOverlay(rowDirectoryTarget(event.target), { mode: internal ? 'move' : 'import' })
})

dndElements.sidebar?.addEventListener('dragleave', (event) => {
  const internal = isWorkspaceEntryDrag(event.dataTransfer)
  const external = isExternalFileDrag(event.dataTransfer) && !internal
  if (!internal && !external) return
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0 || event.relatedTarget === null) hideDropOverlay()
})

dndElements.sidebar?.addEventListener('drop', async (event) => {
  const internal = isWorkspaceEntryDrag(event.dataTransfer)
  const external = isExternalFileDrag(event.dataTransfer) && !internal
  if (!internal && !external) return
  event.preventDefault()
  event.stopPropagation()
  const target = rowDirectoryTarget(event.target)
  hideDropOverlay()

  if (internal) {
    const source = transferredWorkspaceEntry(event.dataTransfer)
    if (!source || !confirmDirtyMove(source)) return
    setDndStatus(`Déplacement de ${source.relativePath} vers ${target?.relativePath || 'la racine'}…`)
    try {
      const result = await dndApi.workspace.moveEntry({
        relativePath: source.relativePath,
        targetDirectoryRelativePath: target?.relativePath || '',
      })
      dndElements.refresh?.click()
      window.dispatchEvent(new CustomEvent('workspace-entry-moved', { detail: result }))
    } catch (error) {
      setDndStatus(error instanceof Error ? error.message : String(error))
    }
    return
  }

  const files = Array.from(event.dataTransfer?.files ?? [])
  if (files.length === 0) return

  const sourcePaths = files
    .map((file) => dndApi.workspace.pathForFile(file))
    .filter((filePath) => typeof filePath === 'string' && filePath.trim() !== '')
  if (sourcePaths.length === 0) {
    setDndStatus('Impossible de lire les chemins des éléments déposés.')
    return
  }

  setDndStatus(`Import de ${sourcePaths.length} élément(s) dans ${target?.relativePath || 'la racine'}…`)
  try {
    const result = await dndApi.workspace.importDroppedPaths({
      sourcePaths,
      targetRelativePath: target?.relativePath || '',
    })
    const importedCount = result.imported?.length ?? 0
    const skippedCount = result.skipped?.length ?? 0
    dndElements.refresh?.click()
    setDndStatus(`${importedCount} élément(s) importé(s)${skippedCount ? `, ${skippedCount} déjà présent(s)` : ''}`)
  } catch (error) {
    setDndStatus(error instanceof Error ? error.message : String(error))
  }
})

window.addEventListener('blur', hideDropOverlay)
