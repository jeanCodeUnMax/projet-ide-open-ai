'use strict'

const fileOpsApi = window.desktopAPI

if (!fileOpsApi?.workspace?.renameEntry || !fileOpsApi.workspace.moveEntry || !fileOpsApi.workspace.trashEntry) {
  throw new Error('Les opérations de fichiers du workspace sont indisponibles.')
}

const fileOpsElements = {
  tree: document.querySelector('#workspace-tree'),
  rename: document.querySelector('#rename-entry'),
  remove: document.querySelector('#delete-entry'),
  refresh: document.querySelector('#refresh-tree'),
  contextMenu: document.querySelector('#tree-context-menu'),
  status: document.querySelector('#status-message'),
  editorPath: document.querySelector('#editor-file-path'),
  editorDirty: document.querySelector('#editor-dirty'),
}

let selectedEntry

function setFileOpsStatus(message) {
  if (fileOpsElements.status) fileOpsElements.status.textContent = message
}

function entryForFileOpsRow(row) {
  if (!(row instanceof HTMLElement)) return undefined
  const relativePath = row.dataset.ideRelativePath || row.title?.split('\n')[0]?.trim()
  if (!relativePath) return undefined
  const toggle = row.querySelector('.tree-toggle')
  const kind = row.dataset.ideEntryKind || (toggle?.textContent ? 'directory' : 'file')
  const name = row.querySelector('.tree-label')?.textContent?.trim() || relativePath.split('/').at(-1)
  return { relativePath, kind, name }
}

function setSelectedEntry(entry) {
  selectedEntry = entry
  const available = Boolean(entry?.relativePath)
  if (fileOpsElements.rename) fileOpsElements.rename.disabled = !available
  if (fileOpsElements.remove) fileOpsElements.remove.disabled = !available
}

function closeContextMenu() {
  fileOpsElements.contextMenu?.classList.add('hidden')
}

function showContextMenu(event, entry) {
  const menu = fileOpsElements.contextMenu
  if (!menu) return
  setSelectedEntry(entry)
  menu.classList.remove('hidden')
  const width = menu.offsetWidth || 230
  const height = menu.offsetHeight || 110
  const left = Math.max(6, Math.min(event.clientX, window.innerWidth - width - 6))
  const top = Math.max(6, Math.min(event.clientY, window.innerHeight - height - 6))
  menu.style.left = `${left}px`
  menu.style.top = `${top}px`
  menu.querySelector('button')?.focus()
}

function affectsPath(entryPath, candidatePath) {
  return Boolean(entryPath && candidatePath)
    && (candidatePath === entryPath || candidatePath.startsWith(`${entryPath}/`))
}

function confirmDirtyFileOperation(entry, actionLabel) {
  const currentPath = fileOpsElements.editorPath?.textContent?.trim()
  const dirty = fileOpsElements.editorDirty && !fileOpsElements.editorDirty.classList.contains('hidden')
  if (!dirty || !affectsPath(entry.relativePath, currentPath)) return true
  return window.confirm(
    `Le fichier « ${currentPath} » contient des modifications non enregistrées. Les abandonner avant de ${actionLabel} « ${entry.name} » ?`,
  )
}

async function renameSelectedEntry() {
  const entry = selectedEntry
  closeContextMenu()
  if (!entry || !confirmDirtyFileOperation(entry, 'renommer')) return
  const requested = window.prompt('Nouveau nom :', entry.name)
  if (requested === null || requested.trim() === '' || requested.trim() === entry.name) return

  setFileOpsStatus(`Renommage de ${entry.relativePath}…`)
  try {
    const result = await fileOpsApi.workspace.renameEntry({
      relativePath: entry.relativePath,
      newName: requested,
    })
    setSelectedEntry({ ...entry, relativePath: result.to, name: result.name })
    fileOpsElements.refresh?.click()
    setFileOpsStatus(result.moved ? `${result.from} renommé en ${result.to}` : 'Aucun renommage nécessaire')
  } catch (error) {
    setFileOpsStatus(error instanceof Error ? error.message : String(error))
  }
}

