import test from 'node:test'
import assert from 'node:assert/strict'
import { createRuntimePaths } from '../electron/lib/runtime-paths.mjs'

test('Linux isole OpenFox avec XDG sans remplacer HOME', () => {
  const paths = createRuntimePaths('/tmp/ide-open-ai', 'linux')
  assert.match(paths.configPath, /xdg-config\/openfox\/config\.json$/)
  assert.equal('HOME' in paths.env, false)
})

test('macOS virtualise HOME car OpenFox utilise homedir', () => {
  const paths = createRuntimePaths('/tmp/ide-open-ai', 'darwin')
  assert.equal(paths.env.HOME, paths.virtualHome)
  assert.match(paths.configPath, /Library\/Application Support\/openfox\/config\.json$/)
})
