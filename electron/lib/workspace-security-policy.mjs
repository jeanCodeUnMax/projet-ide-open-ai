import path from 'node:path'
import { readFile } from 'node:fs/promises'
import {
  auditWorkspaceSecurity as runRawAudit,
  formatSecurityAuditSummary,
} from './workspace-security-auditor.mjs'

const SEVERITIES = ['info', 'low', 'medium', 'high', 'critical']
const SEVERITY_RANK = new Map(SEVERITIES.map((severity, index) => [severity, index]))
const PLACEHOLDER = /^(?:|your[_-]?(?:key|token|secret)(?:[_-]here)?|example|sample|placeholder|changeme|replace[_-]?me|dummy|test[_-]?(?:key|token)|x+|<[^>]+>|\$\{[^}]+\})$/i

function portable(value) {
  return String(value ?? '').replace(/\\/g, '/')
}

function isTestFixture(file) {
  const normalized = portable(file).toLowerCase()
  const basename = path.posix.basename(normalized)
  return normalized.startsWith('tests/')
    || normalized.includes('/tests/')
    || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(basename)
    || normalized.includes('/__fixtures__/')
    || normalized.includes('/fixtures/')
}

function isExampleFile(file) {
  const normalized = portable(file).toLowerCase()
  const basename = path.posix.basename(normalized)
  return basename.includes('.example')
    || basename.startsWith('example.')
    || normalized.includes('/examples/')
    || normalized.includes('/example/')
}

function isDocumentation(file) {
  return /\.(?:md|mdc|rst|adoc|txt)$/i.test(portable(file))
}

async function readFindingLine(report, finding) {
  if (!finding.line || String(finding.file).startsWith('[IDE config]/')) return undefined
  const target = path.resolve(report.workspace, ...portable(finding.file).split('/'))
  const relative = path.relative(report.workspace, target)
  if (relative.startsWith('..') || path.isAbsolute(relative)) return undefined
  try {
    const content = await readFile(target, 'utf8')
    return content.split(/\r?\n/)[finding.line - 1]
  } catch {
    return undefined
  }
}

function assignmentValueOnSameLine(line) {
  if (typeof line !== 'string') return undefined
  const match = line.match(/\b(?:OPENAI_API_KEY|ANTHROPIC_API_KEY|MISTRAL_API_KEY|GOOGLE_API_KEY|GEMINI_API_KEY|GITHUB_TOKEN|GH_TOKEN|HUGGINGFACE_TOKEN|HF_TOKEN|GROQ_API_KEY|REPLICATE_API_TOKEN|PINECONE_API_KEY|QDRANT_API_KEY|AWS_SECRET_ACCESS_KEY)\b\s*[:=]\s*["']?([^\s"'#;,]*)/i)
  return match?.[1]
}

function contextualFinding(finding, { testFixture, exampleFile, documentation }) {
  if (testFixture) {
    return {
      ...finding,
      severity: 'info',
      category: 'test-fixture',
      message: `${finding.message} Détection située dans un test ou une fixture volontairement hostile.`,
      remediation: 'Conserver la fixture isolée et vérifier qu’elle ne peut pas être chargée comme configuration de production.',
    }
  }

  if (exampleFile && finding.ruleId.startsWith('mcp.')) {
    return {
      ...finding,
      severity: 'info',
      category: 'example',
      message: `${finding.message} Détection située dans un fichier d’exemple.`,
      remediation: 'Garder un avertissement explicite dans l’exemple et ne jamais l’activer sans épinglage, vérification et configuration sécurisée.',
    }
  }

  if (documentation && finding.ruleId.startsWith('secret.')) {
    return {
      ...finding,
      severity: 'medium',
      category: 'documentation',
      message: `${finding.message} La valeur apparaît dans une documentation et doit être vérifiée comme exemple ou secret historique.`,
      remediation: 'Remplacer toute valeur réaliste par un placeholder manifestement fictif et révoquer la clé seulement si elle a réellement existé.',
    }
  }

  return finding
}

function summarize(findings, originalSummary, mode) {
  const counts = Object.fromEntries(SEVERITIES.map((severity) => [severity, 0]))
  for (const finding of findings) counts[finding.severity] += 1
  const riskLevel = [...findings]
    .sort((a, b) => SEVERITY_RANK.get(b.severity) - SEVERITY_RANK.get(a.severity))[0]?.severity ?? 'info'
  return {
    ...originalSummary,
    riskLevel,
    counts,
    totalFindings: findings.length,
    contextualized: true,
    mode,
  }
}

export async function auditWorkspaceSecurity(workspace, options = {}) {
  const mode = options.mode === 'strict' || (!options.mode && process.env.OPENAI_IDE_SECURITY_MODE === 'strict')
    ? 'strict'
    : 'warn'
  const report = await runRawAudit(workspace, { ...options, mode })
  const findings = []

  for (const finding of report.findings) {
    const line = await readFindingLine(report, finding)
    if (finding.ruleId === 'secret.known-secret-assignment') {
      const value = assignmentValueOnSameLine(line)
      if (value !== undefined && PLACEHOLDER.test(value.trim())) continue
    }

    findings.push(contextualFinding(finding, {
      testFixture: isTestFixture(finding.file),
      exampleFile: isExampleFile(finding.file),
      documentation: isDocumentation(finding.file),
    }))
  }

  findings.sort((a, b) => {
    const severity = SEVERITY_RANK.get(b.severity) - SEVERITY_RANK.get(a.severity)
    return severity || a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0)
  })

  const summary = summarize(findings, report.summary, mode)
  return {
    ...report,
    mode,
    findings,
    summary,
    blocked: mode === 'strict' && summary.counts.critical > 0,
  }
}

export function assertSecurityAuditAllowed(report) {
  if (!report?.blocked) return report
  const error = new Error(
    `Activation refusée par la politique de sécurité stricte : ${report.summary.counts.critical} constat(s) critique(s) réel(s). Lance npm run security:audit pour le détail.`,
  )
  error.code = 'WORKSPACE_SECURITY_BLOCKED'
  error.report = report
  throw error
}

export { formatSecurityAuditSummary }
