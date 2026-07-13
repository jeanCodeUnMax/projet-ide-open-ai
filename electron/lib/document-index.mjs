import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const DOCUMENT_INDEX_VERSION = '1.0.0'

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

export async function sha256File(filePath) {
  return sha256(await readFile(filePath))
}

export function createEmptyDocumentIndex() {
  return {
    schemaVersion: DOCUMENT_INDEX_VERSION,
    generatedAt: new Date(0).toISOString(),
    documents: [],
  }
}

export function normalizeDocumentIndex(value) {
  const source = value && typeof value === 'object' ? value : {}
  const documents = Array.isArray(source.documents) ? source.documents : []
  return {
    schemaVersion: DOCUMENT_INDEX_VERSION,
    generatedAt: typeof source.generatedAt === 'string' ? source.generatedAt : new Date(0).toISOString(),
    documents: documents
      .filter((item) => item && typeof item === 'object' && typeof item.id === 'string')
      .map((item) => structuredClone(item))
      .sort((a, b) => a.id.localeCompare(b.id)),
  }
}

export async function readDocumentIndex(indexPath) {
  try {
    return normalizeDocumentIndex(JSON.parse(await readFile(indexPath, 'utf8')))
  } catch {
    return createEmptyDocumentIndex()
  }
}

export function upsertDocumentIndexEntry(index, entry) {
  if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string' || entry.id.trim() === '') {
    throw new Error('Une entrée d’index documentaire doit avoir un id.')
  }
  const normalized = normalizeDocumentIndex(index)
  const nextDocuments = normalized.documents.filter((document) => document.id !== entry.id)
  nextDocuments.push(structuredClone(entry))
  nextDocuments.sort((a, b) => a.id.localeCompare(b.id))
  return {
    schemaVersion: DOCUMENT_INDEX_VERSION,
    generatedAt: new Date().toISOString(),
    documents: nextDocuments,
  }
}

export async function writeDocumentIndex(indexPath, index) {
  await mkdir(path.dirname(indexPath), { recursive: true })
  const temporaryPath = `${indexPath}.${process.pid}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(normalizeDocumentIndex(index), null, 2)}\n`, 'utf8')
  await rename(temporaryPath, indexPath)
}

export function renderDocumentIndexMarkdown(index) {
  const normalized = normalizeDocumentIndex(index)
  const lines = [
    '# Index documentaire RAG',
    '',
    `Généré le : ${normalized.generatedAt}`,
    '',
    '| Document | Type | Tags | Chunks | Images | Statut embeddings |',
    '|---|---|---|---:|---:|---|',
  ]
  for (const document of normalized.documents) {
    lines.push(`| ${document.title ?? document.id} | ${document.mimeType ?? ''} | ${(document.tags ?? []).join(', ')} | ${document.chunkCount ?? 0} | ${document.imageCount ?? 0} | ${document.embedding?.status ?? 'unknown'} |`)
  }
  lines.push('')
  return `${lines.join('\n')}\n`
}
