import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  shell,
} from 'electron'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import {
  loadCanonicalMcp,
  loadDesktopSettings,
  normalizeMcpDocument,
  removeCanonicalServer,
  resolveEnvPlaceholders,
  saveCanonicalMcp,
  setWorkspace,
  updateCanonicalDisabledTools,
  upsertCanonicalServer,
  validateServerConfig,
} from './lib/config-store.mjs'
import { createRuntimePaths } from './lib/runtime-paths.mjs'
import { OpenFoxRuntime } from './lib/openfox-runtime.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const preloadPath = path.join(__dirname, 'preload.mjs')
const windowsDir = path.join(__dirname, 'windows')

let runtime
let runtimePaths
let mainWindow
let mcpWindow
let logsWindow
let activeWorkspace
let quitting = false

function checkChannelPayload(payload, requiredKeys = []) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Charge utile IPC invalide.')
  }
  for (const key of requiredKeys) {
    if (!(key in payload)) throw new Error(`Champ manquant: ${key}`)
  }
}

async function findAvailablePort(startPort, attempts = 30) {
  for (let port = startPort; port < startPort + attempts; port += 1) {
    const available = await new Promise((resolve) => {
      const server = net.createServer()
      server.unref()
      server.once('error', () => resolve(false))
      server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)))
    })
    if (available) return port
  }
  throw new Error(`Aucun port disponible entre ${startPort} et ${startPort + attempts - 1}.`)
}

function secureWindow(window, allowedOrigin) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (allowedOrigin && url.startsWith(allowedOrigin)) return
    if (url.startsWith('file://')) return
    event.preventDefault()
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
  })
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 960,
    minWidth: 1000,
    minHeight: 700,
    title: 'IDE Open AI',
    show: false,
    backgroundColor: '#0c0f14',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  secureWindow(mainWindow, runtime?.baseUrl)
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = undefined
  })
}

async function showStartupError(error) {
  if (!mainWindow) createMainWindow()
  const message = error instanceof Error ? error.message : String(error)
  const html = `<!doctype html><html lang="fr"><meta charset="utf-8"><style>body{font-family:system-ui;background:#0c0f14;color:#eee;padding:48px;line-height:1.5}pre{white-space:pre-wrap;background:#171b23;padding:20px;border-radius:12px;color:#ffb4b4}</style><h1>Échec du démarrage d’OpenFox</h1><p>Consulte le journal depuis le menu <strong>Exécution → Journaux</strong>.</p><pre>${escapeHtml(message)}</pre></html>`
  await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  mainWindow.show()
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char])
}

