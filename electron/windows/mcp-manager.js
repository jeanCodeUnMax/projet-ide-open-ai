const api = window.desktopAPI
const elements = {
  enabledCount: document.querySelector('#enabled-count'),
  toolLimit: document.querySelector('#tool-limit'),
  serverCount: document.querySelector('#server-count'),
  servers: document.querySelector('#servers'),
  message: document.querySelector('#message'),
  addPanel: document.querySelector('#add-panel'),
  addForm: document.querySelector('#add-form'),
  transport: document.querySelector('#transport'),
}

let state = { servers: [], toolLimit: 100 }

function showMessage(text, error = false) {
  elements.message.textContent = text
  elements.message.classList.remove('hidden', 'error')
  if (error) elements.message.classList.add('error')
  window.setTimeout(() => elements.message.classList.add('hidden'), 6000)
}

function parseJsonField(id) {
  const text = document.querySelector(`#${id}`).value.trim()
  if (!text) return undefined
  const value = JSON.parse(text)
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${id} doit contenir un objet JSON.`)
  return value
}

function formPayload() {
  const name = document.querySelector('#name').value.trim()
  const transport = elements.transport.value
  const payload = { name, transport }
  if (transport === 'stdio') {
    payload.command = document.querySelector('#command').value.trim()
    const args = document.querySelector('#args').value.split('\n').map((item) => item.trim()).filter(Boolean)
    if (args.length) payload.args = args
    const env = parseJsonField('env')
    if (env) payload.env = env
  } else {
    payload.url = document.querySelector('#url').value.trim()
    const headers = parseJsonField('headers')
    if (headers) payload.headers = headers
  }
  return payload
}

function enabledToolCount() {
  return state.servers.flatMap((server) => server.tools ?? []).filter((tool) => tool.enabled).length
}

function render() {
  const enabled = enabledToolCount()
  elements.enabledCount.textContent = String(enabled)
  elements.toolLimit.textContent = String(state.toolLimit)
  elements.serverCount.textContent = `${state.servers.length} serveur${state.servers.length > 1 ? 's' : ''}`

  if (!state.servers.length) {
    elements.servers.innerHTML = '<div class="empty">Aucun serveur MCP configuré.</div>'
    return
  }

  elements.servers.replaceChildren(...state.servers.map((server) => renderServer(server, enabled)))
}

function renderServer(server, enabledCount) {
  const wrapper = document.createElement('article')
  wrapper.className = 'server'

  const summary = document.createElement('div')
  summary.className = 'server-summary'
  const title = document.createElement('div')
  title.className = 'server-title'
  const dot = document.createElement('span')
  dot.className = `status ${server.status}`
  const text = document.createElement('div')
  const strong = document.createElement('strong')
  strong.textContent = server.name
  const meta = document.createElement('div')
  meta.className = 'server-meta'
  meta.textContent = `${server.config.transport} · ${server.tools.length} outils · ~${server.estimatedTokens} tokens${server.error ? ` · ${server.error}` : ''}`
  text.append(strong, meta)
  title.append(dot, text)

  const remove = document.createElement('button')
  remove.className = 'btn danger'
  remove.textContent = 'Supprimer'
  remove.addEventListener('click', async () => {
    if (!confirm(`Supprimer le serveur « ${server.name} » ?`)) return
    try {
      await api.mcp.remove(server.name)
      showMessage(`Serveur « ${server.name} » supprimé.`)
      await refresh()
    } catch (error) {
      showMessage(error.message ?? String(error), true)
    }
  })
  summary.append(title, remove)
  wrapper.append(summary)

  const tools = document.createElement('div')
  tools.className = 'tools'
  if (!server.tools.length) {
    const empty = document.createElement('div')
    empty.className = 'empty'
    empty.textContent = 'Aucun outil découvert.'
    tools.append(empty)
  }

  for (const tool of server.tools) {
    const row = document.createElement('div')
    row.className = 'tool'
    const info = document.createElement('div')
    const name = document.createElement('div')
    name.className = 'tool-name'
    name.textContent = tool.name
    const description = document.createElement('div')
    description.className = 'tool-description'
    description.textContent = tool.description || 'Aucune description.'
    info.append(name, description)
    const tokens = document.createElement('span')
    tokens.className = 'server-meta'
    tokens.textContent = `~${tool.estimatedTokens}`
    const label = document.createElement('label')
    label.className = 'switch'
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.checked = tool.enabled
    checkbox.disabled = !tool.enabled && enabledCount >= state.toolLimit
    const slider = document.createElement('span')
    slider.className = 'slider'
    checkbox.addEventListener('change', async () => {
      checkbox.disabled = true
      try {
        await api.mcp.toggleTool({ serverName: server.name, toolName: tool.name, enabled: checkbox.checked })
        await refresh()
      } catch (error) {
        checkbox.checked = !checkbox.checked
        showMessage(error.message ?? String(error), true)
        checkbox.disabled = false
      }
    })
    label.append(checkbox, slider)
    row.append(info, tokens, label)
    tools.append(row)
  }
  wrapper.append(tools)
  return wrapper
}

async function refresh() {
  try {
    state = await api.mcp.list()
    render()
  } catch (error) {
    elements.servers.innerHTML = `<div class="empty">${error.message ?? String(error)}</div>`
  }
}

function updateTransportFields() {
  const isHttp = elements.transport.value === 'http'
  document.querySelectorAll('.stdio-field').forEach((node) => node.classList.toggle('hidden', isHttp))
  document.querySelectorAll('.http-field').forEach((node) => node.classList.toggle('hidden', !isHttp))
}

document.querySelector('#refresh').addEventListener('click', refresh)
document.querySelector('#toggle-form').addEventListener('click', () => elements.addPanel.classList.toggle('hidden'))
document.querySelector('#cancel-add').addEventListener('click', () => elements.addPanel.classList.add('hidden'))
elements.transport.addEventListener('change', updateTransportFields)

document.querySelector('#test-server').addEventListener('click', async () => {
  try {
    const result = await api.mcp.test(formPayload())
    if (!result.success) throw new Error(result.error || 'Connexion impossible.')
    showMessage(`Connexion réussie. Outils détectés: ${result.tools?.length ?? 0}.`)
  } catch (error) {
    showMessage(error.message ?? String(error), true)
  }
})

elements.addForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  try {
    const payload = formPayload()
    const result = await api.mcp.add(payload)
    elements.addForm.reset()
    updateTransportFields()
    elements.addPanel.classList.add('hidden')
    const disabledCount = result.autoDisabled?.length ?? 0
    showMessage(
      disabledCount > 0
        ? `Serveur « ${payload.name} » ajouté. ${disabledCount} outil(s) désactivé(s) pour respecter la limite.`
        : `Serveur « ${payload.name} » ajouté.`,
    )
    await refresh()
  } catch (error) {
    showMessage(error.message ?? String(error), true)
  }
})

document.querySelector('#import').addEventListener('click', async () => {
  try {
    const result = await api.mcp.importConfig()
    if (!result.canceled) {
      showMessage(`${result.serverCount} serveur(s) importé(s).`)
      await refresh()
    }
  } catch (error) {
    showMessage(error.message ?? String(error), true)
  }
})

document.querySelector('#export').addEventListener('click', async () => {
  try {
    const result = await api.mcp.exportConfig()
    if (!result.canceled) showMessage(`Configuration exportée: ${result.path}`)
  } catch (error) {
    showMessage(error.message ?? String(error), true)
  }
})

document.querySelector('#restart').addEventListener('click', async () => {
  try {
    showMessage('Redémarrage en cours…')
    await api.mcp.restart()
    showMessage('OpenFox redémarré.')
    await refresh()
  } catch (error) {
    showMessage(error.message ?? String(error), true)
  }
})

updateTransportFields()
await refresh()
