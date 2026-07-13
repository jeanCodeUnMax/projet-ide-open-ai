import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { buildProvenanceChunks, chunkText, DocumentIngestionPipeline, extractDeterministicTags } from '../electron/lib/rag-pipeline.mjs'

test('chunkText crée des chunks chevauchants sans boucle', () => {
  const text = 'A'.repeat(900) + '. ' + 'B'.repeat(900) + '. ' + 'C'.repeat(900)
  const chunks = chunkText(text, { maxChars: 1000, overlapChars: 100 })
  assert.ok(chunks.length >= 3)
  assert.ok(chunks.every((chunk) => chunk.length <= 1001))
})

test('extractDeterministicTags produit des tags stables', () => {
  const tags = extractDeterministicTags('OCR OCR PDF embeddings embeddings embeddings Qdrant')
  assert.deepEqual(tags.slice(0, 3), ['embeddings', 'ocr', 'pdf'])
})

test('buildProvenanceChunks conserve page, document et image', () => {
  const document = { id: 'doc-1', title: 'Manuel', sourcePath: '/tmp/manuel.pdf', sourceChecksum: 'abc' }
  const chunks = buildProvenanceChunks({
    document,
    pages: [{ number: 2, text: 'Une règle importante.' }],
    imageDescriptions: [{ id: 'img-1', sequence: 4, page: 3, description: 'Un schéma.', source: 'pdfimages' }],
  })
  assert.equal(chunks.length, 2)
  assert.equal(chunks[0].citation.pageStart, 2)
  assert.equal(chunks[0].citation.kind, 'text')
  assert.equal(chunks[1].citation.pageStart, 3)
  assert.equal(chunks[1].citation.imageSequence, 4)
  assert.equal(chunks[1].citation.kind, 'image')
})

test('DocumentIngestionPipeline génère manifeste et citations précises', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ide-ai-rag-test-'))
  const sourcePath = path.join(directory, 'source.txt')
  const outputRoot = path.join(directory, '.ide-ai', 'rag')
  await writeFile(sourcePath, 'Architecture A2A avec OCR, images et mémoire unifiée.', 'utf8')

  const vectorStoreCalls = []
  const pipeline = new DocumentIngestionPipeline({
    extractor: {
      async extract(filePath) {
        const text = await readFile(filePath, 'utf8')
        return { text, mimeType: 'text/plain', pages: [{ number: 1, text }], images: [], extraction: { method: 'test' } }
      },
    },
    embeddingProvider: { async embedBatch(texts) { return texts.map((_text, index) => [index, 1, 0]) } },
    vectorStore: {
      async upsert(payload) {
        vectorStoreCalls.push(payload)
        return { status: 'indexed', collection: 'tests', pointIds: payload.chunks.map((chunk) => chunk.id) }
      },
    },
  })

  const result = await pipeline.ingest({ sourcePath, outputRoot, tags: ['manuel'] })
  const index = JSON.parse(await readFile(result.indexPath, 'utf8'))
  const manifest = JSON.parse(await readFile(result.manifestPath, 'utf8'))
  assert.equal(index.documents.length, 1)
  assert.equal(index.documents[0].embedding.status, 'indexed')
  assert.equal(index.documents[0].pageCount, 1)
  assert.ok(index.documents[0].tags.includes('manuel'))
  assert.equal(manifest.schemaVersion, '1.1.0')
  assert.equal(manifest.chunks[0].citation.pageStart, 1)
  assert.equal(manifest.chunks[0].citation.sourceChecksum, manifest.document.sourceChecksum)
  assert.equal(vectorStoreCalls[0].chunks[0].citation.kind, 'text')
})