function openMcpManager() {
  if (mcpWindow && !mcpWindow.isDestroyed()) {
    mcpWindow.focus()
    return
  }
  mcpWindow = new BrowserWindow({
    width: 1120,
    height: 820,
    minWidth: 900,
    minHeight: 650,
    title: 'Gestionnaire MCP — IDE Open AI',
    parent: mainWindow,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  secureWindow(mcpWindow)
  void mcpWindow.loadFile(path.join(windowsDir, 'mcp-manager.html'))
  mcpWindow.on('closed', () => {
    mcpWindow = undefined
  })
}

function openLogsWindow() {
  if (logsWindow && !logsWindow.isDestroyed()) {
    logsWindow.focus()
    return
  }
  logsWindow = new BrowserWindow({
    width: 1000,
    height: 680,
    title: 'Journaux OpenFox — IDE Open AI',
    parent: mainWindow,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  secureWindow(logsWindow)
  void logsWindow.loadFile(path.join(windowsDir, 'logs.html'))
  logsWindow.on('closed', () => {
    logsWindow = undefined
  })
}

function installMenu() {
  const template = [
    {
      label: 'Projet',
      submenu: [
        {
          label: 'Ouvrir un workspace…',
          accelerator: 'CmdOrCtrl+O',
          click: () => void chooseWorkspace(),
        },
        { type: 'separator' },
        { role: process.platform === 'darwin' ? 'close' : 'quit' },
      ],
    },
    {
      label: 'MCP',
      submenu: [
        { label: 'Gestionnaire MCP…', accelerator: 'CmdOrCtrl+Shift+M', click: openMcpManager },
        { label: 'Redémarrer OpenFox', click: () => void restartRuntime() },
      ],
    },
    {
      label: 'Exécution',
      submenu: [
        { label: 'Journaux', click: openLogsWindow },
        { label: 'Recharger l’interface', role: 'reload' },
        { label: 'Outils de développement', role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Aide',
      submenu: [
        { label: 'Dépôt OpenFox', click: () => void shell.openExternal('https://github.com/co-l/openfox') },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

async function apiRequest(endpoint, options = {}) {
  const response = await fetch(`${runtime.baseUrl}${endpoint}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error ?? `Erreur HTTP ${response.status}`)
  return body
}

async function enforceToolLimit() {
  const canonical = await loadCanonicalMcp(runtimePaths)
  const before = await apiRequest('/api/mcp/servers')
  let retained = 0
  const autoDisabled = []

  for (const server of before.servers) {
    for (const tool of server.tools) {
      if (!tool.enabled) continue
      if (retained < canonical.toolLimit) {
        retained += 1
        continue
      }
      await apiRequest(
        `/api/mcp/servers/${encodeURIComponent(server.name)}/tools/${encodeURIComponent(tool.name)}`,
        { method: 'PUT', body: JSON.stringify({ enabled: false }) },
      )
      autoDisabled.push(`${server.name}:${tool.name}`)
    }
  }

  if (autoDisabled.length > 0) {
    const after = await apiRequest('/api/mcp/servers')
    for (const server of after.servers) {
      const disabledTools = server.tools.filter((tool) => !tool.enabled).map((tool) => tool.name)
      await updateCanonicalDisabledTools(runtimePaths, server.name, disabledTools)
    }
  }
  return autoDisabled
}

async function restartRuntime() {
  await runtime.restart({ workspace: activeWorkspace })
  const autoDisabled = await enforceToolLimit()
  if (mainWindow && !mainWindow.isDestroyed()) await mainWindow.loadURL(runtime.baseUrl)
  return { success: true, autoDisabled }
}

async function chooseWorkspace() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choisir le workspace du projet',
    properties: ['openDirectory', 'createDirectory'],
  })
  if (result.canceled || !result.filePaths[0]) return { canceled: true }
  activeWorkspace = result.filePaths[0]
  await setWorkspace(runtimePaths, activeWorkspace)
  await restartRuntime()
  return { canceled: false, workspace: activeWorkspace }
}

function registerIpc() {
  ipcMain.handle('app:info', () => ({ version: app.getVersion(), workspace: activeWorkspace, port: runtime.port }))
  ipcMain.handle('runtime:logs', () => runtime.getLogs())
  ipcMain.handle('runtime:restart', () => restartRuntime())
  ipcMain.handle('workspace:choose', () => chooseWorkspace())

  ipcMain.handle('mcp:list', async () => {
    const data = await apiRequest('/api/mcp/servers')
    const canonical = await loadCanonicalMcp(runtimePaths)
    return { ...data, toolLimit: canonical.toolLimit }
  })

  ipcMain.handle('mcp:test', async (_event, payload) => {
    checkChannelPayload(payload, ['name'])
    const config = validateServerConfig(payload.name, payload)
    const resolved = resolveEnvPlaceholders(config, { ...process.env, WORKSPACE_PATH: activeWorkspace })
    return apiRequest('/api/mcp/servers/test', {
      method: 'POST',
      body: JSON.stringify({ name: payload.name, ...resolved }),
    })
  })

  ipcMain.handle('mcp:add', async (_event, payload) => {
    checkChannelPayload(payload, ['name'])
    const config = validateServerConfig(payload.name, payload)
    const resolved = resolveEnvPlaceholders(config, { ...process.env, WORKSPACE_PATH: activeWorkspace })
    const result = await apiRequest('/api/mcp/servers', {
      method: 'POST',
      body: JSON.stringify({ name: payload.name, ...resolved }),
    })
    await upsertCanonicalServer(runtimePaths, payload.name, config)
    const autoDisabled = await enforceToolLimit()
    return { ...result, autoDisabled }
  })

  ipcMain.handle('mcp:remove', async (_event, name) => {
    if (typeof name !== 'string') throw new Error('Nom MCP invalide.')
    await apiRequest(`/api/mcp/servers/${encodeURIComponent(name)}`, { method: 'DELETE' })
    await removeCanonicalServer(runtimePaths, name)
    return { success: true }
  })

  ipcMain.handle('mcp:toggle-tool', async (_event, payload) => {
    checkChannelPayload(payload, ['serverName', 'toolName', 'enabled'])
    const before = await apiRequest('/api/mcp/servers')
    const canonical = await loadCanonicalMcp(runtimePaths)
    const enabledCount = before.servers
      .flatMap((server) => server.tools)
      .filter((tool) => tool.enabled).length
    const targetServer = before.servers.find((server) => server.name === payload.serverName)
    const targetTool = targetServer?.tools.find((tool) => tool.name === payload.toolName)
    if (!targetTool) throw new Error('Outil MCP introuvable.')
    if (payload.enabled === true && targetTool.enabled === false && enabledCount >= canonical.toolLimit) {
      throw new Error(`Limite atteinte: ${canonical.toolLimit} outils MCP actifs maximum.`)
    }

    await apiRequest(
      `/api/mcp/servers/${encodeURIComponent(payload.serverName)}/tools/${encodeURIComponent(payload.toolName)}`,
      { method: 'PUT', body: JSON.stringify({ enabled: Boolean(payload.enabled) }) },
    )
    const after = await apiRequest('/api/mcp/servers')
    const serverAfter = after.servers.find((server) => server.name === payload.serverName)
    const disabledTools = serverAfter?.tools.filter((tool) => !tool.enabled).map((tool) => tool.name) ?? []
    await updateCanonicalDisabledTools(runtimePaths, payload.serverName, disabledTools)
    return { success: true }
  })

  ipcMain.handle('mcp:import', async () => {
    const selection = await dialog.showOpenDialog(mcpWindow ?? mainWindow, {
      title: 'Importer une configuration MCP',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    })
    if (selection.canceled || !selection.filePaths[0]) return { canceled: true }
    const imported = JSON.parse(await readFile(selection.filePaths[0], 'utf8'))
    const normalized = normalizeMcpDocument(imported)
    await saveCanonicalMcp(runtimePaths, normalized)
    await restartRuntime()
    return { canceled: false, serverCount: Object.keys(normalized.mcpServers).length }
  })

  ipcMain.handle('mcp:export', async () => {
    const selection = await dialog.showSaveDialog(mcpWindow ?? mainWindow, {
      title: 'Exporter la configuration MCP',
      defaultPath: 'mcp_config.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (selection.canceled || !selection.filePath) return { canceled: true }
    const canonical = await loadCanonicalMcp(runtimePaths)
    const { writeFile } = await import('node:fs/promises')
    await writeFile(selection.filePath, `${JSON.stringify(canonical, null, 2)}\n`, 'utf8')
    return { canceled: false, path: selection.filePath }
  })
}

async function boot() {
  runtimePaths = createRuntimePaths(app.getPath('userData'))
  const settings = await loadDesktopSettings(runtimePaths)
  activeWorkspace = settings.workspace || app.getPath('documents')
  const port = await findAvailablePort(Number(process.env.OPENAI_IDE_PORT || 10369))
  runtime = new OpenFoxRuntime({ paths: runtimePaths, port, workspace: activeWorkspace })
  createMainWindow()
  registerIpc()
  installMenu()

  runtime.on('unexpected-exit', ({ code }) => {
    if (!quitting) void showStartupError(new Error(`OpenFox s’est arrêté de manière inattendue (code ${code}).`))
  })

  try {
    await runtime.start()
    await enforceToolLimit()
    await mainWindow.loadURL(runtime.baseUrl)
  } catch (error) {
    await showStartupError(error)
  }
}

const hasLock = app.requestSingleInstanceLock()
if (!hasLock) app.quit()

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

app.whenReady().then(boot).catch(showStartupError)

app.on('activate', () => {
  if (!mainWindow && runtime) {
    createMainWindow()
    void mainWindow.loadURL(runtime.baseUrl)
  }
})

app.on('before-quit', (event) => {
  if (quitting || !runtime) return
  event.preventDefault()
  quitting = true
  runtime.stop().finally(() => app.quit())
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
