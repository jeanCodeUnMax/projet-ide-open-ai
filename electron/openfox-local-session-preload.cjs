'use strict'

const WORKSPACE_ENTRY_MIME = 'application/x-ide-open-ai-workspace-entry'
const WORKSPACE_TEXT_PREFIX = 'ide-open-ai-workspace:'

function isLoopbackOpenFoxPage() {
  const loopbackHosts = new Set(['127.0.0.1', 'localhost', '::1'])
  return location.protocol === 'http:' && loopbackHosts.has(location.hostname)
}

function mainWorldProjectSelectionGuard() {
  if (window.__ideAiWindowsProjectGuardInstalled || typeof window.fetch !== 'function') return false

  const nativeFetch = window.fetch.bind(window)

  const showProjectError = (message) => {
    const previous = document.getElementById('ide-ai-project-selection-error')
    previous?.remove()

    const notice = document.createElement('div')
    notice.id = 'ide-ai-project-selection-error'
    notice.setAttribute('role', 'alert')
    notice.textContent = message || 'Impossible de sélectionner ce dossier.'
    Object.assign(notice.style, {
      position: 'fixed',
      right: '20px',
      bottom: '20px',
      zIndex: '2147483647',
      maxWidth: '520px',
      padding: '12px 16px',
      border: '1px solid #ef4444',
      borderRadius: '8px',
      background: '#2a1114',
      color: '#fecaca',
      fontFamily: 'system-ui, sans-serif',
      fontSize: '14px',
      boxShadow: '0 12px 30px rgba(0,0,0,.45)',
      whiteSpace: 'pre-wrap',
    })
    document.body.appendChild(notice)
    window.setTimeout(() => notice.remove(), 10_000)
  }

  window.fetch = async function ideAiProjectCompatibleFetch(input, init) {
    let parsedUrl
    try {
      const rawUrl = typeof input === 'string' ? input : input?.url
      parsedUrl = new URL(rawUrl, window.location.origin)
    } catch {
      return nativeFetch(input, init)
    }

    const method = String(init?.method ?? input?.method ?? 'GET').toUpperCase()
    if (method !== 'POST' || parsedUrl.pathname !== '/api/projects' || typeof init?.body !== 'string') {
      return nativeFetch(input, init)
    }

    let requestInit = init
    try {
      const original = JSON.parse(init.body)
      if (original && typeof original === 'object' && !Array.isArray(original) && typeof original.workdir === 'string') {
        const workdir = original.workdir.trim()
        const currentName = typeof original.name === 'string' ? original.name.trim() : ''
        const cleanPath = workdir.replace(/[\\/]+$/, '')
        const parts = cleanPath.split(/[\\/]+/).filter(Boolean)
        const basename = parts.at(-1) ?? cleanPath
        const pathLikeName = !currentName
          || currentName === workdir
          || /[\\/]/.test(currentName)
          || /^[A-Za-z]:/.test(currentName)

        if (basename && pathLikeName && currentName !== basename) {
          requestInit = { ...init, body: JSON.stringify({ ...original, name: basename }) }
        }
      }
    } catch {
      // Preserve OpenFox's original request when its body is not valid JSON.
    }

    const response = await nativeFetch(input, requestInit)
    if (!response.ok) {
      void response.clone().json()
        .catch(() => ({}))
        .then((body) => {
          const detail = body?.error?.message ?? body?.error ?? body?.message
          showProjectError(detail ? `Sélection du dossier impossible : ${detail}` : `Sélection du dossier impossible (HTTP ${response.status}).`)
        })
    }
    return response
  }

  Object.defineProperty(window, '__ideAiWindowsProjectGuardInstalled', {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  })
  return true
}

function installWindowsProjectSelectionGuard() {
  try {
    const { contextBridge, webFrame } = require('electron')

    if (typeof contextBridge?.executeInMainWorld === 'function') {
      contextBridge.executeInMainWorld({ func: mainWorldProjectSelectionGuard, args: [] })
      return true
    }

    if (typeof webFrame?.executeJavaScript === 'function') {
      void webFrame.executeJavaScript(`(${mainWorldProjectSelectionGuard.toString()})()`, true)
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
