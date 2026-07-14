import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const preloadUrl = new URL('../electron/preload.mjs', import.meta.url)
const shellUrl = new URL('../electron/windows/ide-shell.js', import.meta.url)

test('une navigation OpenFox ne réinjecte pas un rafraîchissement de session', async () => {
  const [preload, shell] = await Promise.all([
    readFile(preloadUrl, 'utf8'),
    readFile(shellUrl, 'utf8'),
  ])

  assert.doesNotMatch(shell, /openFox\?\.onNavigated/)
  assert.doesNotMatch(shell, /openfox:navigated/)
  assert.match(preload, /onNavigated:\s*\(\)\s*=>\s*\(\)\s*=>\s*\{\}/)
  assert.doesNotMatch(preload, /subscribe\(['"]openfox:navigated['"]/)
})
