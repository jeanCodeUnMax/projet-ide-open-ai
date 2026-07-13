import path from 'node:path'
import process from 'node:process'
import { DocumentIngestionPipeline } from '../electron/lib/rag-pipeline.mjs'
import {
  LocalDocumentExtractor,
  MistralEmbeddingProvider,
  OpenAICompatibleVisionProvider,
  QdrantVectorStore,
} from '../electron/lib/rag-providers.mjs'

function parseArguments(argv) {
  const result = { sourcePath: undefined, workspace: process.cwd(), tags: [] }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--workspace') result.workspace = argv[++index]
    else if (value === '--tag') result.tags.push(argv[++index])
    else if (!result.sourcePath) result.sourcePath = value
    else throw new Error(`Argument inconnu: ${value}`)
  }
  if (!result.sourcePath) {
    throw new Error('Usage: npm run rag:ingest -- <fichier> [--workspace <dossier>] [--tag <tag>]')
  }
  return result
}

const args = parseArguments(process.argv.slice(2))
const embeddingProvider = process.env.MISTRAL_API_KEY
  ? new MistralEmbeddingProvider({
      apiKey: process.env.MISTRAL_API_KEY,
      model: process.env.MISTRAL_EMBED_MODEL || 'mistral-embed',
      endpoint: process.env.MISTRAL_EMBED_URL || 'https://api.mistral.ai/v1/embeddings',
    })
  : undefined

const imageDescriptor = process.env.VISION_API_URL && process.env.VISION_MODEL
  ? new OpenAICompatibleVisionProvider({
      endpoint: process.env.VISION_API_URL,
      model: process.env.VISION_MODEL,
      apiKey: process.env.VISION_API_KEY,
    })
  : undefined

const vectorStore = embeddingProvider && process.env.QDRANT_URL
  ? new QdrantVectorStore({
      baseUrl: process.env.QDRANT_URL,
      apiKey: process.env.QDRANT_API_KEY,
      collection: process.env.QDRANT_COLLECTION || 'ide_open_ai_documents',
    })
  : undefined

const pipeline = new DocumentIngestionPipeline({
  extractor: new LocalDocumentExtractor({
    languages: process.env.OCR_LANGUAGES || 'fra+eng',
  }),
  imageDescriptor,
  embeddingProvider,
  vectorStore,
})

const result = await pipeline.ingest({
  sourcePath: path.resolve(args.sourcePath),
  outputRoot: path.resolve(args.workspace, '.ide-ai', 'rag'),
  tags: args.tags,
})

console.log(JSON.stringify(result, null, 2))
