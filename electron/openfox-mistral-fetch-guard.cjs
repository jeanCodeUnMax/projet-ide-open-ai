'use strict'

const { installMistralFetchGuard } = require('./lib/mistral-request-sanitizer.cjs')

function installGuardSafely() {
  try {
    return installMistralFetchGuard()
  } catch (error) {
    // Compatibility must never prevent OpenFox itself from starting.
    console.error('[IDE Mistral guard] Installation impossible; OpenFox continue sans garde.', error)
    return false
  }
}

installGuardSafely()