async function trashSelectedEntry() {
  const entry = selectedEntry
  closeContextMenu()
  if (!entry || !confirmDirtyFileOperation(entry, 'supprimer')) return
  const kindLabel = entry.kind === 'directory' ? 'dossier' : 'fichier'
  if (!window.confirm(`Envoyer le ${kindLabel} « ${entry.relativePath} » dans la Corbeille Windows ?`)) return

  setFileOpsStatus(`Envoi de ${entry.relativePath} dans la Corbeille…`)
  try {
    await fileOpsApi.workspace.trashEntry({ relativePath: entry.relativePath })
    setSelectedEntry(undefined)
    fileOpsElements.refresh?.click()
    setFileOpsStatus(`${entry.relativePath} envoyé dans la Corbeille Windows`)
  } catch (error) {
    setFileOpsStatus(error instanceof Error ? error.message : String(error))
  }
}

async function revealSelectedEntry() {
  const entry = selectedEntry
  closeContextMenu()
  if (!entry) return
  try {
    await fileOpsApi.workspace.reveal(entry.relativePath)
    setFileOpsStatus(`${entry.relativePath} affiché dans l’Explorateur Windows`)
  } catch (error) {
    setFileOpsStatus(error instanceof Error ? error.message : String(error))
  }
}

fileOpsElements.tree?.addEventListener('pointerdown', (event) => {
  const row = event.target instanceof Element ? event.target.closest('.tree-row') : null
  if (row) setSelectedEntry(entryForFileOpsRow(row))
})

fileOpsElements.tree?.addEventListener('focusin', (event) => {
  const row = event.target instanceof Element ? event.target.closest('.tree-row') : null
  if (row) setSelectedEntry(entryForFileOpsRow(row))
})

fileOpsElements.tree?.addEventListener('contextmenu', (event) => {
  const row = event.target instanceof Element ? event.target.closest('.tree-row') : null
  const entry = entryForFileOpsRow(row)
  if (!entry) return
  event.preventDefault()
  row.classList.add('selected')
  showContextMenu(event, entry)
})

fileOpsElements.rename?.addEventListener('click', () => void renameSelectedEntry())
fileOpsElements.remove?.addEventListener('click', () => void trashSelectedEntry())

fileOpsElements.contextMenu?.addEventListener('click', (event) => {
  const action = event.target instanceof Element ? event.target.closest('button')?.dataset.action : undefined
  if (action === 'rename') void renameSelectedEntry()
  else if (action === 'delete') void trashSelectedEntry()
  else if (action === 'reveal') void revealSelectedEntry()
})

document.addEventListener('pointerdown', (event) => {
  if (!fileOpsElements.contextMenu?.contains(event.target)) closeContextMenu()
})

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeContextMenu()
    return
  }
  const active = document.activeElement
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active?.isContentEditable) return
  if (event.key === 'F2' && selectedEntry) {
    event.preventDefault()
    void renameSelectedEntry()
  } else if (event.key === 'Delete' && selectedEntry) {
    event.preventDefault()
    void trashSelectedEntry()
  }
})

window.addEventListener('workspace-entry-moved', (event) => {
  const result = event.detail
  if (!result?.to) return
  if (selectedEntry && affectsPath(result.from, selectedEntry.relativePath)) {
    const suffix = selectedEntry.relativePath.slice(result.from.length)
    setSelectedEntry({
      ...selectedEntry,
      relativePath: `${result.to}${suffix}`,
      name: suffix ? selectedEntry.name : result.name,
    })
  }
  setFileOpsStatus(result.moved ? `${result.from} déplacé vers ${result.to}` : 'Élément déjà dans ce dossier')
})

setSelectedEntry(undefined)
