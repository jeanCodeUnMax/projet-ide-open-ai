'use strict'

const WORKSPACE_ENTRY_MIME = 'application/x-ide-open-ai-workspace-entry'
const WORKSPACE_TEXT_PREFIX = 'ide-open-ai-workspace:'

function isLoopbackOpenFoxPage() {
  const loopbackHosts = new Set(['127.0.0.1', 'localhost', '::1'])
  return location.protocol === 'http:' && loopbackHosts.has(location.hostname)
}

function installWindowsProjectSelectionGuard() {
  try {
    const { contextBridge, webFrame } = require('electron')
    const { installOpenFoxWindowsProjectGuard } = require('./lib/openfox-windows-project-guard.cjs')

    if (typeof contextBridge?.executeInMainWorld === 'function') {
      contextBridge.executeInMainWorld({ func: installOpenFoxWindowsProjectGuard })
      return true
    }

    if (typeof webFrame?.executeJavaScript === 'function') {
      void webFrame.executeJavaScript(`(${installOpenFoxWindowsProjectGuard.toString()})()`, true)
      return true
    }
  } catch (error) {
    console.error('[IDE-AI] Correctif du sélecteur de dossier OpenFox indisponible.', error)
  }
  return false
}

function readWorkspaceEntry(dataTransfer) {
  if (!dataTransfer) return undefined

  const parse = (raw) => {
    if (!raw) return undefined
    try {
      const payload = JSON.parse(raw)
      if (!payload || typeof payload.relativePath !== 'string' || payload.relativePath.trim() === '') return undefined
      return {
        relativePath: payload.relativePath.replace(/\\/g, '/').replace(/^\/+/, ''),
        kind: payload.kind === 'directory' ? 'directory' : 'file',
      }
    } catch {
      return undefined
    }
  }

  const customPayload = parse(dataTransfer.getData(WORKSPACE_ENTRY_MIME))
  if (customPayload) return customPayload

  const plainText = dataTransfer.getData('text/plain')
  if (plainText?.startsWith(WORKSPACE_TEXT_PREFIX)) {
    return parse(plainText.slice(WORKSPACE_TEXT_PREFIX.length))
  }
  return undefined
}

function transferMayContainWorkspaceEntry(dataTransfer) {
  const types = Array.from(dataTransfer?.types ?? [])
  return types.includes(WORKSPACE_ENTRY_MIME)
}

function insertWorkspaceReference(entry) {
  const textarea = document.querySelector('[data-testid="chat-input-textarea"], #chat-input-textarea')
  if (!(textarea instanceof HTMLTextAreaElement)) return false

  const normalizedPath = entry.kind === 'directory'
    ? `${entry.relativePath.replace(/\/+$/, '')}/`
    : entry.relativePath
  const reference = `@${normalizedPath} `
  const start = Number.isInteger(textarea.selectionStart) ? textarea.selectionStart : textarea.value.length
  const end = Number.isInteger(textarea.selectionEnd) ? textarea.selectionEnd : start
  const before = textarea.value.slice(0, start)
  const after = textarea.value.slice(end)
  const separator = before && !/\s$/.test(before) ? ' ' : ''
  const nextValue = `${before}${separator}${reference}${after}`
  const nextCursor = before.length + separator.length + reference.length

  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  if (setter) setter.call(textarea, nextValue)
  else textarea.value = nextValue

  textarea.dispatchEvent(new InputEvent('input', {
    bubbles: true,
    composed: true,
    inputType: 'insertText',
    data: reference,
  }))
  textarea.focus()
  textarea.setSelectionRange(nextCursor, nextCursor)
  return true
}

function installWorkspaceDropBridge() {
  let highlighted

  const clearHighlight = () => {
    if (!highlighted) return
    highlighted.style.removeProperty('outline')
    highlighted.style.removeProperty('outline-offset')
    highlighted = undefined
  }

  window.addEventListener('dragover', (event) => {
    if (!transferMayContainWorkspaceEntry(event.dataTransfer)) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    const textarea = document.querySelector('[data-testid="chat-input-textarea"], #chat-input-textarea')
    if (textarea instanceof HTMLElement && highlighted !== textarea) {
      clearHighlight()
      highlighted = textarea
      highlighted.style.setProperty('outline', '2px solid #4c9ffe')
      highlighted.style.setProperty('outline-offset', '4px')
    }
  }, true)

  window.addEventListener('dragleave', (event) => {
    if (!transferMayContainWorkspaceEntry(event.dataTransfer)) return
    if (event.relatedTarget === null) clearHighlight()
  }, true)

  window.addEventListener('drop', (event) => {
    const entry = readWorkspaceEntry(event.dataTransfer)
    if (!entry) return
    event.preventDefault()
    event.stopImmediatePropagation()
    clearHighlight()
    insertWorkspaceReference(entry)
  }, true)

  window.addEventListener('blur', clearHighlight)
}

try {
  if (isLoopbackOpenFoxPage()) {
    // OpenFox 2.0.x treats the absence of a browser token as a password prompt
    // during transient WebSocket reconnects, even with local authentication.
    const key = 'openfox_token'
    const marker = 'ide-open-ai-local-loopback'
    if (!localStorage.getItem(key)) localStorage.setItem(key, marker)
    installWindowsProjectSelectionGuard()
    installWorkspaceDropBridge()
  }
} catch {
  // file:// windows and non-OpenFox pages may not expose usable localStorage/DOM.
}
