'use strict'

const securityApi = window.desktopAPI
const securityElements = {
  label: document.querySelector('#workspace-security'),
  button: document.querySelector('#audit-security'),
  workspacePath: document.querySelector('#workspace-path'),
  status: document.querySelector('#status-message'),
}

const SECURITY_COLORS = Object.freeze({
  info: '#3fb950',
  low: '#7ee787',
  medium: '#d29922',
  high: '#f0883e',
  critical: '#f85149',
  error: '#f85149',
  running: '#58a6ff',
})

let auditPromise

function setSecurityStatus(message) {
  if (securityElements.status) securityElements.status.textContent = message
}

function renderSecurityAudit(report) {
  const label = securityElements.label
  if (!label) return
  const summary = report?.summary
  const counts = summary?.counts ?? {}
  const level = summary?.riskLevel ?? 'info'
  const total = summary?.totalFindings ?? 0

  if (total === 0) {
    label.textContent = `Sécurité : aucun constat · ${summary?.scannedFiles ?? 0} fichier(s)`
  } else {
    const parts = [
      counts.critical ? `${counts.critical} critique(s)` : '',
      counts.high ? `${counts.high} élevé(s)` : '',
      counts.medium ? `${counts.medium} moyen(s)` : '',
    ].filter(Boolean)
    label.textContent = `Sécurité : ${parts.join(' · ') || `${total} constat(s)`}`
  }

  label.style.color = SECURITY_COLORS[level] ?? SECURITY_COLORS.info
  label.dataset.level = level
  const details = (report?.findings ?? []).slice(0, 8)
    .map((finding) => `[${finding.severity.toUpperCase()}] ${finding.file}${finding.line ? `:${finding.line}` : ''} — ${finding.message}`)
  label.title = [
    `Mode : ${report?.mode ?? 'warn'}`,
    `Risque : ${String(level).toUpperCase()}`,
    ...details,
    total > details.length ? `… ${total - details.length} autre(s) constat(s)` : '',
  ].filter(Boolean).join('\n')
}

async function auditWorkspaceSecurity({ announce = true } = {}) {
  if (auditPromise || !securityApi?.security?.auditWorkspace) return auditPromise
  const workspace = securityElements.workspacePath?.value?.trim()
  securityElements.button && (securityElements.button.disabled = true)
  if (securityElements.label) {
    securityElements.label.textContent = 'Sécurité : audit local…'
    securityElements.label.style.color = SECURITY_COLORS.running
  }
  if (announce) setSecurityStatus('Audit de sécurité local du workspace…')

  auditPromise = securityApi.security.auditWorkspace({ workspace })
    .then((report) => {
      renderSecurityAudit(report)
      if (announce) {
        setSecurityStatus(
          report.summary.totalFindings === 0
            ? 'Audit terminé : aucun constat détecté'
            : `Audit terminé : ${report.summary.totalFindings} constat(s), niveau ${report.summary.riskLevel}`,
        )
      }
      return report
    })
    .catch((error) => {
      if (securityElements.label) {
        securityElements.label.textContent = 'Sécurité : audit impossible'
        securityElements.label.style.color = SECURITY_COLORS.error
        securityElements.label.title = error instanceof Error ? error.message : String(error)
      }
      if (announce) setSecurityStatus(error instanceof Error ? error.message : String(error))
      return undefined
    })
    .finally(() => {
      auditPromise = undefined
      securityElements.button && (securityElements.button.disabled = false)
    })

  return auditPromise
}

securityElements.button?.addEventListener('click', () => void auditWorkspaceSecurity())

securityApi?.workspace?.onChanged?.((context) => {
  if (context?.rootPath && securityElements.workspacePath) securityElements.workspacePath.value = context.rootPath
  window.setTimeout(() => void auditWorkspaceSecurity({ announce: false }), 250)
})

window.setTimeout(() => void auditWorkspaceSecurity({ announce: false }), 700)
