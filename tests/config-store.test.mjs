import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeMcpDocument,
  resolveEnvPlaceholders,
  validateServerConfig,
} from '../electron/lib/config-store.mjs'

test('normalise une configuration Windsurf mcpServers', () => {
  const result = normalizeMcpDocument({
    mcpServers: {
      filesystem: { command: 'npx', args: ['-y', 'server'] },
    },
  })
  assert.equal(result.toolLimit, 100)
  assert.equal(result.mcpServers.filesystem.transport, 'stdio')
  assert.equal(result.mcpServers.filesystem.command, 'npx')
})

test('accepte aussi une table de serveurs sans enveloppe mcpServers', () => {
  const result = normalizeMcpDocument({
    toolLimit: 42,
    local: { transport: 'stdio', command: 'node', args: ['server.js'] },
  })
  assert.equal(result.toolLimit, 42)
  assert.equal(result.mcpServers.local.command, 'node')
  assert.equal('toolLimit' in result.mcpServers, false)
})

test('résout les variables d’environnement récursivement', () => {
  const result = resolveEnvPlaceholders(
    { headers: { Authorization: 'Bearer ${env:TOKEN}' }, args: ['${env:ROOT}'] },
    { TOKEN: 'secret', ROOT: '/workspace' },
  )
  assert.deepEqual(result, { headers: { Authorization: 'Bearer secret' }, args: ['/workspace'] })
})

test('rejette une variable absente', () => {
  assert.throws(() => resolveEnvPlaceholders('${env:MISSING}', {}), /MISSING/)
})

test('rejette SSE tant que le moteur OpenFox ne le supporte pas', () => {
  assert.throws(() => validateServerConfig('legacy', { transport: 'sse', url: 'https://example.test/sse' }), /SSE/)
})

test('rejette une URL MCP non HTTP', () => {
  assert.throws(() => validateServerConfig('remote', { transport: 'http', url: 'file:///tmp/mcp' }), /HTTP/)
})
