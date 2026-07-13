import { contextBridge, ipcRenderer } from 'electron'

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
  runtime: {
    logs: () => ipcRenderer.invoke('runtime:logs'),
    restart: () => ipcRenderer.invoke('runtime:restart'),
    chooseWorkspace: () => ipcRenderer.invoke('workspace:choose'),
  },
  app: {
    info: () => ipcRenderer.invoke('app:info'),
  },
})
