const api = window.desktopAPI
const state = {
  agents: [],
  documents: [],
  selectedFiles: [],
  status: undefined,
}

const elements = {
  notice: document.querySelector('#notice'),
  agentsList: document.querySelector('#agents-list'),
  agentCount: document.querySelector('#agent-count'),
  agentUrl: document.querySelector('#agent-url'),
  agentPreview: document.querySelector('#agent-preview'),
  documentsList: document.querySelector('#documents-list'),
  selectedFiles: document.querySelector('#selected-files'),
  startIngestion: document.querySelector('#start-ingestion'),
  progressPanel: document.querySelector('#progress-panel'),
  progressTitle: document.querySelector('#progress-title'),
  progressPercent: document.querySelector('#progress-percent'),
  progressBar: document.querySelector('#progress-bar'),
  progressDetail: document.querySelector('#progress-detail'),
  searchResults: document.querySelector('#search-results'),
  searchMeta: document.querySelector('#search-meta'),
}

const phaseLabels = {
  'batch-started': 'Préparation du lot',
  'file-started': 'Démarrage du document',
  'checksum-started': 'Calcul du checksum',
  'checksum-completed': 'Checksum calculé',
  'extraction-started': 'Extraction et OCR',
  'extraction-completed': 'Texte extrait',
  'images-started': 'Analyse des images',
  'images-completed': 'Images analysées',
  'tagging-started': 'Génération des tags',
  'tagging-completed': 'Tags générés',
  'chunking-started': 'Découpage en chunks',
  'chunking-completed': 'Chunks générés',
  'embedding-started': 'Création des embeddings',
  'embedding-completed': 'Embeddings créés',
  'embedding-skipped': 'Embeddings non configurés',
  'vector-index-started': 'Indexation Qdrant',
  'vector-index-completed': 'Vecteurs indexés',
  'vector-index-skipped': 'Index vectoriel non configuré',
  'files-started': 'Écriture des fichiers d’index',
  'files-completed': 'Index documentaire actualisé',
  'file-completed': 'Document terminé',
  'file-failed': 'Échec du document',
  'batch-completed': 'Lot terminé',
}

function showNotice(message, error = false) {
  elements.notice.textContent = message
  elements.notice.classList.remove('hidden', 'error')
  if (error) elements.notice.classList.add('error')
  window.setTimeout(() => elements.notice.classList.add('hidden'), 6000)
}

function createButton(label, className, handler) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = `button ${className}`
  button.textContent = label
  button.addEventListener('click', handler)
  return button
}

function createTags(values) {
  const container = document.createElement('div')
  container.className = 'tags'
  for (const value of [...new Set(values)].slice(0, 20)) {
    const tag = document.createElement('span')
    tag.className = 'tag'
    tag.textContent = value
    container.append(tag)
  }
  return container
}

function renderStatus() {
  const status = state.status
  document.querySelector('#workspace-status').textContent = status?.workspace ?? 'Inconnu'
  document.querySelector('#hephaistos-status').textContent = status?.hephaistos?.available
    ? 'Connecté'
    : status?.hephaistos?.configured ? 'Configuré, indisponible' : 'Non configuré'
  document.querySelector('#embedding-status').textContent = status?.rag?.capabilities?.embeddings ? 'Configurés' : 'Mode local'
  document.querySelector('#search-status').textContent = status?.rag?.capabilities?.vectorSearch ? 'Hybride' : 'Lexicale'
}

function renderAgents() {
  elements.agentCount.textContent = `${state.agents.length} agent${state.agents.length > 1 ? 's' : ''}`
  elements.agentsList.replaceChildren()
  if (state.agents.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'empty-state'
    empty.textContent = 'Aucun agent enregistré.'
    elements.agentsList.append(empty)
    return
  }

  for (const entry of state.agents) {
    const card = entry.card
    const article = document.createElement('article')
    article.className = 'agent-card'
    const top = document.createElement('div')
    top.className = 'agent-top'
    const identity = document.createElement('div')
    const title = document.createElement('h3')
    title.textContent = `${card.name} · v${card.version}`
    const description = document.createElement('p')
    description.className = 'agent-description'
    description.textContent = card.description
    identity.append(title, description)

    const actions = document.createElement('div')
    actions.className = 'agent-actions'
    const toggle = document.createElement('label')
    toggle.className = 'toggle'
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.checked = entry.enabled !== false
    checkbox.disabled = Boolean(entry.builtin)
    checkbox.addEventListener('change', async () => {
      try {
        await api.agents.toggle({ agentName: card.name, enabled: checkbox.checked })
        await refreshAgents()
      } catch (error) {
        checkbox.checked = !checkbox.checked
        showNotice(error.message ?? String(error), true)
      }
    })
    const toggleText = document.createElement('span')
    toggleText.textContent = entry.builtin ? 'Intégré' : 'Actif'
    toggle.append(checkbox, toggleText)
    actions.append(toggle)
    if (!entry.builtin) {
      actions.append(
        createButton('Rafraîchir', 'secondary', async () => {
          try { await api.agents.refresh(card.name); await refreshAgents(); showNotice(`Agent « ${card.name} » actualisé.`) }
          catch (error) { showNotice(error.message ?? String(error), true) }
        }),
        createButton('Supprimer', 'danger', async () => {
          if (!confirm(`Supprimer l’agent « ${card.name} » ?`)) return
          try { await api.agents.remove(card.name); await refreshAgents(); showNotice(`Agent « ${card.name} » supprimé.`) }
          catch (error) { showNotice(error.message ?? String(error), true) }
        }),
      )
    }
    top.append(identity, actions)
    article.append(top)
    article.append(createTags(card.skills.flatMap((skill) => skill.tags ?? [])))
    elements.agentsList.append(article)
  }
}

