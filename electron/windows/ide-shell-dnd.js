'use strict'

const dndApi = window.desktopAPI
const WORKSPACE_ENTRY_MIME = 'application/x-ide-open-ai-workspace-entry'
const WORKSPACE_TEXT_PREFIX = 'ide-open-ai-workspace:'

if (!dndApi?.workspace?.importDroppedPaths || !dndApi.workspace.pathForFile) {
  throw new Error('Le pont de glisser-déposer du workspace est indisponible.')
}

const dndElements = {
  sidebar: document.querySelector('#workspace-sidebar'),
  tree: document.querySelector('#workspace-tree'),
  overlay: document.querySelector('#workspace-drop-overlay'),
  overlayTarget: document.querySelector('#workspace-drop-target'),
  status: document.querySelector('#status-message'),
  refresh: document.querySelector('#refresh-tree'),
}

let dragDepth = 0
let activeDropRow

function setDndStatus(message) {
  if (dndElements.status) dndElements.status.textContent = message
}

function entryForRow(row) {
  if (!(row instanceof HTMLElement)) return undefined
  const relativePath = row.dataset.ideRelativePath || row.title?.trim()
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

function showDropOverlay(target) {
  clearDropTarget()
  if (target?.row) {
    activeDropRow = target.row
    activeDropRow.classList.add('drop-target')
  }
  dndElements.sidebar?.classList.add('drop-active')
  dndElements.overlay?.classList.remove('hidden')
  if (dndElements.overlayTarget) {
    dndElements.overlayTarget.textContent = target?.relativePath || 'Racine du projet'
  }
}

function enableTreeRowDrag(row) {
  if (!(row instanceof HTMLElement) || row.dataset.ideDndReady === 'true') return
  const entry = entryForRow(row)
  if (!entry) return
  row.dataset.ideDndReady = 'true'
  row.dataset.ideRelativePath = entry.relativePath
  row.dataset.ideEntryKind = entry.kind
  row.draggable = true
  row.title = `${entry.relativePath}\nGlisser vers le chat OpenFox pour ajouter au contexte.`

  row.addEventListener('dragstart', (event) => {
    if (!event.dataTransfer) return
    const payload = JSON.stringify(entry)
    row.classList.add('dragging')
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData(WORKSPACE_ENTRY_MIME, payload)
    event.dataTransfer.setData('text/plain', `${WORKSPACE_TEXT_PREFIX}${payload}`)
    setDndStatus(`${entry.relativePath} : dépose-le dans le chat OpenFox pour l’ajouter au contexte`)
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
  if (!isExternalFileDrag(event.dataTransfer) || isWorkspaceEntryDrag(event.dataTransfer)) return
  event.preventDefault()
  dragDepth += 1
  showDropOverlay(rowDirectoryTarget(event.target))
})

dndElements.sidebar?.addEventListener('dragover', (event) => {
  if (!isExternalFileDrag(event.dataTransfer) || isWorkspaceEntryDrag(event.dataTransfer)) return
  event.preventDefault()
  event.stopPropagation()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  showDropOverlay(rowDirectoryTarget(event.target))
})

dndElements.sidebar?.addEventListener('dragleave', (event) => {
  if (!isExternalFileDrag(event.dataTransfer) || isWorkspaceEntryDrag(event.dataTransfer)) return
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0 || event.relatedTarget === null) hideDropOverlay()
})

dndElements.sidebar?.addEventListener('drop', async (event) => {
  if (!isExternalFileDrag(event.dataTransfer) || isWorkspaceEntryDrag(event.dataTransfer)) return
  event.preventDefault()
  event.stopPropagation()
  const target = rowDirectoryTarget(event.target)
  const files = Array.from(event.dataTransfer?.files ?? [])
  hideDropOverlay()
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
