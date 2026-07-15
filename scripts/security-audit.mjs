#!/usr/bin/env node

import path from 'node:path'
import process from 'node:process'
import {
  auditWorkspaceSecurity,
  formatSecurityAuditSummary,
} from '../electron/lib/workspace-security-policy.mjs'

function parseArguments(argv) {
  const options = { json: false, strict: false, workspace: undefined }
  for (const argument of argv) {
    if (argument === '--json') options.json = true
    else if (argument === '--strict') options.strict = true
    else if (!argument.startsWith('-') && !options.workspace) options.workspace = argument
  }
  return options
}

const options = parseArguments(process.argv.slice(2))
const workspace = path.resolve(options.workspace ?? process.cwd())
const report = await auditWorkspaceSecurity(workspace, {
  mode: options.strict ? 'strict' : 'warn',
})

if (options.json) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
} else {
  process.stdout.write(`Audit sécurité IDE-AI\nWorkspace : ${report.workspace}\n${formatSecurityAuditSummary(report)}\n`)
  if (report.findings.length === 0) {
    process.stdout.write('\nAucun constat détecté par les règles locales.\n')
  } else {
    for (const finding of report.findings) {
      const location = finding.line ? `${finding.file}:${finding.line}` : finding.file
      process.stdout.write(`\n[${finding.severity.toUpperCase()}] ${finding.ruleId}\n`)
      process.stdout.write(`  ${location}\n`)
      process.stdout.write(`  ${finding.message}\n`)
      process.stdout.write(`  Correction : ${finding.remediation}\n`)
    }
  }
}

if (report.blocked) process.exitCode = 2