function renderSelectedFiles() {
  elements.selectedFiles.replaceChildren()
  elements.startIngestion.disabled = state.selectedFiles.length === 0 || state.status?.rag?.running
  if (state.selectedFiles.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'empty-state'
    empty.textContent = 'Aucun fichier sélectionné.'
    elements.selectedFiles.append(empty)
    return
  }
  state.selectedFiles.forEach((filePath, index) => {
    const row = document.createElement('div')
    row.className = 'file-row'
    const label = document.createElement('span')
    label.className = 'file-path'
    label.textContent = filePath
    const remove = createButton('Retirer', 'ghost', () => {
      state.selectedFiles.splice(index, 1)
      renderSelectedFiles()
    })
    row.append(label, remove)
    elements.selectedFiles.append(row)
  })
}

function renderDocuments() {
  elements.documentsList.replaceChildren()
  if (state.documents.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'empty-state'
    empty.textContent = 'Le corpus ne contient encore aucun document.'
    elements.documentsList.append(empty)
    return
  }
  for (const documentEntry of state.documents) {
    const row = document.createElement('div')
    row.className = 'document-row'
    const identity = document.createElement('div')
    const title = document.createElement('div')
    title.className = 'document-title'
    title.textContent = documentEntry.title
    const meta = document.createElement('div')
    meta.className = 'document-meta'
    meta.textContent = documentEntry.mimeType
    identity.append(title, meta)
    const tags = document.createElement('span')
    tags.className = 'document-meta'
    tags.textContent = (documentEntry.tags ?? []).join(', ') || '—'
    const chunks = document.createElement('span')
    chunks.className = 'pill'
    chunks.textContent = `${documentEntry.chunkCount ?? 0} chunks`
    const images = document.createElement('span')
    images.className = 'pill'
    images.textContent = `${documentEntry.imageCount ?? 0} images`
    const open = createButton('Ouvrir', 'secondary', async () => {
      try { await api.rag.openDocument(documentEntry.id) }
      catch (error) { showNotice(error.message ?? String(error), true) }
    })
    row.append(identity, tags, chunks, images, open)
    elements.documentsList.append(row)
  }
}

async function refreshAgents() {
  const registry = await api.agents.list()
  state.agents = registry.agents
  renderAgents()
}

async function refreshDocuments() {
  const index = await api.rag.list()
  state.documents = index.documents
  renderDocuments()
}

async function refreshAll() {
  try {
    const [status] = await Promise.all([api.aiOs.status(), refreshAgents(), refreshDocuments()])
    state.status = status
    renderStatus()
    renderSelectedFiles()
  } catch (error) {
    showNotice(error.message ?? String(error), true)
  }
}

function addFiles(filePaths) {
  const existing = new Set(state.selectedFiles)
  for (const filePath of filePaths) {
    if (filePath && !existing.has(filePath)) {
      state.selectedFiles.push(filePath)
      existing.add(filePath)
    }
  }
  renderSelectedFiles()
}

