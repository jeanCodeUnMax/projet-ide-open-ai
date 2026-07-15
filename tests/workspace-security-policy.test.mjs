import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { auditWorkspaceSecurity } from '../electron/lib/workspace-security-policy.mjs'

async function temporaryWorkspace(prefix = 'ide-security-policy-') {
  return mkdtemp(path.join(os.tmpdir(), prefix))
}

async function write(root, relativePath, content) {
  const target = path.join(root, ...relativePath.split('/'))
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, content, 'utf8')
}

test('les variables vides de .env.example ne deviennent pas des secrets critiques', async () => {
  const workspace = await temporaryWorkspace()
  await write(workspace, '.env.example', [
    'GITHUB_TOKEN=',
    'A2A_SHARED_TOKEN=',
    'MISTRAL_API_KEY=',
    'MISTRAL_EMBED_MODEL=mistral-embed',
    'VISION_API_KEY=',
    'VISION_MODEL=',
    'QDRANT_API_KEY=',
  ].join('\n'))

  const report = await auditWorkspaceSecurity(workspace, { mode: 'strict' })
  assert.equal(report.findings.some((finding) => finding.ruleId.startsWith('secret.')), false)
  assert.equal(report.blocked, false)
})

test('un vrai secret dans .env reste critique et bloque le mode strict', async () => {
  const workspace = await temporaryWorkspace()
  await write(workspace, '.env', 'MISTRAL_API_KEY=wJnWLF1UpguUW0gfTyhtyka3KNt7TYO7\n')

  const report = await auditWorkspaceSecurity(workspace, { mode: 'strict' })
  const secret = report.findings.find((finding) => finding.ruleId === 'secret.known-secret-assignment')
  assert.equal(secret?.severity, 'critical')
  assert.equal(report.blocked, true)
})

test('les configurations hostiles de tests restent visibles sans rendre le projet critique', async () => {
  const workspace = await temporaryWorkspace()
  await write(workspace, 'tests/network-security.test.mjs', "const host = '0.0.0.0'\n")

  const report = await auditWorkspaceSecurity(workspace, { mode: 'strict' })
  const finding = report.findings.find((item) => item.ruleId === 'network.public-bind')
  assert.equal(finding?.severity, 'info')
  assert.equal(finding?.category, 'test-fixture')
  assert.equal(report.blocked, false)
})

test('les risques MCP des fichiers example sont informatifs mais restent affichés', async () => {
  const workspace = await temporaryWorkspace()
  await write(workspace, 'mcp_config.example.json', JSON.stringify({
    mcpServers: {
      filesystem: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '.'] },
      remote: { url: 'https://example.invalid/mcp' },
    },
  }))

  const report = await auditWorkspaceSecurity(workspace, { mode: 'strict' })
  const mcpFindings = report.findings.filter((finding) => finding.ruleId.startsWith('mcp.'))
  assert.ok(mcpFindings.length >= 2)
  assert.ok(mcpFindings.every((finding) => finding.severity === 'info'))
  assert.equal(report.blocked, false)
})

test('une clé plausible dans une documentation est à vérifier sans être automatiquement critique', async () => {
  const workspace = await temporaryWorkspace()
  await write(workspace, 'docs/RAG-PRD.md', 'Exemple historique : MISTRAL_API_KEY=wJnWLF1UpguUW0gfTyhtyka3KNt7TYO7\n')

  const report = await auditWorkspaceSecurity(workspace, { mode: 'strict' })
  const finding = report.findings.find((item) => item.ruleId === 'secret.known-secret-assignment')
  assert.equal(finding?.severity, 'medium')
  assert.equal(finding?.category, 'documentation')
  assert.equal(report.blocked, false)
})
