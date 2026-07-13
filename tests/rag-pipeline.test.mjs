import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { chunkText, DocumentIngestionPipeline, extractDeterministicTags } from '../electron/lib/rag-pipeline.mjs'

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

test('DocumentIngestionPipeline génère document, manifeste et index', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ide-ai-rag-test-'))
  const sourcePath = path.join(directory, 'source.txt')
  const outputRoot = path.join(directory, '.ide-ai', 'rag')
  await writeFile(sourcePath, 'Architecture A2A avec OCR, images et mémoire unifiée.', 'utf8')

  const vectorStoreCalls = []
  const pipeline = new DocumentIngestionPipeline({
    extractor: {
      async extract(filePath) {
        return { text: await readFile(filePath, 'utf8'), mimeType: 'text/plain', images: [], extraction: { method: 'test' } }
      },
    },
    embeddingProvider: {
      async embedBatch(texts) {
        return texts.map((_text, index) => [index, 1, 0])
      },
    },
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
  assert.ok(index.documents[0].tags.includes('manuel'))
  assert.equal(manifest.chunks.length, 1)
  assert.equal(vectorStoreCalls.length, 1)
})
