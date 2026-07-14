'use strict'

const { installProviderFetchGuard } = require('./lib/mistral-request-sanitizer.cjs')

function installGuardSafely() {
  try {
    return installProviderFetchGuard()
  } catch (error) {
    // Compatibility and local provider startup must never prevent OpenFox itself from starting.
    console.error('[IDE provider guard] Installation impossible; OpenFox continue sans garde.', error)
    return false
  }
}

installGuardSafely()