function renderSearchResults(response) {
  elements.searchResults.replaceChildren()
  elements.searchMeta.textContent = `${response.results.length} résultat(s) · mode ${response.mode}`
  if (response.results.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'empty-state'
    empty.textContent = 'Aucun passage correspondant.'
    elements.searchResults.append(empty)
    return
  }
  for (const result of response.results) {
    const card = document.createElement('article')
    card.className = 'search-card'
    const header = document.createElement('div')
    header.className = 'search-card-header'
    const title = document.createElement('strong')
    title.textContent = result.title || result.documentId || 'Document'
    const sources = document.createElement('span')
    sources.className = 'pill'
    sources.textContent = (result.sources ?? []).join(' + ') || response.mode
    header.append(title, sources)
    const excerpt = document.createElement('p')
    excerpt.textContent = result.snippet || result.text || ''
    card.append(header, excerpt, createTags(result.tags ?? []))
    elements.searchResults.append(card)
  }
}

for (const tab of document.querySelectorAll('.tab')) {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((item) => item.classList.toggle('active', item === tab))
    document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.toggle('active', panel.id === `tab-${tab.dataset.tab}`))
  })
}

document.querySelector('#agent-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  try {
    const entry = await api.agents.add(elements.agentUrl.value.trim())
    elements.agentUrl.value = ''
    elements.agentPreview.classList.add('hidden')
    await refreshAgents()
    showNotice(`Agent « ${entry.card.name} » ajouté.`)
  } catch (error) {
    showNotice(error.message ?? String(error), true)
  }
})

document.querySelector('#discover-agent').addEventListener('click', async () => {
  try {
    const result = await api.agents.discover(elements.agentUrl.value.trim())
    elements.agentPreview.replaceChildren()
    const title = document.createElement('strong')
    title.textContent = `${result.card.name} · v${result.card.version}`
    const description = document.createElement('p')
    description.textContent = result.card.description
    elements.agentPreview.append(title, description, createTags(result.card.skills.flatMap((skill) => skill.tags ?? [])))
    elements.agentPreview.classList.remove('hidden')
  } catch (error) {
    showNotice(error.message ?? String(error), true)
  }
})

document.querySelector('#choose-files').addEventListener('click', async () => {
  const selection = await api.rag.chooseFiles()
  if (!selection.canceled) addFiles(selection.filePaths)
})

document.querySelector('#clear-files').addEventListener('click', () => {
  state.selectedFiles = []
  renderSelectedFiles()
})

const dropZone = document.querySelector('#drop-zone')
for (const eventName of ['dragenter', 'dragover']) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault()
    dropZone.classList.add('dragging')
  })
}
for (const eventName of ['dragleave', 'drop']) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault()
    dropZone.classList.remove('dragging')
  })
}
dropZone.addEventListener('drop', (event) => {
  const paths = [...event.dataTransfer.files].map((file) => api.rag.pathForFile(file)).filter(Boolean)
  addFiles(paths)
})

document.querySelector('#start-ingestion').addEventListener('click', async () => {
  const filePaths = [...state.selectedFiles]
  const tags = document.querySelector('#ingestion-tags').value.split(',').map((tag) => tag.trim()).filter(Boolean)
  elements.startIngestion.disabled = true
  elements.progressPanel.classList.remove('hidden')
  try {
    const result = await api.rag.ingest({ filePaths, tags })
    state.selectedFiles = result.failures.map((failure) => failure.sourcePath)
    await refreshDocuments()
    renderSelectedFiles()
    showNotice(`${result.results.length} document(s) indexé(s), ${result.failures.length} échec(s).`, result.failures.length > 0)
  } catch (error) {
    showNotice(error.message ?? String(error), true)
  } finally {
    elements.startIngestion.disabled = state.selectedFiles.length === 0
  }
})

document.querySelector('#reveal-index').addEventListener('click', async () => {
  try { await api.rag.revealOutput() }
  catch (error) { showNotice(error.message ?? String(error), true) }
})

document.querySelector('#search-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  elements.searchResults.innerHTML = '<p class="empty-state">Recherche en cours…</p>'
  try {
    const response = await api.rag.search({ query: document.querySelector('#search-query').value, limit: 15 })
    renderSearchResults(response)
  } catch (error) {
    showNotice(error.message ?? String(error), true)
  }
})

document.querySelector('#refresh-all').addEventListener('click', refreshAll)

api.rag.onProgress((event) => {
  elements.progressPanel.classList.remove('hidden')
  const total = Number(event.total || 1)
  const index = Number(event.index || 0)
  const completed = event.phase === 'batch-completed' ? total : index
  const base = Math.min(95, Math.round((completed / total) * 100))
  const percent = event.phase === 'batch-completed' ? 100 : Math.max(2, base)
  elements.progressBar.style.width = `${percent}%`
  elements.progressPercent.textContent = `${percent} %`
  elements.progressTitle.textContent = phaseLabels[event.phase] ?? event.phase
  elements.progressDetail.textContent = event.sourcePath || `${event.total ?? 0} document(s)`
})

await refreshAll()
