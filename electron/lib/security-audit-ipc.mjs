import { app, ipcMain } from 'electron'
import { createRuntimePaths } from './runtime-paths.mjs'
import { loadDesktopSettings } from './config-store.mjs'
import { resolveWorkspaceDirectory } from './workspace-explorer.mjs'
import { auditWorkspaceSecurity } from './workspace-security-policy.mjs'

let registered = false
let latestReport

async function resolveAuditWorkspace(requestedWorkspace) {
  const paths = createRuntimePaths(app.getPath('userData'))
  const settings = await loadDesktopSettings(paths)
  const candidate = typeof requestedWorkspace === 'string' && requestedWorkspace.trim() !== ''
    ? requestedWorkspace
    : settings.workspace || process.cwd()
  const workspace = await resolveWorkspaceDirectory(candidate)
  return { workspace, paths }
}

export async function runDesktopSecurityAudit({ workspace, strict = false } = {}) {
  const resolved = await resolveAuditWorkspace(workspace)
  latestReport = await auditWorkspaceSecurity(resolved.workspace, {
    mode: strict ? 'strict' : 'warn',
    additionalFiles: [resolved.paths.configPath, resolved.paths.canonicalMcpPath],
  })
  return structuredClone(latestReport)
}

export function registerSecurityAuditIpc() {
  if (registered) return
  registered = true

  ipcMain.handle('security:audit-workspace', async (_event, payload = {}) => {
    if (payload !== undefined && (typeof payload !== 'object' || Array.isArray(payload))) {
      throw new Error('Demande d’audit de sécurité invalide.')
    }
    return runDesktopSecurityAudit(payload ?? {})
  })

  ipcMain.handle('security:latest', () => latestReport ? structuredClone(latestReport) : undefined)
}
