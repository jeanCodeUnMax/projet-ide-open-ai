import { inject, injectable } from '@theia/core/shared/inversify';
import { WorkspaceServer } from '@theia/workspace/lib/common/workspace-protocol';
import {
  IdeContextService,
  IdeContextSnapshot,
  MigrationService,
  MigrationStatus,
  OpenFoxBridgeService,
  OpenFoxStatus,
  SecurityBridgeService,
  SecurityStatus,
  ServiceHealth,
  YfastosBridgeService,
  YfastosStatus,
} from '../common/ide-ai-protocol';

const now = (): string => new Date().toISOString();

async function probe(url: string): Promise<ServiceHealth & { payload?: unknown }> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
    if (!response.ok) {
      return { state: 'degraded', message: `HTTP ${response.status}`, checkedAt: now() };
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = undefined;
    }
    return { state: 'ready', message: 'Service disponible', checkedAt: now(), payload };
  } catch (error) {
    return {
      state: 'offline',
      message: error instanceof Error ? error.message : String(error),
      checkedAt: now(),
    };
  }
}

@injectable()
export class IdeContextServiceImpl implements IdeContextService {
  @inject(WorkspaceServer)
  protected readonly workspaceServer!: WorkspaceServer;

  async snapshot(): Promise<IdeContextSnapshot> {
    const uri = await this.workspaceServer.getMostRecentlyUsedWorkspace();
    const portable = uri?.replace(/\\/g, '/').replace(/\/$/, '');
    const name = portable?.split('/').pop();
    return {
      workspace: { uri, name },
      editors: [],
      diagnostics: { errors: 0, warnings: 0 },
      capabilities: ['workspace', 'filesystem', 'editor', 'terminal', 'tasks', 'scm', 'debug', 'mini-browser', 'mcp'],
      generatedAt: now(),
    };
  }
}

@injectable()
export class OpenFoxBridgeServiceImpl implements OpenFoxBridgeService {
  async status(): Promise<OpenFoxStatus> {
    const baseUrl = (process.env.IDE_AI_OPENFOX_URL || 'http://127.0.0.1:10369').replace(/\/$/, '');
    const health = await probe(`${baseUrl}/api/health`);
    const payload = health.payload as { version?: string } | undefined;
    return { state: health.state, message: health.message, checkedAt: health.checkedAt, baseUrl, version: payload?.version };
  }
}

@injectable()
export class SecurityBridgeServiceImpl implements SecurityBridgeService {
  async status(): Promise<SecurityStatus> {
    const requested = String(process.env.IDE_AI_SECURITY_MODE || 'protected').toLowerCase();
    const mode: SecurityStatus['mode'] = requested === 'strict' ? 'strict' : requested === 'warn' ? 'warn' : 'protected';
    return { state: 'ready', message: `Politique ${mode}`, checkedAt: now(), mode, gateEnabled: mode !== 'warn' };
  }
}

@injectable()
export class MigrationServiceImpl implements MigrationService {
  async status(): Promise<MigrationStatus> {
    return {
      state: 'degraded',
      message: 'Contrat prêt, import/export à porter depuis le shell Electron',
      checkedAt: now(),
      schemaVersion: 1,
      exportSupported: false,
      importSupported: false,
    };
  }
}

@injectable()
export class YfastosBridgeServiceImpl implements YfastosBridgeService {
  async status(): Promise<YfastosStatus> {
    const endpoint = process.env.IDE_AI_YFASTOS_URL?.trim();
    if (!endpoint) {
      return {
        state: 'disabled',
        message: 'Contrat disponible, endpoint non configuré',
        checkedAt: now(),
        configured: false,
      };
    }
    const health = await probe(`${endpoint.replace(/\/$/, '')}/health`);
    return {
      state: health.state,
      message: health.message,
      checkedAt: health.checkedAt,
      configured: true,
      endpoint,
    };
  }
}
