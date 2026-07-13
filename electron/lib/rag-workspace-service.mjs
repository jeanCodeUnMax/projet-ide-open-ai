import { EventEmitter } from 'node:events'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { readDocumentIndex } from './document-index.mjs'
import { DocumentIngestionPipeline } from './rag-pipeline.mjs'
import {
  LocalDocumentExtractor,
  MistralEmbeddingProvider,
  OpenAICompatibleVisionProvider,
  QdrantVectorStore,
} from './rag-providers.mjs'

const SUPPORTED_EXTENSIONS = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.tif', '.tiff', '.md', '.txt', '.json'])
const MAX_BATCH_FILES = 50
const MAX_SEARCH_LIMIT = 50

function tokenize(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .match(/[a-z0-9][a-z0-9_-]{1,}/g) ?? []
}

function lexicalScore(queryTokens, document) {
  if (queryTokens.length === 0) return 0
  const titleTokens = tokenize(document.title)
  const tagTokens = (document.tags ?? []).flatMap(tokenize)
  const textTokens = tokenize(document.searchText)
  let score = 0
  for (const token of queryTokens) {
    score += titleTokens.filter((value) => value === token).length * 8
    score += tagTokens.filter((value) => value === token).length * 5
    score += textTokens.filter((value) => value === token).length
  }
  return score
}

function snippet(text, queryTokens, maxLength = 320) {
  const normalized = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  const lower = normalized.toLowerCase()
  const match = queryTokens.map((token) => lower.indexOf(token)).filter((index) => index >= 0).sort((a, b) => a - b)[0] ?? 0
  const start = Math.max(0, match - Math.floor(maxLength / 3))
  const end = Math.min(normalized.length, start + maxLength)
  return `${start > 0 ? '…' : ''}${normalized.slice(start, end)}${end < normalized.length ? '…' : ''}`
}

function reciprocalRankFusion(resultSets, k = 60) {
  const fused = new Map()
  resultSets.forEach((results, setIndex) => {
    results.forEach((result, rank) => {
      const key = result.chunkId ?? `${result.documentId}:${result.chunkIndex ?? 0}`
      const current = fused.get(key) ?? { ...result, score: 0, sources: [] }
      current.score += 1 / (k + rank + 1)
      current.sources.push(setIndex === 0 ? 'lexical' : 'vector')
      if (!current.citation && result.citation) current.citation = structuredClone(result.citation)
      if (!current.text && result.text) current.text = result.text
      if (!current.snippet && result.snippet) current.snippet = result.snippet
      if (result.vectorScore !== undefined) current.vectorScore = result.vectorScore
      fused.set(key, current)
    })
  })
  return [...fused.values()].sort((a, b) => b.score - a.score)
}

