const { contextBridge, ipcRenderer, webUtils } = require('electron')

function subscribe(channel, listener) {
  const handler = (_event, payload) => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

contextBridge.exposeInMainWorld('desktopAPI', {
  mcp: {
    list: () => ipcRenderer.invoke('mcp:list'),
    test: (payload) => ipcRenderer.invoke('mcp:test', payload),
    add: (payload) => ipcRenderer.invoke('mcp:add', payload),
    remove: (name) => ipcRenderer.invoke('mcp:remove', name),
    toggleTool: (payload) => ipcRenderer.invoke('mcp:toggle-tool', payload),
    importConfig: () => ipcRenderer.invoke('mcp:import'),
    exportConfig: () => ipcRenderer.invoke('mcp:export'),
    restart: () => ipcRenderer.invoke('runtime:restart'),
  },
  agents: {
    list: () => ipcRenderer.invoke('agents:list'),
    discover: (agentUrl) => ipcRenderer.invoke('agents:discover', agentUrl),
    add: (agentUrl) => ipcRenderer.invoke('agents:add', agentUrl),
    remove: (agentName) => ipcRenderer.invoke('agents:remove', agentName),
    toggle: (payload) => ipcRenderer.invoke('agents:toggle', payload),
    refresh: (agentName) => ipcRenderer.invoke('agents:refresh', agentName),
  },
  rag: {
    list: () => ipcRenderer.invoke('rag:list'),
    status: () => ipcRenderer.invoke('rag:status'),
    chooseFiles: () => ipcRenderer.invoke('rag:choose-files'),
    ingest: (payload) => ipcRenderer.invoke('rag:ingest', payload),
    search: (payload) => ipcRenderer.invoke('rag:search', payload),
    openDocument: (documentId) => ipcRenderer.invoke('rag:open-document', documentId),
    revealOutput: () => ipcRenderer.invoke('rag:reveal-output'),
    pathForFile: (file) => webUtils.getPathForFile(file),
    onProgress: (listener) => subscribe('rag:progress', listener),
  },
  workspace: {
    current: () => ipcRenderer.invoke('workspace:current'),
    syncStatus: () => ipcRenderer.invoke('workspace:sync-status'),
    refreshSessions: () => ipcRenderer.invoke('workspace:refresh-sessions'),
    choose: () => ipcRenderer.invoke('workspace:choose'),
    openPath: (workspacePath) => ipcRenderer.invoke('workspace:open-path', workspacePath),
    list: (relativePath = '') => ipcRenderer.invoke('workspace:list', relativePath),
    readFile: (relativePath) => ipcRenderer.invoke('workspace:read-file', relativePath),
    writeFile: (payload) => ipcRenderer.invoke('editor:save-file', payload),
    openInVSCode: (relativePath) => ipcRenderer.invoke('editor:open-vscode', relativePath),
    importDroppedPaths: (payload) => ipcRenderer.invoke('workspace:import-dropped-paths', payload),
    pathForFile: (file) => webUtils.getPathForFile(file),
    reveal: (relativePath) => ipcRenderer.invoke('workspace:reveal', relativePath),
    onChanged: (listener) => subscribe('workspace:changed', listener),
    onSyncStatus: (listener) => subscribe('workspace:sync-status', listener),
    onFilesChanged: (listener) => subscribe('workspace:files-changed', listener),
  },
  // OpenFox navigation must not trigger a session refresh that reloads the same
  // WebContentsView. The previous feedback loop caused a reload every 700 ms and
  // made the frontend alternate continuously between connected/reconnecting.
  openFox: {
    onNavigated: () => () => {},
  },
  layout: {
    setMode: (mode) => ipcRenderer.invoke('layout:set-mode', mode),
  },
  aiOs: {
    status: () => ipcRenderer.invoke('ai-os:status'),
  },
  runtime: {
    logs: () => ipcRenderer.invoke('runtime:logs'),
    restart: () => ipcRenderer.invoke('runtime:restart'),
    chooseWorkspace: () => ipcRenderer.invoke('workspace:choose'),
    onStatus: (listener) => subscribe('runtime:status', listener),
  },
  app: {
    info: () => ipcRenderer.invoke('app:info'),
  },
})
