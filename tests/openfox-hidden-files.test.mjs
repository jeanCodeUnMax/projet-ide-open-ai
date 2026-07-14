import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import hiddenFilesGuard from '../electron/lib/openfox-hidden-files-guard.cjs'

const {
  exposeAllFilesOptions,
  isOpenFoxFileSearchCall,
} = hiddenFilesGuard

const entryUrl = new URL('../electron/openfox-mistral-fetch-guard.cjs', import.meta.url)
const runtimeUrl = new URL('../electron/lib/openfox-runtime.mjs', import.meta.url)

test('le garde reconnaît précisément la recherche de fichiers OpenFox', () => {
  const options = {
    cwd: 'C:\\workspace',
    dot: true,
    deep: 5,
    onlyFiles: false,
    ignore: [
      '**/node_modules/**',
      '**/.git/**',
      '**/dist/**',
      '**/.openfox/**',
    ],
  }

  assert.equal(isOpenFoxFileSearchCall(['**/*'], options), true)
  assert.equal(isOpenFoxFileSearchCall(['src/**/*'], options), false)
  assert.equal(isOpenFoxFileSearchCall(['**/*'], { ...options, dot: false }), false)
})

test('la recherche OpenFox expose les dotfiles, les dossiers lourds et toute profondeur', () => {
  const original = {
    cwd: 'C:\\workspace',
    dot: true,
    deep: 5,
    onlyFiles: false,
    ignore: [
      '**/node_modules/**',
      '**/.git/**',
      '**/dist/**',
      '**/.next/**',
      '**/.cache/**',
      '**/__pycache__/**',
      '**/*.lock',
      '**/.openfox/**',
    ],
    objectMode: true,
  }

  const visible = exposeAllFilesOptions(['**/*'], original)

  assert.notEqual(visible, original)
  assert.deepEqual(visible.ignore, [])
  assert.equal(visible.dot, true)
  assert.equal('deep' in visible, false)
  assert.equal(visible.followSymbolicLinks, false)
  assert.equal(visible.suppressErrors, true)
  assert.equal(original.deep, 5)
  assert.equal(original.ignore.length, 8)
})

test('les autres usages de fast-glob restent inchangés', () => {
  const options = {
    cwd: '/workspace',
    dot: false,
    deep: 3,
    onlyFiles: true,
    ignore: ['**/node_modules/**'],
  }

  assert.equal(exposeAllFilesOptions(['src/**/*'], options), options)
})

test('OpenFox charge le garde de fichiers cachés avant son CLI', async () => {
  const [entry, runtime] = await Promise.all([
    readFile(entryUrl, 'utf8'),
    readFile(runtimeUrl, 'utf8'),
  ])

  assert.match(entry, /openfox-hidden-files-guard\.cjs/)
  assert.match(entry, /installOpenFoxHiddenFilesGuard\(\)/)
  assert.match(runtime, /\['--require', compatibilityGuard, cliPath/)
})
