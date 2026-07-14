'use strict'

const { installOpenFoxHiddenFilesGuard } = require('./lib/openfox-hidden-files-guard.cjs')
const { installProviderFetchGuard } = require('./lib/mistral-request-sanitizer.cjs')

function installGuardSafely() {
  let installed = false

  try {
    installed = installOpenFoxHiddenFilesGuard() || installed
  } catch (error) {
    // File visibility must never prevent OpenFox itself from starting.
    console.error('[IDE hidden files guard] Installation impossible; OpenFox continue avec ses filtres par défaut.', error)
  }

  try {
    installed = installProviderFetchGuard() || installed
  } catch (error) {
    // Compatibility and local provider startup must never prevent OpenFox itself from starting.
    console.error('[IDE provider guard] Installation impossible; OpenFox continue sans garde.', error)
  }

  return installed
}

installGuardSafely()
