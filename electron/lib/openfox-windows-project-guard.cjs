'use strict'

function windowsBasename(value) {
  const normalized = String(value ?? '').trim().replace(/[\\/]+$/, '')
  if (!normalized) return ''
  const parts = normalized.split(/[\\/]+/).filter(Boolean)
  return parts.at(-1) ?? normalized
}

function normalizeProjectCreatePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload
  if (typeof payload.workdir !== 'string' || payload.workdir.trim() === '') return payload

  const workdir = payload.workdir.trim()
  const name = typeof payload.name === 'string' ? payload.name.trim() : ''
  const basename = windowsBasename(workdir)
  const pathLikeName = !name || name === workdir || /[\\/]/.test(name) || /^[A-Za-z]:/.test(name)

  if (!basename || !pathLikeName || name === basename) return payload
  return { ...payload, name: basename }
}

function installOpenFoxWindowsProjectGuard() {
  if (window.__ideAiWindowsProjectGuardInstalled || typeof window.fetch !== 'function') return false

  const nativeFetch = window.fetch.bind(window)
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

    try {
      const original = JSON.parse(init.body)
      const normalized = (() => {
        if (!original || typeof original !== 'object' || Array.isArray(original)) return original
        if (typeof original.workdir !== 'string' || original.workdir.trim() === '') return original

        const workdir = original.workdir.trim()
        const currentName = typeof original.name === 'string' ? original.name.trim() : ''
        const cleanPath = workdir.replace(/[\\/]+$/, '')
        const parts = cleanPath.split(/[\\/]+/).filter(Boolean)
        const basename = parts.at(-1) ?? cleanPath
        const pathLikeName = !currentName
          || currentName === workdir
          || /[\\/]/.test(currentName)
          || /^[A-Za-z]:/.test(currentName)

        if (!basename || !pathLikeName || currentName === basename) return original
        return { ...original, name: basename }
      })()

      if (normalized !== original) {
        return nativeFetch(input, { ...init, body: JSON.stringify(normalized) })
      }
    } catch {
      // Keep OpenFox's original request when the body is not valid JSON.
    }

    return nativeFetch(input, init)
  }

  Object.defineProperty(window, '__ideAiWindowsProjectGuardInstalled', {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  })
  return true
}

module.exports = {
  installOpenFoxWindowsProjectGuard,
  normalizeProjectCreatePayload,
  windowsBasename,
}
