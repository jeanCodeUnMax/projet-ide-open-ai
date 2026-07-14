'use strict'

const { createRequire } = require('node:module')

const OPENFOX_FILE_SEARCH_PATTERN = '**/*'

function isOpenFoxFileSearchCall(patterns, options) {
  const patternList = Array.isArray(patterns) ? patterns : [patterns]
  if (patternList.length !== 1 || patternList[0] !== OPENFOX_FILE_SEARCH_PATTERN) return false
  if (!options || typeof options !== 'object') return false
  if (options.dot !== true || options.onlyFiles !== false) return false
  if (!Array.isArray(options.ignore)) return false

  // OpenFox 2.0.x file-search route has this distinctive exclusion list.
  return options.ignore.some((item) => String(item).includes('/.git/'))
    && options.ignore.some((item) => String(item).includes('/node_modules/'))
}

function exposeAllFilesOptions(patterns, options) {
  if (!isOpenFoxFileSearchCall(patterns, options)) return options

  const visible = {
    ...options,
    dot: true,
    ignore: [],
    followSymbolicLinks: false,
    suppressErrors: true,
  }

  // OpenFox limits its @file search to five directory levels. Omitting `deep`
  // restores fast-glob's recursive default so deeply nested hidden files remain
  // selectable. Symbolic links are never followed to avoid loops and escapes.
  delete visible.deep
  return visible
}

function resolveFastGlob() {
  const candidates = []

  try {
    const openFoxEntry = require.resolve('openfox')
    const openFoxRequire = createRequire(openFoxEntry)
    candidates.push({ resolve: openFoxRequire.resolve.bind(openFoxRequire), load: openFoxRequire })
  } catch {
    // Fall through to the application's dependency tree.
  }

  candidates.push({ resolve: require.resolve.bind(require), load: require })

  for (const candidate of candidates) {
    try {
      const modulePath = candidate.resolve('fast-glob')
      const loaded = candidate.load(modulePath)
      return { modulePath, loaded }
    } catch {
      // Try the next resolution root.
    }
  }

  throw new Error('fast-glob est introuvable dans les dépendances OpenFox.')
}

function copyFunctionProperties(target, source) {
  for (const key of Reflect.ownKeys(source)) {
    if (['length', 'name', 'prototype', 'arguments', 'caller'].includes(String(key))) continue
    const descriptor = Object.getOwnPropertyDescriptor(source, key)
    if (!descriptor) continue
    try {
      Object.defineProperty(target, key, descriptor)
    } catch {
      // Non-critical helper properties can stay on the original function only.
    }
  }
  return target
}

function installOpenFoxHiddenFilesGuard({ cache = require.cache } = {}) {
  if (globalThis.__ideAiOpenFoxHiddenFilesGuardInstalled) return false

  const { modulePath, loaded } = resolveFastGlob()
  const original = typeof loaded === 'function' ? loaded : loaded?.default
  if (typeof original !== 'function') throw new Error('Export fast-glob incompatible avec le garde de visibilité.')

  const wrapped = copyFunctionProperties(function ideAiVisibleFastGlob(patterns, options) {
    return original(patterns, exposeAllFilesOptions(patterns, options))
  }, original)

  if (typeof original.sync === 'function') {
    wrapped.sync = function ideAiVisibleFastGlobSync(patterns, options) {
      return original.sync(patterns, exposeAllFilesOptions(patterns, options))
    }
  }

  const cacheEntry = cache[modulePath]
  if (!cacheEntry) throw new Error(`Module fast-glob non présent dans le cache Node: ${modulePath}`)

  if (typeof loaded === 'function') {
    cacheEntry.exports = wrapped
  } else {
    cacheEntry.exports = { ...loaded, default: wrapped }
  }

  Object.defineProperty(globalThis, '__ideAiOpenFoxHiddenFilesGuardInstalled', {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  })
  return true
}

module.exports = {
  exposeAllFilesOptions,
  installOpenFoxHiddenFilesGuard,
  isOpenFoxFileSearchCall,
}
