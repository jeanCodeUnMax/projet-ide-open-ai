import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { RagWorkspaceService } from '../electron/lib/rag-workspace-service.mjs'

test('RagWorkspaceService exécute un lot et remonte la progression', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'ide-ai-rag-service-'))
  const sourcePath = path.join(workspace, 'document.txt')
  await writeFile(sourcePath, 'Contenu de test', 'utf8')
  const phases = []
  const service = new RagWorkspaceService({
    workspace,
    pipeline: {
      async ingest({ sourcePath: input, onProgress }) {
        onProgress({ phase: 'extraction-started' })
        onProgress({ phase: 'files-completed' })
        return { documentId: 'doc-1', sourcePath: input }
      },
    },
  })
  service.on('progress', (event) => phases.push(event.phase))
  const result = await service.ingestFiles([sourcePath], { tags: ['test'] })
  assert.equal(result.results.length, 1)
  assert.equal(result.failures.length, 0)
  assert.deepEqual(phases, [
    'batch-started',
    'file-started',
    'extraction-started',
    'files-completed',
    'file-completed',
    'batch-completed',
  ])
})

test('RagWorkspaceService retourne une citation précise depuis le manifeste', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'ide-ai-rag-search-'))
  const outputRoot = path.join(workspace, '.ide-ai', 'rag')
  const documentDirectory = path.join(outputRoot, 'documents', 'doc-1')
  await mkdir(documentDirectory, { recursive: true })
  await writeFile(path.join(outputRoot, 'index.json'), JSON.stringify({
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    documents: [{
      id: 'doc-1',
      title: 'Architecture multi-agents',
      sourcePath: '/documents/architecture.pdf',
      sourceChecksum: 'abc123',
      tags: ['a2a', 'orchestration'],
      manifestPath: 'documents/doc-1/manifest.json',
      documentPath: 'documents/doc-1/document.md',
    }],
  }), 'utf8')
  await writeFile(path.join(documentDirectory, 'manifest.json'), JSON.stringify({
    chunks: [{
      id: 'chunk-1', index: 0,
      text: 'Le protocole A2A permet la délégation entre agents spécialisés.',
      citation: {
        documentId: 'doc-1', title: 'Architecture multi-agents', sourceChecksum: 'abc123',
        pageStart: 4, pageEnd: 4, chunkId: 'chunk-1', chunkIndex: 0, kind: 'text',
      },
    }],
  }), 'utf8')

  const service = new RagWorkspaceService({ workspace, pipeline: { ingest: async () => ({}) } })
  const response = await service.search('délégation agents')
  assert.equal(response.mode, 'lexical')
  assert.equal(response.results.length, 1)
  assert.equal(response.results[0].documentId, 'doc-1')
  assert.equal(response.results[0].citation.pageStart, 4)
  assert.match(response.results[0].citation.label, /page 4/i)
  assert.match(response.results[0].snippet, /délégation/i)
})

test('RagWorkspaceService reconstruit une citation pour un ancien manifeste', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'ide-ai-rag-legacy-'))
  const outputRoot = path.join(workspace, '.ide-ai', 'rag')
  const documentDirectory = path.join(outputRoot, 'documents', 'doc-legacy')
  await mkdir(documentDirectory, { recursive: true })
  await writeFile(path.join(outputRoot, 'index.json'), JSON.stringify({
    documents: [{ id: 'doc-legacy', title: 'Ancien document', manifestPath: 'documents/doc-legacy/manifest.json' }],
  }), 'utf8')
  await writeFile(path.join(documentDirectory, 'manifest.json'), JSON.stringify({
    chunks: [{ id: 'legacy-chunk', index: 3, text: 'Compatibilité avec les anciens index.' }],
  }), 'utf8')

  const service = new RagWorkspaceService({ workspace, pipeline: { ingest: async () => ({}) } })
  const response = await service.search('anciens index')
  assert.equal(response.results[0].citation.documentId, 'doc-legacy')
  assert.equal(response.results[0].citation.chunkIndex, 3)
})
