import { spawn } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

function runCommand(command, args, { timeoutMs = 180_000, cwd } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    const stdout = []
    const stderr = []
    const timeout = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`${command} a dépassé ${timeoutMs} ms.`))
    }, timeoutMs)
    child.stdout.on('data', (chunk) => stdout.push(chunk))
    child.stderr.on('data', (chunk) => stderr.push(chunk))
    child.once('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.once('close', (code) => {
      clearTimeout(timeout)
      const output = Buffer.concat(stdout).toString('utf8')
      const errorOutput = Buffer.concat(stderr).toString('utf8')
      if (code !== 0) return reject(new Error(`${command} a échoué (${code}): ${errorOutput.trim()}`))
      resolve({ stdout: output, stderr: errorOutput })
    })
  })
}

async function commandAvailable(command, versionArgs = ['--version']) {
  try {
    await runCommand(command, versionArgs, { timeoutMs: 8_000 })
    return true
  } catch {
    return false
  }
}

function mimeTypeFromExtension(extension) {
  return ({
    '.md': 'text/markdown',
    '.txt': 'text/plain',
    '.json': 'application/json',
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.tif': 'image/tiff',
    '.tiff': 'image/tiff',
  })[extension] ?? 'application/octet-stream'
}

export class LocalDocumentExtractor {
  constructor({ languages = 'fra+eng', minPdfTextChars = 120, extractPdfImages = true } = {}) {
    this.languages = languages
    this.minPdfTextChars = minPdfTextChars
    this.shouldExtractPdfImages = extractPdfImages
  }

  async extract(sourcePath) {
    const extension = path.extname(sourcePath).toLowerCase()
    const mimeType = mimeTypeFromExtension(extension)

    if (['.md', '.txt', '.json'].includes(extension)) {
      const text = await readFile(sourcePath, 'utf8')
      return { text, mimeType, pages: [], images: [], extraction: { method: 'native-text' } }
    }

    if (extension === '.pdf') return this.#extractPdf(sourcePath, mimeType)
    if (['.png', '.jpg', '.jpeg', '.webp', '.tif', '.tiff'].includes(extension)) {
      const text = await this.#ocrImage(sourcePath)
      return {
        text,
        mimeType,
        pages: [{ number: 1, text }],
        images: [{ path: sourcePath, page: 1, source: 'document' }],
        extraction: { method: 'tesseract' },
      }
    }

    throw new Error(`Format non pris en charge pour l’ingestion RAG: ${extension || 'sans extension'}`)
  }

  async #extractPdf(sourcePath, mimeType) {
    if (!(await commandAvailable('pdftotext', ['-v']))) {
      throw new Error('pdftotext est requis pour les PDF. Installe Poppler.')
    }

    let { stdout: text } = await runCommand('pdftotext', ['-layout', sourcePath, '-'])
    let method = 'pdftotext'
    const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'ide-ai-rag-'))

    try {
      if (text.trim().length < this.minPdfTextChars && await commandAvailable('ocrmypdf')) {
        const searchablePdf = path.join(temporaryDirectory, 'searchable.pdf')
        const sidecar = path.join(temporaryDirectory, 'ocr.txt')
        await runCommand('ocrmypdf', [
          '--skip-text',
          '--rotate-pages',
          '--deskew',
          '--output-type', 'pdf',
          '-l', this.languages,
          '--sidecar', sidecar,
          sourcePath,
          searchablePdf,
        ])
        const extracted = await runCommand('pdftotext', ['-layout', searchablePdf, '-'])
        const sidecarText = await readFile(sidecar, 'utf8').catch(() => '')
        text = extracted.stdout.trim().length >= sidecarText.trim().length ? extracted.stdout : sidecarText
        method = 'ocrmypdf+pdftotext'
      }

      const images = this.shouldExtractPdfImages ? await this.#extractPdfImages(sourcePath, temporaryDirectory) : []
      return {
        text,
        mimeType,
        pages: [],
        images,
        extraction: { method, languages: this.languages },
        cleanup: () => rm(temporaryDirectory, { recursive: true, force: true }),
      }
    } catch (error) {
      await rm(temporaryDirectory, { recursive: true, force: true })
      throw error
    }
  }

  async #extractPdfImages(sourcePath, temporaryDirectory) {
    if (!(await commandAvailable('pdfimages', ['-v']))) return []
    const prefix = path.join(temporaryDirectory, 'image')
    await runCommand('pdfimages', ['-png', sourcePath, prefix]).catch(() => undefined)
    const files = (await readdir(temporaryDirectory))
      .filter((file) => file.startsWith('image-') && file.endsWith('.png'))
      .sort()
    return files.map((file, index) => ({
      path: path.join(temporaryDirectory, file),
      page: undefined,
      sequence: index + 1,
      source: 'pdfimages',
    }))
  }

  async #ocrImage(sourcePath) {
    if (!(await commandAvailable('tesseract'))) {
      throw new Error('Tesseract est requis pour l’OCR des images.')
    }
    const { stdout } = await runCommand('tesseract', [sourcePath, 'stdout', '-l', this.languages])
    return stdout
  }
}

