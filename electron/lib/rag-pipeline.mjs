import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  readDocumentIndex,
  renderDocumentIndexMarkdown,
  sha256,
  sha256File,
  upsertDocumentIndexEntry,
  writeDocumentIndex,
} from './document-index.mjs'

const DEFAULT_STOP_WORDS = new Set([
  'avec', 'dans', 'pour', 'plus', 'mais', 'sans', 'sous', 'entre', 'comme', 'cette', 'cela', 'tout', 'tous', 'toute', 'toutes',
  'des', 'les', 'une', 'que', 'qui', 'sur', 'est', 'sont', 'par', 'pas', 'aux', 'du', 'de', 'la', 'le', 'un', 'et', 'en',
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'into', 'are', 'was', 'were', 'not', 'you', 'your', 'their', 'its', 'can',
])

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim()))]
}

export function deterministicUuid(value) {
  const bytes = Buffer.from(sha256(value).slice(0, 32), 'hex')
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function chunkText(text, { maxChars = 2400, overlapChars = 300 } = {}) {
  if (typeof text !== 'string') throw new Error('Le texte à chunker doit être une chaîne.')
  if (!Number.isInteger(maxChars) || maxChars < 200) throw new Error('maxChars doit être un entier >= 200.')
  if (!Number.isInteger(overlapChars) || overlapChars < 0 || overlapChars >= maxChars) {
    throw new Error('overlapChars doit être compris entre 0 et maxChars - 1.')
  }

  const normalized = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  if (!normalized) return []
  const chunks = []
  let start = 0
  while (start < normalized.length) {
    let end = Math.min(start + maxChars, normalized.length)
    if (end < normalized.length) {
      const paragraphBreak = normalized.lastIndexOf('\n\n', end)
      const sentenceBreak = Math.max(normalized.lastIndexOf('. ', end), normalized.lastIndexOf('! ', end), normalized.lastIndexOf('? ', end))
      const candidate = Math.max(paragraphBreak, sentenceBreak)
      if (candidate > start + Math.floor(maxChars * 0.55)) end = candidate + 1
    }
    const value = normalized.slice(start, end).trim()
    if (value) chunks.push(value)
    if (end >= normalized.length) break
    const nextStart = end - overlapChars
    start = nextStart > start ? nextStart : end
  }
  return chunks
}

export function extractDeterministicTags(text, { limit = 12, stopWords = DEFAULT_STOP_WORDS } = {}) {
  const counts = new Map()
  const tokens = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .match(/[a-z0-9][a-z0-9_-]{2,}/g) ?? []
  for (const token of tokens) {
    if (stopWords.has(token) || /^\d+$/.test(token)) continue
    counts.set(token, (counts.get(token) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([token]) => token)
}

function renderMarkdown({ title, sourcePath, text, imageDescriptions, tags }) {
  const lines = [
    '---',
    `title: ${JSON.stringify(title)}`,
    `source: ${JSON.stringify(sourcePath)}`,
    `tags: [${tags.map((tag) => JSON.stringify(tag)).join(', ')}]`,
    '---',
    '',
    `# ${title}`,
    '',
    text.trim(),
  ]
  if (imageDescriptions.length > 0) {
    lines.push('', '## Descriptions des images', '')
    for (const image of imageDescriptions) {
      lines.push(`### Image ${image.sequence}`, '', image.description || '_Description indisponible._', '')
    }
  }
  return `${lines.join('\n').trim()}\n`
}

export class DocumentIngestionPipeline {
  constructor({ extractor, imageDescriptor, embeddingProvider, vectorStore, tagger, logger = console } = {}) {
    if (!extractor || typeof extractor.extract !== 'function') throw new Error('Un extracteur documentaire est obligatoire.')
    this.extractor = extractor
    this.imageDescriptor = imageDescriptor
    this.embeddingProvider = embeddingProvider
    this.vectorStore = vectorStore
    this.tagger = tagger
    this.logger = logger
  }

  async ingest({ sourcePath, outputRoot, title = path.basename(sourcePath), tags = [], metadata = {}, onProgress } = {}) {
    if (!sourcePath) throw new Error('sourcePath est obligatoire.')
    if (!outputRoot) throw new Error('outputRoot est obligatoire.')

    const progress = (phase, details = {}) => {
      if (typeof onProgress === 'function') onProgress({ phase, ...details })
    }

    progress('checksum-started')
    const sourceChecksum = await sha256File(sourcePath)
    progress('checksum-completed', { sourceChecksum })
    const documentId = sha256(`${sourceChecksum}:${path.resolve(sourcePath)}`).slice(0, 32)
    progress('extraction-started')
    const extraction = await this.extractor.extract(sourcePath)
    progress('extraction-completed', { method: extraction.extraction?.method, imageCount: extraction.images?.length ?? 0 })

    try {
      return await this.#processExtraction({
        extraction,
        sourcePath,
        sourceChecksum,
        documentId,
        outputRoot,
        title,
        tags,
        metadata,
        progress,
      })
    } finally {
      if (typeof extraction.cleanup === 'function') {
        await extraction.cleanup().catch((error) => {
          this.logger.warn?.(`Nettoyage extraction impossible: ${error instanceof Error ? error.message : String(error)}`)
        })
      }
    }
  }

  async #processExtraction({ extraction, sourcePath, sourceChecksum, documentId, outputRoot, title, tags, metadata, progress }) {
    progress('images-started', { imageCount: extraction.images?.length ?? 0 })
    const imageDescriptions = []
    for (const [index, image] of (extraction.images ?? []).entries()) {
      let description = ''
      if (this.imageDescriptor?.describe) {
        try {
          description = await this.imageDescriptor.describe(image.path, { language: 'fr' })
        } catch (error) {
          this.logger.warn?.(`Description image impossible: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
      imageDescriptions.push({
        id: `${documentId}-image-${index + 1}`,
        sequence: index + 1,
        page: image.page,
        description,
        source: image.source,
      })
    }

    progress('images-completed', { describedCount: imageDescriptions.filter((image) => image.description).length })
    const enrichmentText = imageDescriptions
      .filter((image) => image.description)
      .map((image) => `[Image ${image.sequence}] ${image.description}`)
      .join('\n\n')
    const searchableText = [extraction.text ?? '', enrichmentText].filter(Boolean).join('\n\n')
    progress('tagging-started')
    const generatedTags = this.tagger?.generate
      ? await this.tagger.generate({ text: searchableText, title, metadata })
      : extractDeterministicTags(searchableText)
    const normalizedTags = uniqueStrings([...tags, ...generatedTags])
    progress('tagging-completed', { tags: normalizedTags })
    progress('chunking-started')
    const chunkValues = chunkText(searchableText)
    const chunks = chunkValues.map((text, index) => ({
      id: deterministicUuid(`${documentId}:${index}:${sha256(text)}`),
      index,
      text,
      checksum: sha256(text),
    }))

    progress('chunking-completed', { chunkCount: chunks.length })

    let vectors = []
    let embedding = { status: 'skipped', provider: undefined, vectorCount: 0 }
    if (this.embeddingProvider && chunks.length > 0) {
      progress('embedding-started', { chunkCount: chunks.length })
      vectors = await this.embeddingProvider.embedBatch(chunks.map((chunk) => chunk.text))
      if (vectors.length !== chunks.length) throw new Error('Le fournisseur d’embeddings a retourné un nombre de vecteurs invalide.')
      embedding = {
        status: 'generated',
        provider: this.embeddingProvider.constructor.name,
        vectorCount: vectors.length,
        dimensions: vectors[0]?.length ?? 0,
      }
      progress('embedding-completed', embedding)
    } else {
      progress('embedding-skipped')
    }

    const document = {
      id: documentId,
      title,
      sourcePath: path.resolve(sourcePath),
      sourceChecksum,
      mimeType: extraction.mimeType,
      tags: normalizedTags,
      metadata: structuredClone(metadata),
    }

    let vectorIndex = { status: 'skipped', pointIds: [] }
    if (this.vectorStore && vectors.length > 0) {
      progress('vector-index-started')
      vectorIndex = await this.vectorStore.upsert({ document, chunks, vectors })
      embedding.status = vectorIndex.status === 'indexed' ? 'indexed' : embedding.status
      embedding.collection = vectorIndex.collection
      progress('vector-index-completed', vectorIndex)
    } else {
      progress('vector-index-skipped')
    }

    progress('files-started')
    const documentDirectory = path.join(outputRoot, 'documents', documentId)
    await mkdir(documentDirectory, { recursive: true })
    const markdownPath = path.join(documentDirectory, 'document.md')
    const manifestPath = path.join(documentDirectory, 'manifest.json')
    await writeFile(markdownPath, renderMarkdown({
      title,
      sourcePath: document.sourcePath,
      text: extraction.text ?? '',
      imageDescriptions,
      tags: normalizedTags,
    }), 'utf8')

    const manifest = {
      schemaVersion: '1.0.0',
      pipelineVersion: '0.2.0',
      ingestedAt: new Date().toISOString(),
      document,
      extraction: extraction.extraction,
      chunks,
      images: imageDescriptions,
      embedding,
      vectorIndex,
    }
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

    const indexPath = path.join(outputRoot, 'index.json')
    const currentIndex = await readDocumentIndex(indexPath)
    const nextIndex = upsertDocumentIndexEntry(currentIndex, {
      id: documentId,
      title,
      sourcePath: document.sourcePath,
      sourceChecksum,
      mimeType: extraction.mimeType,
      tags: normalizedTags,
      chunkCount: chunks.length,
      imageCount: imageDescriptions.length,
      embedding,
      vectorCollection: vectorIndex.collection,
      documentPath: path.relative(outputRoot, markdownPath).replaceAll(path.sep, '/'),
      manifestPath: path.relative(outputRoot, manifestPath).replaceAll(path.sep, '/'),
      updatedAt: new Date().toISOString(),
    })
    await writeDocumentIndex(indexPath, nextIndex)
    await writeFile(path.join(outputRoot, 'INDEX.md'), renderDocumentIndexMarkdown(nextIndex), 'utf8')
    progress('files-completed', { markdownPath, manifestPath, indexPath })

    return {
      runId: randomUUID(),
      documentId,
      markdownPath,
      manifestPath,
      indexPath,
      tags: normalizedTags,
      chunkCount: chunks.length,
      imageCount: imageDescriptions.length,
      embedding,
    }
  }
}
