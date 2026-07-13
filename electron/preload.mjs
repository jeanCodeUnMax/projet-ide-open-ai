import { contextBridge, ipcRenderer, webUtils } from 'electron'

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
    onProgress: (listener) => {
      const handler = (_event, payload) => listener(payload)
      ipcRenderer.on('rag:progress', handler)
      return () => ipcRenderer.removeListener('rag:progress', handler)
    },
  },
  aiOs: {
    status: () => ipcRenderer.invoke('ai-os:status'),
  },
  runtime: {
    logs: () => ipcRenderer.invoke('runtime:logs'),
    restart: () => ipcRenderer.invoke('runtime:restart'),
    chooseWorkspace: () => ipcRenderer.invoke('workspace:choose'),
  },
  app: {
    info: () => ipcRenderer.invoke('app:info'),
  },
})