export class MistralEmbeddingProvider {
  constructor({
    apiKey,
    model = 'mistral-embed',
    endpoint = 'https://api.mistral.ai/v1/embeddings',
    fetchImpl = fetch,
    timeoutMs = 60_000,
  } = {}) {
    if (!apiKey) throw new Error('MISTRAL_API_KEY est obligatoire pour les embeddings Mistral.')
    this.apiKey = apiKey
    this.model = model
    this.endpoint = endpoint
    this.fetchImpl = fetchImpl
    this.timeoutMs = timeoutMs
  }

  async embedBatch(texts) {
    if (!Array.isArray(texts) || texts.length === 0) return []
    const response = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({ model: this.model, input: texts }),
      signal: AbortSignal.timeout(this.timeoutMs),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.message ?? `Embeddings Mistral: HTTP ${response.status}`)
    return [...(payload.data ?? [])].sort((a, b) => a.index - b.index).map((entry) => entry.embedding)
  }
}

export class OpenAICompatibleVisionProvider {
  constructor({ endpoint, model, apiKey, fetchImpl = fetch, timeoutMs = 90_000 } = {}) {
    if (!endpoint) throw new Error('VISION_API_URL est obligatoire pour la description d’images.')
    if (!model) throw new Error('VISION_MODEL est obligatoire pour la description d’images.')
    this.endpoint = endpoint
    this.model = model
    this.apiKey = apiKey
    this.fetchImpl = fetchImpl
    this.timeoutMs = timeoutMs
  }

  async describe(imagePath, { language = 'fr' } = {}) {
    const extension = path.extname(imagePath).slice(1).toLowerCase() || 'png'
    const mime = extension === 'jpg' ? 'image/jpeg' : `image/${extension}`
    const image = await readFile(imagePath)
    const headers = { 'content-type': 'application/json', accept: 'application/json' }
    if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`
    const prompt = language === 'fr'
      ? 'Décris précisément cette image pour un système RAG. Indique les objets, textes visibles, diagrammes, relations, valeurs et contexte. N’invente rien.'
      : 'Describe this image precisely for a RAG system. Include objects, visible text, diagrams, relationships, values, and context. Do not invent.'
    const response = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: this.model,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${mime};base64,${image.toString('base64')}` } },
          ],
        }],
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.message ?? `Vision: HTTP ${response.status}`)
    return payload.choices?.[0]?.message?.content ?? ''
  }
}

export class QdrantVectorStore {
  constructor({
    baseUrl = 'http://127.0.0.1:6333',
    collection = 'ide_open_ai_documents',
    apiKey,
    distance = 'Cosine',
    fetchImpl = fetch,
    timeoutMs = 30_000,
  } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.collection = collection
    this.apiKey = apiKey
    this.distance = distance
    this.fetchImpl = fetchImpl
    this.timeoutMs = timeoutMs
  }

  #headers() {
    return {
      'content-type': 'application/json',
      accept: 'application/json',
      ...(this.apiKey ? { 'api-key': this.apiKey } : {}),
    }
  }

  async ensureCollection(vectorSize) {
    const url = `${this.baseUrl}/collections/${encodeURIComponent(this.collection)}`
    const existing = await this.fetchImpl(url, {
      headers: this.#headers(),
      signal: AbortSignal.timeout(this.timeoutMs),
    })
    if (existing.ok) return
    if (existing.status !== 404) throw new Error(`Qdrant collection: HTTP ${existing.status}`)
    const created = await this.fetchImpl(url, {
      method: 'PUT',
      headers: this.#headers(),
      body: JSON.stringify({ vectors: { size: vectorSize, distance: this.distance } }),
      signal: AbortSignal.timeout(this.timeoutMs),
    })
    if (!created.ok) throw new Error(`Création collection Qdrant: HTTP ${created.status}`)
  }

  async search(vector, { limit = 20, filter } = {}) {
    if (!Array.isArray(vector) || vector.length === 0) return []
    const response = await this.fetchImpl(`${this.baseUrl}/collections/${encodeURIComponent(this.collection)}/points/search`, {
      method: 'POST',
      headers: this.#headers(),
      body: JSON.stringify({
        vector,
        limit,
        with_payload: true,
        with_vector: false,
        ...(filter ? { filter } : {}),
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.status?.error ?? `Recherche Qdrant: HTTP ${response.status}`)
    return payload.result ?? []
  }

  async upsert({ document, chunks, vectors }) {
    if (vectors.length !== chunks.length) throw new Error('Le nombre de vecteurs ne correspond pas aux chunks.')
    if (vectors.length === 0) return { status: 'skipped', pointIds: [] }
    await this.ensureCollection(vectors[0].length)
    const points = chunks.map((chunk, index) => ({
      id: chunk.id,
      vector: vectors[index],
      payload: {
        documentId: document.id,
        sourcePath: document.sourcePath,
        title: document.title,
        mimeType: document.mimeType,
        tags: document.tags,
        chunkIndex: chunk.index,
        text: chunk.text,
        checksum: chunk.checksum,
      },
    }))
    const response = await this.fetchImpl(`${this.baseUrl}/collections/${encodeURIComponent(this.collection)}/points?wait=true`, {
      method: 'PUT',
      headers: this.#headers(),
      body: JSON.stringify({ points }),
      signal: AbortSignal.timeout(this.timeoutMs),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.status?.error ?? `Upsert Qdrant: HTTP ${response.status}`)
    return { status: 'indexed', pointIds: points.map((point) => point.id), collection: this.collection }
  }
}
