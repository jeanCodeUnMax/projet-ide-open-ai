import crypto from 'node:crypto'
import path from 'node:path'
import { lstat, readdir, readFile } from 'node:fs/promises'

const SEVERITIES = Object.freeze(['info', 'low', 'medium', 'high', 'critical'])
const SEVERITY_RANK = new Map(SEVERITIES.map((severity, index) => [severity, index]))
const DEFAULT_IGNORED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'build',
  'release',
  'coverage',
  '.cache',
  '.next',
  '.nuxt',
  '.turbo',
  '.parcel-cache',
  '__pycache__',
  '.pytest_cache',
  '.venv',
  'venv',
])
const TEXT_EXTENSIONS = new Set([
  '', '.c', '.cc', '.cfg', '.conf', '.cpp', '.cs', '.css', '.env', '.go', '.h', '.hpp', '.html', '.ini',
  '.java', '.js', '.json', '.jsonc', '.jsx', '.mjs', '.cjs', '.md', '.mdc', '.php', '.properties', '.ps1',
  '.py', '.rb', '.rs', '.sh', '.sql', '.toml', '.ts', '.tsx', '.txt', '.xml', '.yaml', '.yml', '.zsh',
])
const INSTRUCTION_FILES = new Set([
  'agents.md', 'claude.md', 'gemini.md', 'rules.md', '.cursorrules', '.windsurfrules',
  'copilot-instructions.md', 'instructions.md',
])
const SENSITIVE_ENV_NAMES = /(?:API_KEY|ACCESS_KEY|SECRET|TOKEN|PASSWORD|PRIVATE_KEY|CLIENT_SECRET)$/i
const PLACEHOLDER_PATTERN = /(?:your[_-]?(?:key|token|secret)|example|sample|placeholder|changeme|replace[_-]?me|dummy|test[_-]?(?:key|token)|xxx+|<[^>]+>|\$\{|process\.env|env:)/i
const HIDDEN_UNICODE_PATTERN = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g
const PUBLIC_BIND_PATTERN = /(?:OLLAMA_HOST|OPENFOX_HOST|HOST|BIND|LISTEN(?:_ADDRESS)?)\s*["']?\s*[:=]\s*["']?(?:0\.0\.0\.0|\[?::\]?)(?::\d+)?/gi
const PUBLIC_HOST_ARGUMENT_PATTERN = /--(?:host|bind|listen(?:-address)?)\s+(?:0\.0\.0\.0|\[?::\]?)(?::\d+)?/gi
const AUTO_APPROVE_PATTERN = /(?:chat\.tools\.autoApprove|autoApprove|auto_approve|yolo(?:Mode)?|dangerouslySkipPermissions)["']?\s*[:=]\s*true/gi
const SUSPICIOUS_INSTRUCTION_PATTERNS = [
  /ignore\s+(?:all\s+)?(?:previous|prior|system|developer)\s+instructions?/i,
  /(?:read|open|collect|extract).{0,80}(?:\.env|api[_ -]?key|credentials?|tokens?|private[_ -]?key)/i,
  /(?:send|upload|post|exfiltrat|transmit).{0,100}(?:secret|credential|token|key|source code|workspace|https?:\/\/)/i,
  /(?:disable|bypass|turn off).{0,60}(?:security|sandbox|approval|confirmation|guardrail|permission)/i,
  /(?:do not|never)\s+(?:tell|show|inform|mention).{0,60}(?:user|operator|developer)/i,
  /(?:powershell|cmd\.exe|bash|sh)\s+-(?:c|command|encodedcommand)|curl\s+[^\n|]+\|\s*(?:sh|bash)|wget\s+[^\n|]+\|\s*(?:sh|bash)/i,
]
const DANGEROUS_COMMAND_PATTERN = /(?:powershell(?:\.exe)?\s+-(?:enc|encodedcommand)|cmd(?:\.exe)?\s+\/c|curl\s+[^|]+\|\s*(?:sh|bash)|wget\s+[^|]+\|\s*(?:sh|bash)|(?:bash|sh)\s+-c\s+.*(?:curl|wget)|certutil\s+-urlcache|bitsadmin\s+\/transfer)/i
const SECRET_PATTERNS = [
  { id: 'openai-key', pattern: /\bsk-(?:proj|svcacct)-[A-Za-z0-9_-]{20,}\b/g },
  { id: 'anthropic-key', pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  { id: 'github-token', pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g },
  { id: 'google-api-key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { id: 'aws-access-key', pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  {
    id: 'known-secret-assignment',
    pattern: /\b(?:OPENAI_API_KEY|ANTHROPIC_API_KEY|MISTRAL_API_KEY|GOOGLE_API_KEY|GEMINI_API_KEY|GITHUB_TOKEN|GH_TOKEN|HUGGINGFACE_TOKEN|HF_TOKEN|GROQ_API_KEY|REPLICATE_API_TOKEN|PINECONE_API_KEY|QDRANT_API_KEY|AWS_SECRET_ACCESS_KEY)\b\s*[:=]\s*["']?([^\s"'#;,]{12,})/gi,
    capture: 1,
  },
]

function portablePath(value) {
  return String(value).split(path.sep).join('/')
}

function lineNumberAt(content, index) {
  let line = 1
  for (let cursor = 0; cursor < index; cursor += 1) if (content.charCodeAt(cursor) === 10) line += 1
  return line
}

function findingFingerprint(finding) {
  return crypto
    .createHash('sha256')
    .update([finding.ruleId, finding.file, finding.line ?? '', finding.message].join('|'))
    .digest('hex')
    .slice(0, 16)
}

function createFinding({ ruleId, severity, category, file, line, message, remediation }) {
  const finding = { ruleId, severity, category, file, line, message, remediation }
  return { ...finding, fingerprint: findingFingerprint(finding) }
}

function isPlaceholder(value) {
  const normalized = String(value ?? '').trim()
  return normalized.length < 12 || PLACEHOLDER_PATTERN.test(normalized)
}

function isLoopbackHostname(hostname) {
  const normalized = String(hostname ?? '').replace(/^\[|\]$/g, '').toLowerCase()
  return normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '::1'
}

function isInstructionSurface(relativePath) {
  const normalized = portablePath(relativePath).toLowerCase()
  const basename = path.posix.basename(normalized)
  return INSTRUCTION_FILES.has(basename)
    || normalized.includes('/.cursor/rules/')
    || normalized.includes('/.github/instructions/')
    || normalized.endsWith('/.github/copilot-instructions.md')
    || normalized.includes('/.openfox/agents/')
}

function isTextCandidate(relativePath) {
  const normalized = portablePath(relativePath).toLowerCase()
  const basename = path.posix.basename(normalized)
  if (basename.startsWith('.env')) return true
  if (INSTRUCTION_FILES.has(basename)) return true
  return TEXT_EXTENSIONS.has(path.posix.extname(normalized))
}

function packageSpecIsPinned(spec) {
  const value = String(spec ?? '').trim()
  if (!value || value.startsWith('-') || value.startsWith('.') || value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value)) return true
  if (/^(?:https?|git\+|file):/i.test(value)) return true
  if (value.startsWith('@')) {
    const slash = value.indexOf('/')
    return slash > 1 && value.indexOf('@', slash) > slash
  }
  return value.lastIndexOf('@') > 0
}

function mcpPackageArgument(command, args = []) {
  const executable = path.basename(String(command ?? '')).toLowerCase().replace(/\.cmd$|\.exe$/g, '')
  const values = Array.isArray(args) ? args.map(String) : []
  if (executable === 'npx') return values.find((item) => !item.startsWith('-'))
  if (executable === 'npm' && values[0] === 'exec') return values.slice(1).find((item) => !item.startsWith('-'))
  return undefined
}

function addPatternFindings(content, file, findings) {
  for (const secret of SECRET_PATTERNS) {
    secret.pattern.lastIndex = 0
    let match
    while ((match = secret.pattern.exec(content)) !== null) {
      const candidate = match[secret.capture ?? 0]
      if (isPlaceholder(candidate)) continue
      findings.push(createFinding({
        ruleId: `secret.${secret.id}`,
        severity: 'critical',
        category: 'secrets',
        file,
        line: lineNumberAt(content, match.index),
        message: 'Secret ou identifiant sensible probablement stocké en clair. La valeur a été volontairement masquée.',
        remediation: 'Révoquer la valeur si elle a été exposée, la retirer du fichier et utiliser une variable ${env:NOM}.',
      }))
    }
  }

  for (const pattern of [PUBLIC_BIND_PATTERN, PUBLIC_HOST_ARGUMENT_PATTERN]) {
    pattern.lastIndex = 0
    let match
    while ((match = pattern.exec(content)) !== null) {
      findings.push(createFinding({
        ruleId: 'network.public-bind',
        severity: 'critical',
        category: 'network',
        file,
        line: lineNumberAt(content, match.index),
        message: 'Une configuration semble écouter sur toutes les interfaces réseau.',
        remediation: 'Forcer 127.0.0.1 ou ::1 et placer toute exposition distante derrière une authentification et un proxy correctement configuré.',
      }))
    }
  }

  AUTO_APPROVE_PATTERN.lastIndex = 0
  let approvalMatch
  while ((approvalMatch = AUTO_APPROVE_PATTERN.exec(content)) !== null) {
    findings.push(createFinding({
      ruleId: 'agent.auto-approve',
      severity: 'high',
      category: 'agent-policy',
      file,
      line: lineNumberAt(content, approvalMatch.index),
      message: 'Un réglage semble autoriser automatiquement des outils ou contourner les confirmations.',
      remediation: 'Désactiver l’auto-approbation globale et limiter explicitement les outils autorisés par agent.',
    }))
  }
}

function addInstructionFindings(content, file, findings) {
  if (!isInstructionSurface(file)) return

  HIDDEN_UNICODE_PATTERN.lastIndex = 0
  let hidden
  while ((hidden = HIDDEN_UNICODE_PATTERN.exec(content)) !== null) {
    findings.push(createFinding({
      ruleId: 'prompt.hidden-unicode',
      severity: 'high',
      category: 'prompt-injection',
      file,
      line: lineNumberAt(content, hidden.index),
      message: 'Le fichier d’instructions contient un caractère Unicode invisible ou bidirectionnel.',
      remediation: 'Afficher les caractères invisibles, vérifier la ligne puis supprimer tout caractère non justifié.',
    }))
  }

  for (const pattern of SUSPICIOUS_INSTRUCTION_PATTERNS) {
    const match = pattern.exec(content)
    if (!match) continue
    findings.push(createFinding({
      ruleId: 'prompt.suspicious-instruction',
      severity: 'high',
      category: 'prompt-injection',
      file,
      line: lineNumberAt(content, match.index),
      message: 'Une instruction de dépôt demande une action typique d’une injection indirecte ou d’une exfiltration.',
      remediation: 'Traiter ce fichier comme non fiable, relire manuellement l’instruction et ne pas l’injecter automatiquement dans un agent doté d’outils.',
    }))
  }
}

function addPackageFindings(content, file, findings) {
  if (path.posix.basename(portablePath(file)).toLowerCase() !== 'package.json') return
  let document
  try {
    document = JSON.parse(content)
  } catch {
    return
  }
  const scripts = document?.scripts
  if (!scripts || typeof scripts !== 'object') return
  for (const name of ['preinstall', 'install', 'postinstall', 'prepare']) {
    const command = scripts[name]
    if (typeof command !== 'string' || command.trim() === '') continue
    const dangerous = DANGEROUS_COMMAND_PATTERN.test(command)
    findings.push(createFinding({
      ruleId: dangerous ? 'package.lifecycle-dangerous' : 'package.lifecycle-script',
      severity: dangerous ? 'critical' : 'medium',
      category: 'supply-chain',
      file,
      message: `Le script npm « ${name} » s’exécute automatiquement pendant certaines installations.`,
      remediation: 'Examiner le script et ses dépendances avant tout npm install. Utiliser npm install --ignore-scripts pour une première inspection.',
    }))
  }
}

function addMcpFindings(content, file, findings) {
  if (!/mcp/i.test(file) && !content.includes('"mcpServers"')) return
  let document
  try {
    document = JSON.parse(content)
  } catch {
    return
  }
  const servers = document?.mcpServers && typeof document.mcpServers === 'object'
    ? document.mcpServers
    : document
  if (!servers || typeof servers !== 'object' || Array.isArray(servers)) return

  for (const [name, config] of Object.entries(servers)) {
    if (!config || typeof config !== 'object' || Array.isArray(config)) continue
    const command = String(config.command ?? '')
    const args = Array.isArray(config.args) ? config.args.map(String) : []
    const combined = [command, ...args].join(' ')
    if (DANGEROUS_COMMAND_PATTERN.test(combined)) {
      findings.push(createFinding({
        ruleId: 'mcp.dangerous-command',
        severity: 'critical',
        category: 'mcp',
        file,
        message: `Le serveur MCP « ${name} » utilise une commande shell présentant un risque d’exécution ou de téléchargement arbitraire.`,
        remediation: 'Remplacer la commande par un exécutable local vérifié, sans shell intermédiaire ni téléchargement à l’exécution.',
      }))
    }

    const packageSpec = mcpPackageArgument(command, args)
    if (packageSpec && !packageSpecIsPinned(packageSpec)) {
      findings.push(createFinding({
        ruleId: 'mcp.unpinned-package',
        severity: 'high',
        category: 'mcp',
        file,
        message: `Le serveur MCP « ${name} » lance un paquet non épinglé via npm/npx.`,
        remediation: 'Épingler une version exacte et vérifier l’intégrité ou installer le serveur MCP localement depuis une source auditée.',
      }))
    }

    for (const sectionName of ['env', 'headers']) {
      const section = config[sectionName]
      if (!section || typeof section !== 'object' || Array.isArray(section)) continue
      for (const [key, value] of Object.entries(section)) {
        if (!SENSITIVE_ENV_NAMES.test(key) || isPlaceholder(value)) continue
        findings.push(createFinding({
          ruleId: 'mcp.literal-secret',
          severity: 'critical',
          category: 'mcp',
          file,
          message: `Le serveur MCP « ${name} » contient une valeur sensible en clair dans ${sectionName}.${key}.`,
          remediation: `Remplacer la valeur par \${env:${key}} et révoquer l’ancien secret s’il a été partagé.`,
        }))
      }
    }

    const rawUrl = config.url ?? config.serverUrl
    if (typeof rawUrl === 'string') {
      try {
        const parsed = new URL(rawUrl)
        if (!isLoopbackHostname(parsed.hostname)) {
          findings.push(createFinding({
            ruleId: parsed.protocol === 'http:' ? 'mcp.remote-plaintext' : 'mcp.remote-endpoint',
            severity: parsed.protocol === 'http:' ? 'high' : 'medium',
            category: 'mcp',
            file,
            message: `Le serveur MCP « ${name} » communique avec un endpoint distant${parsed.protocol === 'http:' ? ' sans TLS' : ''}.`,
            remediation: 'Vérifier l’identité du serveur, ses permissions, son certificat et les données transmises. Préférer HTTPS et une liste de confiance.',
          }))
        }
      } catch {
        findings.push(createFinding({
          ruleId: 'mcp.invalid-url',
          severity: 'medium',
          category: 'mcp',
          file,
          message: `Le serveur MCP « ${name} » contient une URL invalide.`,
          remediation: 'Corriger l’URL avant d’activer ce serveur.',
        }))
      }
    }
  }
}

async function collectWorkspaceFiles(root, {
  maxFiles,
  maxFileBytes,
  ignoredDirectories,
}, findings) {
  const files = []
  const queue = [{ absolute: root, relative: '' }]
  let skippedFiles = 0

  while (queue.length > 0 && files.length < maxFiles) {
    const current = queue.shift()
    let entries
    try {
      entries = await readdir(current.absolute, { withFileTypes: true })
    } catch {
      skippedFiles += 1
      continue
    }

    for (const entry of entries) {
      const relative = current.relative ? `${current.relative}/${entry.name}` : entry.name
      const absolute = path.join(current.absolute, entry.name)
      if (entry.isSymbolicLink()) {
        findings.push(createFinding({
          ruleId: 'filesystem.symlink',
          severity: 'medium',
          category: 'filesystem',
          file: portablePath(relative),
          message: 'Un lien symbolique est présent dans le workspace. Il peut pointer hors du projet pour certains outils.',
          remediation: 'Vérifier manuellement sa cible et ne pas autoriser les agents à le suivre sans confinement realpath.',
        }))
        continue
      }
      if (entry.isDirectory()) {
        if (entry.name === '.git') {
          queue.push({ absolute: path.join(absolute, 'hooks'), relative: `${relative}/hooks` })
          continue
        }
        if (ignoredDirectories.has(entry.name)) continue
        queue.push({ absolute, relative })
        continue
      }
      if (!entry.isFile() || !isTextCandidate(relative)) continue
      try {
        const details = await lstat(absolute)
        if (details.size > maxFileBytes) {
          skippedFiles += 1
          continue
        }
        files.push({ absolute, relative: portablePath(relative), size: details.size })
        if (files.length >= maxFiles) break
      } catch {
        skippedFiles += 1
      }
    }
  }

  return { files, skippedFiles, truncated: queue.length > 0 || files.length >= maxFiles }
}

function deduplicateFindings(findings) {
  const seen = new Set()
  return findings.filter((finding) => {
    if (seen.has(finding.fingerprint)) return false
    seen.add(finding.fingerprint)
    return true
  })
}

function summarize(findings, metadata) {
  const counts = Object.fromEntries(SEVERITIES.map((severity) => [severity, 0]))
  for (const finding of findings) counts[finding.severity] += 1
  const highest = [...findings].sort((a, b) => SEVERITY_RANK.get(b.severity) - SEVERITY_RANK.get(a.severity))[0]
  return {
    riskLevel: highest?.severity ?? 'info',
    counts,
    totalFindings: findings.length,
    ...metadata,
  }
}

export async function auditWorkspaceSecurity(workspace, {
  mode = process.env.OPENAI_IDE_SECURITY_MODE === 'strict' ? 'strict' : 'warn',
  maxFiles = 4_000,
  maxFileBytes = 512 * 1024,
  ignoredDirectories = DEFAULT_IGNORED_DIRECTORIES,
  additionalFiles = [],
} = {}) {
  const startedAt = Date.now()
  const root = path.resolve(String(workspace ?? ''))
  const findings = []
  const collected = await collectWorkspaceFiles(root, {
    maxFiles,
    maxFileBytes,
    ignoredDirectories: ignoredDirectories instanceof Set ? ignoredDirectories : new Set(ignoredDirectories),
  }, findings)

  const candidates = [...collected.files]
  for (const additional of additionalFiles) {
    if (typeof additional !== 'string' || additional.trim() === '') continue
    try {
      const absolute = path.resolve(additional)
      const details = await lstat(absolute)
      if (!details.isFile() || details.size > maxFileBytes) continue
      candidates.push({ absolute, relative: `[IDE config]/${path.basename(absolute)}`, size: details.size })
    } catch {
      // Optional runtime files do not always exist on first boot.
    }
  }

  let scannedBytes = 0
  for (const candidate of candidates) {
    let content
    try {
      content = await readFile(candidate.absolute, 'utf8')
    } catch {
      continue
    }
    scannedBytes += candidate.size
    addPatternFindings(content, candidate.relative, findings)
    addInstructionFindings(content, candidate.relative, findings)
    addPackageFindings(content, candidate.relative, findings)
    addMcpFindings(content, candidate.relative, findings)

    if (portablePath(candidate.relative).includes('/.git/hooks/') && !candidate.relative.endsWith('.sample')) {
      findings.push(createFinding({
        ruleId: DANGEROUS_COMMAND_PATTERN.test(content) ? 'git.hook-dangerous' : 'git.hook-active',
        severity: DANGEROUS_COMMAND_PATTERN.test(content) ? 'critical' : 'high',
        category: 'supply-chain',
        file: candidate.relative,
        message: 'Un hook Git actif peut exécuter du code lors d’une opération Git.',
        remediation: 'Auditer le hook avant tout commit, checkout, merge ou push et le désactiver s’il n’est pas explicitement approuvé.',
      }))
    }
  }

  const uniqueFindings = deduplicateFindings(findings)
  const summary = summarize(uniqueFindings, {
    mode,
    scannedFiles: candidates.length,
    scannedBytes,
    skippedFiles: collected.skippedFiles,
    truncated: collected.truncated,
    durationMs: Date.now() - startedAt,
  })
  const blocked = mode === 'strict' && summary.counts.critical > 0

  return {
    workspace: root,
    generatedAt: new Date().toISOString(),
    mode,
    blocked,
    summary,
    findings: uniqueFindings.sort((a, b) => {
      const severity = SEVERITY_RANK.get(b.severity) - SEVERITY_RANK.get(a.severity)
      return severity || a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0)
    }),
  }
}

export function assertSecurityAuditAllowed(report) {
  if (!report?.blocked) return report
  const error = new Error(
    `Activation refusée par la politique de sécurité stricte : ${report.summary.counts.critical} constat(s) critique(s). Lance npm run security:audit pour le détail.`,
  )
  error.code = 'WORKSPACE_SECURITY_BLOCKED'
  error.report = report
  throw error
}

export function formatSecurityAuditSummary(report) {
  const counts = report?.summary?.counts ?? {}
  return [
    `Risque : ${String(report?.summary?.riskLevel ?? 'inconnu').toUpperCase()}`,
    `Critiques : ${counts.critical ?? 0}`,
    `Élevés : ${counts.high ?? 0}`,
    `Moyens : ${counts.medium ?? 0}`,
    `Faibles : ${counts.low ?? 0}`,
    `Fichiers analysés : ${report?.summary?.scannedFiles ?? 0}`,
    report?.summary?.truncated ? 'Analyse limitée par les garde-fous de volume.' : '',
  ].filter(Boolean).join('\n')
}