function isPathInside(root, target) {
  const normalizedRoot = path.resolve(root)
  const normalizedTarget = path.resolve(target)
  return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}${path.sep}`)
}

function safeResolve(root, relativePath) {
  if (typeof relativePath !== 'string' || path.isAbsolute(relativePath)) {
    throw new Error('Chemin RAG relatif invalide.')
  }
  const target = path.resolve(root, relativePath)
  if (!isPathInside(root, target)) throw new Error('Chemin RAG hors du workspace autorisé.')
  return target
}

async function validateSourcePath(sourcePath) {
  if (typeof sourcePath !== 'string' || !path.isAbsolute(sourcePath)) {
    throw new Error('Le chemin d’un document doit être absolu.')
  }
  const extension = path.extname(sourcePath).toLowerCase()
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throw new Error(`Format documentaire non pris en charge: ${extension || 'sans extension'}`)
  }
  const information = await stat(sourcePath)
  if (!information.isFile()) throw new Error(`Le chemin n’est pas un fichier: ${sourcePath}`)
  return path.resolve(sourcePath)
}

async function loadManifest(outputRoot, entry) {
  try {
    const manifestPath = safeResolve(outputRoot, entry.manifestPath)
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    return { manifestPath, manifest }
  } catch {
    return { manifestPath: undefined, manifest: undefined }
  }
}

function normalizeCitation(source, { entry, chunk } = {}) {
  const citation = source && typeof source === 'object' ? structuredClone(source) : {}
  citation.documentId ??= entry?.id
  citation.title ??= entry?.title
  citation.sourcePath ??= entry?.sourcePath
  citation.sourceChecksum ??= entry?.sourceChecksum
  citation.chunkId ??= chunk?.id
  citation.chunkIndex ??= chunk?.index
  citation.kind ??= 'text'
  if (!citation.pageStart && Number.isInteger(chunk?.page)) citation.pageStart = chunk.page
  if (!citation.pageEnd && citation.pageStart) citation.pageEnd = citation.pageStart
  citation.label = formatCitationLabel(citation)
  return citation
}

function formatCitationLabel(citation = {}) {
  const title = citation.title ?? citation.documentId ?? 'Document'
  let location = 'emplacement non précisé'
  if (citation.pageStart) {
    location = citation.pageEnd && citation.pageEnd !== citation.pageStart
      ? `pages ${citation.pageStart}-${citation.pageEnd}`
      : `page ${citation.pageStart}`
  }
  if (citation.kind === 'image') {
    location += `, image ${citation.imageSequence ?? citation.imageId ?? '?'}`
  }
  const chunk = citation.chunkIndex !== undefined ? `, chunk ${citation.chunkIndex}` : ''
  return `${title} — ${location}${chunk}`
}

function normalizeLimit(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 12
  return Math.max(1, Math.min(MAX_SEARCH_LIMIT, Math.trunc(parsed)))
}

export class RagWorkspaceService extends EventEmitter {
  constructor({ workspace, pipeline, embeddingProvider, vectorStore, logger = console } = {}) {
    super()
    if (!workspace) throw new Error('workspace est obligatoire pour le service RAG.')
    this.workspace = path.resolve(workspace)
    this.outputRoot = path.join(this.workspace, '.ide-ai', 'rag')
    this.pipeline = pipeline
    this.embeddingProvider = embeddingProvider
    this.vectorStore = vectorStore
    this.logger = logger
    this.running = false
    this.lastRun = undefined
  }

  static fromEnvironment({ workspace, env = process.env, logger = console } = {}) {
    const embeddingProvider = env.MISTRAL_API_KEY
      ? new MistralEmbeddingProvider({
          apiKey: env.MISTRAL_API_KEY,
          model: env.MISTRAL_EMBED_MODEL || 'mistral-embed',
          endpoint: env.MISTRAL_EMBED_URL || 'https://api.mistral.ai/v1/embeddings',
        })
      : undefined
    const imageDescriptor = env.VISION_API_URL && env.VISION_MODEL
      ? new OpenAICompatibleVisionProvider({
          endpoint: env.VISION_API_URL,
          model: env.VISION_MODEL,
          apiKey: env.VISION_API_KEY,
        })
      : undefined
    const vectorStore = embeddingProvider && env.QDRANT_URL
      ? new QdrantVectorStore({
          baseUrl: env.QDRANT_URL,
          apiKey: env.QDRANT_API_KEY,
          collection: env.QDRANT_COLLECTION || 'ide_open_ai_documents',
        })
      : undefined
    const pipeline = new DocumentIngestionPipeline({
      extractor: new LocalDocumentExtractor({ languages: env.OCR_LANGUAGES || 'fra+eng' }),
      imageDescriptor,
      embeddingProvider,
      vectorStore,
      logger,
    })
    return new RagWorkspaceService({ workspace, pipeline, embeddingProvider, vectorStore, logger })
  }

  status() {
    return {
      workspace: this.workspace,
      outputRoot: this.outputRoot,
      running: this.running,
      lastRun: this.lastRun,
      capabilities: {
        embeddings: Boolean(this.embeddingProvider),
        vectorSearch: Boolean(this.embeddingProvider && this.vectorStore?.search),
        preciseCitations: true,
      },
    }
  }

  async listDocuments() {
    const index = await readDocumentIndex(path.join(this.outputRoot, 'index.json'))
    return { ...index, outputRoot: this.outputRoot }
  }

  async ingestFiles(sourcePaths, { tags = [] } = {}) {
    if (this.running) throw new Error('Une ingestion RAG est déjà en cours.')
    if (!Array.isArray(sourcePaths) || sourcePaths.length === 0) throw new Error('Aucun document à ingérer.')
    if (sourcePaths.length > MAX_BATCH_FILES) throw new Error(`Maximum ${MAX_BATCH_FILES} documents par lot.`)

    const files = []
    for (const sourcePath of sourcePaths) files.push(await validateSourcePath(sourcePath))
    this.running = true
    const runId = crypto.randomUUID()
    const results = []
    const failures = []
    this.lastRun = { runId, startedAt: new Date().toISOString(), total: files.length, completed: 0, failed: 0 }
    this.emit('progress', { runId, phase: 'batch-started', total: files.length })

    try {
      for (const [index, sourcePath] of files.entries()) {
        this.emit('progress', { runId, phase: 'file-started', sourcePath, index, total: files.length })
        try {
          const result = await this.pipeline.ingest({
            sourcePath,
            outputRoot: this.outputRoot,
            tags,
            onProgress: (event) => this.emit('progress', { runId, sourcePath, index, total: files.length, ...event }),
          })
          results.push(result)
          this.lastRun.completed += 1
          this.emit('progress', { runId, phase: 'file-completed', sourcePath, index, total: files.length, result })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          failures.push({ sourcePath, error: message })
          this.lastRun.failed += 1
          this.emit('progress', { runId, phase: 'file-failed', sourcePath, index, total: files.length, error: message })
        }
      }
      this.lastRun.finishedAt = new Date().toISOString()
      this.emit('progress', { runId, phase: 'batch-completed', total: files.length, results, failures })
      return { runId, results, failures }
    } finally {
      this.running = false
    }
  }

  async search(query, { limit = 12 } = {}) {
    const value = String(query ?? '').trim()
    if (!value) return { query: value, results: [], mode: 'none' }
    const safeLimit = normalizeLimit(limit)
    const queryTokens = tokenize(value)
    const index = await readDocumentIndex(path.join(this.outputRoot, 'index.json'))
    const lexicalResults = []

    for (const entry of index.documents) {
      const { manifest } = await loadManifest(this.outputRoot, entry)
      const chunks = manifest?.chunks ?? []
      for (const chunk of chunks) {
        const citation = normalizeCitation(chunk.citation, { entry, chunk })
        const candidate = {
          documentId: entry.id,
          chunkId: chunk.id,
          chunkIndex: chunk.index,
          title: entry.title,
          tags: entry.tags ?? [],
          text: chunk.text,
          citation,
          searchText: `${entry.title ?? ''} ${(entry.tags ?? []).join(' ')} ${chunk.text ?? ''}`,
          documentPath: entry.documentPath,
          manifestPath: entry.manifestPath,
        }
        const score = lexicalScore(queryTokens, candidate)
        if (score > 0) lexicalResults.push({
          ...candidate,
          score,
          snippet: snippet(candidate.text, queryTokens),
        })
      }
    }
    lexicalResults.sort((a, b) => b.score - a.score)

    let vectorResults = []
    if (this.embeddingProvider && this.vectorStore?.search) {
      try {
        const [vector] = await this.embeddingProvider.embedBatch([value])
        vectorResults = await this.vectorStore.search(vector, { limit: Math.max(safeLimit * 2, 20) })
      } catch (error) {
        this.logger.warn?.(`Recherche vectorielle indisponible: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    const fused = reciprocalRankFusion([
      lexicalResults.slice(0, Math.max(safeLimit * 2, 20)),
      vectorResults.map((result) => {
        const citation = normalizeCitation(result.payload?.citation, {
          entry: {
            id: result.payload?.documentId,
            title: result.payload?.title,
            sourcePath: result.payload?.sourcePath,
            sourceChecksum: result.payload?.sourceChecksum,
          },
          chunk: { id: String(result.id), index: result.payload?.chunkIndex },
        })
        return {
          documentId: result.payload?.documentId,
          chunkId: String(result.id),
          chunkIndex: result.payload?.chunkIndex,
          title: result.payload?.title,
          tags: result.payload?.tags ?? [],
          text: result.payload?.text,
          snippet: snippet(result.payload?.text, queryTokens),
          citation,
          vectorScore: result.score,
        }
      }),
    ]).slice(0, safeLimit)

    return {
      query: value,
      mode: vectorResults.length > 0 ? 'hybrid' : 'lexical',
      results: fused,
    }
  }
}

export {
  MAX_BATCH_FILES,
  MAX_SEARCH_LIMIT,
  SUPPORTED_EXTENSIONS,
  formatCitationLabel,
  normalizeCitation,
  safeResolve,
  validateSourcePath,
}
