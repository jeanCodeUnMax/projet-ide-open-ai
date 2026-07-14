import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

const preloadUrl = new URL('../electron/openfox-local-session-preload.cjs', import.meta.url)
const bootstrapUrl = new URL('../electron/bootstrap.mjs', import.meta.url)
const packageUrl = new URL('../package.json', import.meta.url)

function executePreload({ protocol, hostname, initialToken } = {}) {
  const values = new Map()
  if (initialToken !== undefined) values.set('openfox_token', initialToken)
  const localStorage = {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
  }
  const source = globalThis.__openFoxLocalPreloadSource
  vm.runInNewContext(source, {
    location: { protocol, hostname },
    localStorage,
    Set,
  })
  return values.get('openfox_token')
}

test.before(async () => {
  globalThis.__openFoxLocalPreloadSource = await readFile(preloadUrl, 'utf8')
})

test.after(() => {
  delete globalThis.__openFoxLocalPreloadSource
})

test('le preload place un marqueur avant React uniquement sur le serveur OpenFox local', () => {
  assert.equal(
    executePreload({ protocol: 'http:', hostname: '127.0.0.1' }),
    'ide-open-ai-local-loopback',
  )
  assert.equal(
    executePreload({ protocol: 'http:', hostname: 'localhost' }),
    'ide-open-ai-local-loopback',
  )
  assert.equal(executePreload({ protocol: 'file:', hostname: '' }), undefined)
  assert.equal(executePreload({ protocol: 'https:', hostname: 'example.com' }), undefined)
})

test('le preload ne remplace jamais un token OpenFox déjà présent', () => {
  assert.equal(
    executePreload({ protocol: 'http:', hostname: '127.0.0.1', initialToken: 'existing-token' }),
    'existing-token',
  )
})

test('le bootstrap installe le preload avant main sans bloquer app.whenReady', async () => {
  const source = await readFile(bootstrapUrl, 'utf8')
  assert.match(source, /session\.defaultSession\.setPreloads/)
  assert.match(source, /openfox-local-session-preload\.cjs/)
  assert.ok(source.indexOf('app.whenReady().then') < source.indexOf("import('./main.mjs')"))
  assert.doesNotMatch(source, /await\s+sessionPreloadReady/)
  assert.doesNotMatch(source, /await\s+app\.whenReady\(\)/)
  assert.match(source, /void\s+import\('\.\/main\.mjs'\)\.catch/)

  const packageDocument = JSON.parse(await readFile(packageUrl, 'utf8'))
  assert.equal(packageDocument.main, 'electron/bootstrap.mjs')
  assert.equal(packageDocument.build.extraMetadata.main, 'electron/bootstrap.mjs')
})
