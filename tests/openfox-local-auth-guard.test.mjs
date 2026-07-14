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
    console: { error() {} },
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

test('le preload transforme un dépôt de l’explorateur en référence de contexte OpenFox', async () => {
  const source = await readFile(preloadUrl, 'utf8')
  assert.match(source, /application\/x-ide-open-ai-workspace-entry/)
  assert.match(source, /data-testid=[\\]?["']chat-input-textarea/)
  assert.match(source, /@\$\{normalizedPath\}/)
  assert.match(source, /new InputEvent\(['"]input['"]/)
  assert.match(source, /stopImmediatePropagation\(\)/)
})

test('le correctif du sélecteur Windows est autonome dans la sandbox et injecté dans le monde principal', async () => {
  const source = await readFile(preloadUrl, 'utf8')
  assert.match(source, /function mainWorldProjectSelectionGuard\(\)/)
  assert.match(source, /contextBridge\?\.executeInMainWorld/)
  assert.match(source, /executeInMainWorld\(\{ func: mainWorldProjectSelectionGuard, args: \[\] \}\)/)
  assert.match(source, /webFrame\?\.executeJavaScript/)
  assert.doesNotMatch(source, /require\(['"]\.\/lib\/openfox-windows-project-guard\.cjs['"]\)/)
  assert.match(source, /Sélection du dossier impossible/)
})

test('le bootstrap installe le preload moderne avant main sans bloquer app.whenReady', async () => {
  const source = await readFile(bootstrapUrl, 'utf8')
  assert.match(source, /session\.defaultSession\.getPreloadScripts\(\)/)
  assert.match(source, /session\.defaultSession\.registerPreloadScript\(\{/)
  assert.match(source, /type:\s*['"]frame['"]/)
  assert.match(source, /id:\s*LOCAL_SESSION_PRELOAD_ID/)
  assert.match(source, /filePath:\s*localSessionPreload/)
  assert.doesNotMatch(source, /\.getPreloads\(/)
  assert.doesNotMatch(source, /\.setPreloads\(/)
  assert.match(source, /openfox-local-session-preload\.cjs/)
  assert.ok(source.indexOf('app.whenReady().then') < source.indexOf("import('./main.mjs')"))
  assert.doesNotMatch(source, /^\s*await\s+sessionPreloadReady/m)
  assert.doesNotMatch(source, /^\s*await\s+app\.whenReady\(\)/m)
  assert.match(source, /void\s+import\('\.\/main\.mjs'\)\.catch/)

  const packageDocument = JSON.parse(await readFile(packageUrl, 'utf8'))
  assert.equal(packageDocument.main, 'electron/bootstrap.mjs')
  assert.equal(packageDocument.build.extraMetadata.main, 'electron/bootstrap.mjs')
})
