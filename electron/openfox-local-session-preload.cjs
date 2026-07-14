'use strict'

// This preload is installed at the Electron session level so it runs before
// the OpenFox frontend scripts. OpenFox 2.0.x treats the absence of a browser
// token as a password prompt during transient WebSocket reconnects, even when
// /api/auth reports that the loopback server does not require authentication.
// A local-only marker prevents that false prompt. The OpenFox loopback server
// ignores the token while auth.strategy is "local".
try {
  const loopbackHosts = new Set(['127.0.0.1', 'localhost', '::1'])
  const isLoopbackOpenFox = location.protocol === 'http:' && loopbackHosts.has(location.hostname)

  if (isLoopbackOpenFox) {
    const key = 'openfox_token'
    const marker = 'ide-open-ai-local-loopback'
    if (!localStorage.getItem(key)) localStorage.setItem(key, marker)
  }
} catch {
  // file:// windows and non-OpenFox pages may not expose usable localStorage.
}
