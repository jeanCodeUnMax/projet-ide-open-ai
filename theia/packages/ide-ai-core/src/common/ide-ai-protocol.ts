export type ServiceState = 'ready' | 'degraded' | 'offline' | 'disabled';

export interface ServiceHealth {
  state: ServiceState;
  message: string;
  checkedAt: string;
}

export interface WorkspaceContext {
  uri?: string;
  name?: string;
}

export interface IdeContextSnapshot {
  workspace: WorkspaceContext;
  editors: readonly string[];
  diagnostics: {
    errors: number;
    warnings: number;
  };
  capabilities: readonly string[];
  generatedAt: string;
}

export interface OpenFoxStatus extends ServiceHealth {
  baseUrl: string;
  version?: string;
  managed: boolean;
  pid?: number;
  port?: number;
  workspace?: string;
  logsTail?: string;
}

export interface SecurityStatus extends ServiceHealth {
  mode: 'warn' | 'protected' | 'strict';
  gateEnabled: boolean;
}

export interface MigrationStatus extends ServiceHealth {
  schemaVersion: number;
  exportSupported: boolean;
  importSupported: boolean;
}

export interface YfastosStatus extends ServiceHealth {
  configured: boolean;
  endpoint?: string;
}

export const ideContextServicePath = '/services/ide-ai/context';
export const IdeContextService = Symbol('IdeContextService');
export interface IdeContextService {
  snapshot(): Promise<IdeContextSnapshot>;
}

export const openFoxBridgeServicePath = '/services/ide-ai/openfox';
export const OpenFoxBridgeService = Symbol('OpenFoxBridgeService');
export interface OpenFoxBridgeService {
  status(): Promise<OpenFoxStatus>;
  start(): Promise<OpenFoxStatus>;
  restart(): Promise<OpenFoxStatus>;
  stop(): Promise<OpenFoxStatus>;
}

export const securityBridgeServicePath = '/services/ide-ai/security';
export const SecurityBridgeService = Symbol('SecurityBridgeService');
export interface SecurityBridgeService {
  status(): Promise<SecurityStatus>;
}

export const migrationServicePath = '/services/ide-ai/migration';
export const MigrationService = Symbol('MigrationService');
export interface MigrationService {
  status(): Promise<MigrationStatus>;
}

export const yfastosBridgeServicePath = '/services/ide-ai/yfastos';
export const YfastosBridgeService = Symbol('YfastosBridgeService');
export interface YfastosBridgeService {
  status(): Promise<YfastosStatus>;
}
