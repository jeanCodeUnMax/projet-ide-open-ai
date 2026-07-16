import { ChildProcess, spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type ManagedOpenFoxState = 'ready' | 'degraded' | 'offline';

export interface ManagedOpenFoxSnapshot {
  state: ManagedOpenFoxState;
  message: string;
  checkedAt: string;
  baseUrl: string;
  port?: number;
  pid?: number;
  workspace?: string;
  managed: true;
  logsTail?: string;
}

interface RuntimePaths {
  configDir: string;
  dataDir: string;
  configPath: string;
  authPath: string;
  canonicalMcpPath: string;
  logPath: string;
  env: Record<string, string>;
}

const now = (): string => new Date().toISOString();
const sleep = (duration: number): Promise<void> => new Promise(resolve => setTimeout(resolve, duration));

async function readJson<T>(target: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(target, 'utf8')) as T;
  } catch {
    return structuredClone(fallback);
  }
}

async function writeJsonAtomic(target: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporary, target);
}

function resolveLegacyUserDataRoot(): string {
  const configured = process.env.IDE_AI_OPENFOX_USER_DATA?.trim();
  if (configured) {
    return path.resolve(configured);
  }

  const roaming = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  const candidates = process.platform === 'win32'
    ? [path.join(roaming, 'IDE Open AI'), path.join(roaming, 'projet-ide-open-ai'), path.join(roaming, 'IDE-AI')]
    : process.platform === 'darwin'
      ? [
          path.join(os.homedir(), 'Library', 'Application Support', 'IDE Open AI'),
          path.join(os.homedir(), 'Library', 'Application Support', 'IDE-AI'),
        ]
      : [path.join(configHome, 'IDE Open AI'), path.join(configHome, 'IDE-AI')];

  return candidates.find(candidate => existsSync(path.join(candidate, 'openfox-runtime'))) || candidates[0];
}

function createRuntimePaths(userDataRoot: string): RuntimePaths {
  const root = path.join(userDataRoot, 'openfox-runtime');
  const virtualHome = path.join(root, 'home');
  const roaming = path.join(root, 'roaming');
  const local = path.join(root, 'local');
  const xdgConfig = path.join(root, 'xdg-config');
  const xdgData = path.join(root, 'xdg-data');
  const env: Record<string, string> = {
    APPDATA: roaming,
    LOCALAPPDATA: local,
    XDG_CONFIG_HOME: xdgConfig,
    XDG_DATA_HOME: xdgData,
  };
  if (process.platform === 'darwin') {
    env.HOME = virtualHome;
  }

  const configDir = process.platform === 'darwin'
    ? path.join(virtualHome, 'Library', 'Application Support', 'openfox')
    : process.platform === 'win32'
      ? path.join(roaming, 'openfox')
      : path.join(xdgConfig, 'openfox');
  const dataDir = process.platform === 'darwin'
    ? configDir
    : process.platform === 'win32'
      ? path.join(local, 'openfox')
      : path.join(xdgData, 'openfox');

  return {
    configDir,
    dataDir,
    configPath: path.join(configDir, 'config.json'),
    authPath: path.join(configDir, 'auth.json'),
    canonicalMcpPath: path.join(root, 'mcp_config.json'),
    logPath: path.join(root, 'openfox-theia.log'),
    env,
  };
}

function resolveEnvPlaceholders(value: unknown, env: NodeJS.ProcessEnv = process.env): unknown {
  if (typeof value === 'string') {
    return value.replace(/\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, variableName: string) => {
      const resolved = env[variableName];
      if (!resolved) {
        throw new Error(`Variable d'environnement manquante: ${variableName}`);
      }
      return resolved;
    });
  }
  if (Array.isArray(value)) {
    return value.map(item => resolveEnvPlaceholders(item, env));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveEnvPlaceholders(item, env)]));
  }
  return value;
}

function inheritedEnvironment(env: NodeJS.ProcessEnv): Record<string, string> {
  const keys = [
    'PATH', 'Path', 'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA',
    'SystemRoot', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'SHELL', 'LANG',
  ];
  const result: Record<string, string> = {};
  for (const key of keys) {
    if (env[key] !== undefined) {
      result[key] = env[key] as string;
    }
  }
  return result;
}

async function ensureBootstrap(paths: RuntimePaths, port: number, workspace: string): Promise<void> {
  await mkdir(paths.configDir, { recursive: true });
  await mkdir(paths.dataDir, { recursive: true });

  const defaults: Record<string, unknown> = {
    providers: [],
    mcpServers: {},
    server: { port, host: '127.0.0.1', openBrowser: false },
    logging: { level: 'info' },
    database: { path: '' },
    workspace: { workdir: workspace },
    visionFallback: {
      enabled: false,
      url: 'http://localhost:11434',
      model: 'qwen3.5:0.8b',
      timeout: 120,
      backend: 'ollama',
    },
  };
  const current = await readJson<Record<string, unknown>>(paths.configPath, defaults);
  const currentServer = typeof current.server === 'object' && current.server ? current.server as Record<string, unknown> : {};
  const currentWorkspace = typeof current.workspace === 'object' && current.workspace ? current.workspace as Record<string, unknown> : {};
  const canonical = await readJson<{ toolLimit?: number; mcpServers?: Record<string, Record<string, unknown>> }>(
    paths.canonicalMcpPath,
    { toolLimit: 100, mcpServers: (current.mcpServers as Record<string, Record<string, unknown>> | undefined) || {} },
  );

  const resolvedServers = resolveEnvPlaceholders(canonical.mcpServers || {}) as Record<string, Record<string, unknown>>;
  const inherited = inheritedEnvironment(process.env);
  const runnableServers = Object.fromEntries(Object.entries(resolvedServers).map(([name, config]) => {
    const transport = config.transport || (config.url ? 'http' : 'stdio');
    if (transport !== 'stdio') {
      return [name, config];
    }
    const configuredEnv = typeof config.env === 'object' && config.env ? config.env as Record<string, string> : {};
    return [name, { ...config, transport, env: { ...inherited, ...configuredEnv } }];
  }));

  await writeJsonAtomic(paths.configPath, {
    ...defaults,
    ...current,
    server: { ...currentServer, port, host: '127.0.0.1', openBrowser: false },
    workspace: { ...currentWorkspace, workdir: workspace },
    mcpServers: runnableServers,
  });
  await writeJsonAtomic(paths.authPath, { strategy: 'local', encryptedPassword: null });
  if (!existsSync(paths.canonicalMcpPath)) {
    await writeJsonAtomic(paths.canonicalMcpPath, canonical);
  }
}

async function findAvailablePort(startPort: number, attempts = 40): Promise<number> {
  for (let port = startPort; port < startPort + attempts; port += 1) {
    const available = await new Promise<boolean>(resolve => {
      const server = net.createServer();
      server.unref();
      server.once('error', () => resolve(false));
      server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
    });
    if (available) {
      return port;
    }
  }
  throw new Error(`Aucun port OpenFox disponible entre ${startPort} et ${startPort + attempts - 1}.`);
}

function locateOpenFoxCli(): string {
  const configured = process.env.IDE_AI_OPENFOX_CLI?.trim();
  const candidates = configured ? [path.resolve(configured)] : [];
  for (const modulesDirectory of require.resolve.paths('openfox') || []) {
    candidates.push(path.join(modulesDirectory, 'openfox', 'dist', 'cli', 'index.js'));
  }
  candidates.push(path.resolve(__dirname, '../../../../..', 'node_modules', 'openfox', 'dist', 'cli', 'index.js'));

  const found = [...new Set(candidates)].find(candidate => existsSync(candidate));
  if (!found) {
    throw new Error('CLI OpenFox introuvable. Lance npm install à la racine du projet ou définis IDE_AI_OPENFOX_CLI.');
  }
  return found;
}

function locateCompatibilityGuard(): string | undefined {
  const configured = process.env.IDE_AI_OPENFOX_GUARD?.trim();
  const candidates = [
    configured,
    path.resolve(__dirname, '../../../../..', 'electron', 'openfox-mistral-fetch-guard.cjs'),
  ].filter((candidate): candidate is string => Boolean(candidate));
  return candidates.find(candidate => existsSync(candidate));
}

function resolveNodeBinary(): string {
  const candidate = process.env.IDE_AI_NODE_BINARY || process.env.OPENAI_IDE_NODE_BINARY || 'node';
  const result = spawnSync(candidate, ['--version'], { encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) {
    throw new Error(`Node.js est introuvable (${candidate}). Définis IDE_AI_NODE_BINARY.`);
  }
  return candidate;
}

export function workspacePathFromUri(uri: string | undefined): string {
  if (!uri) {
    return process.cwd();
  }
  try {
    if (uri.startsWith('file:')) {
      return fileURLToPath(uri);
    }
  } catch {
    // Use the conservative path fallback below.
  }
  return path.resolve(uri.replace(/^file:\/\//, ''));
}

export class ManagedOpenFoxRuntime {
  private child?: ChildProcess;
  private startPromise?: Promise<ManagedOpenFoxSnapshot>;
  private state: ManagedOpenFoxState = 'offline';
  private message = 'OpenFox n’est pas démarré.';
  private checkedAt = now();
  private port?: number;
  private workspace?: string;
  private paths?: RuntimePaths;
  private readonly logs: string[] = [];
  private stopping = false;

  constructor() {
    process.once('exit', () => this.child?.kill());
  }

  get baseUrl(): string {
    return this.port ? `http://127.0.0.1:${this.port}` : '';
  }

  snapshot(): ManagedOpenFoxSnapshot {
    return {
      state: this.state,
      message: this.message,
      checkedAt: this.checkedAt,
      baseUrl: this.baseUrl,
      port: this.port,
      pid: this.child?.pid,
      workspace: this.workspace,
      managed: true,
      logsTail: this.logs.slice(-20).join('').trim() || undefined,
    };
  }

  async ensureStarted(workspaceUri?: string): Promise<ManagedOpenFoxSnapshot> {
    const workspace = workspacePathFromUri(workspaceUri);
    if (this.child && this.state === 'ready' && this.workspace === workspace) {
      return this.snapshot();
    }
    if (this.startPromise) {
      return this.startPromise;
    }
    const pending = this.startInternal(workspace).finally(() => {
      this.startPromise = undefined;
    });
    this.startPromise = pending;
    return pending;
  }

  async restart(workspaceUri?: string): Promise<ManagedOpenFoxSnapshot> {
    await this.stop();
    return this.ensureStarted(workspaceUri);
  }

  async stop(): Promise<ManagedOpenFoxSnapshot> {
    this.stopping = true;
    const child = this.child;
    if (child) {
      child.kill('SIGTERM');
      const exited = await Promise.race([
        new Promise<boolean>(resolve => child.once('exit', () => resolve(true))),
        sleep(4_000).then(() => false),
      ]);
      if (!exited && this.child === child) {
        if (process.platform === 'win32' && child.pid) {
          spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        } else {
          child.kill('SIGKILL');
        }
      }
    }
    this.child = undefined;
    this.state = 'offline';
    this.message = 'OpenFox arrêté.';
    this.checkedAt = now();
    this.stopping = false;
    return this.snapshot();
  }

  private async startInternal(workspace: string): Promise<ManagedOpenFoxSnapshot> {
    if (this.child) {
      await this.stop();
    }
    this.stopping = false;
    this.workspace = workspace;
    this.state = 'degraded';
    this.message = 'Démarrage d’OpenFox…';
    this.checkedAt = now();

    try {
      this.port = await findAvailablePort(Number(process.env.IDE_AI_OPENFOX_PORT || 10369));
      this.paths = createRuntimePaths(resolveLegacyUserDataRoot());
      await ensureBootstrap(this.paths, this.port, workspace);
      await mkdir(path.dirname(this.paths.logPath), { recursive: true });

      const cliPath = locateOpenFoxCli();
      const guard = locateCompatibilityGuard();
      const args = [...(guard ? ['--require', guard] : []), cliPath, '--port', String(this.port), '--no-browser'];
      const child = spawn(resolveNodeBinary(), args, {
        cwd: workspace,
        env: {
          ...process.env,
          ...this.paths.env,
          OPENFOX_MODE: 'production',
          WORKSPACE_PATH: workspace,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      this.child = child;
      child.stdout?.on('data', chunk => this.record('stdout', chunk.toString()));
      child.stderr?.on('data', chunk => this.record('stderr', chunk.toString()));
      child.on('error', error => this.record('error', `${error.message}\n`));
      child.on('exit', (code, signal) => {
        this.record('runtime', `OpenFox arrêté (code=${code ?? 'null'}, signal=${signal ?? 'null'})\n`);
        if (this.child === child) {
          this.child = undefined;
          if (!this.stopping) {
            this.state = 'offline';
            this.message = `OpenFox s’est arrêté de manière inattendue (code ${code ?? 'inconnu'}).`;
            this.checkedAt = now();
          }
        }
      });

      await this.waitForHealth();
      this.state = 'ready';
      this.message = 'OpenFox est démarré et supervisé par Theia.';
      this.checkedAt = now();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.record('startup', `${message}\n`);
      await this.stop().catch(() => undefined);
      this.state = 'offline';
      this.message = message;
      this.checkedAt = now();
    }
    return this.snapshot();
  }

  private async waitForHealth(timeoutMs = 45_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let lastError: unknown;
    while (Date.now() < deadline) {
      if (!this.child) {
        throw new Error(`OpenFox s’est arrêté pendant son démarrage.\n${this.logs.slice(-20).join('')}`);
      }
      try {
        const response = await fetch(`${this.baseUrl}/api/health`, { signal: AbortSignal.timeout(1_500) });
        if (response.ok) {
          await sleep(500);
          return;
        }
      } catch (error) {
        lastError = error;
      }
      await sleep(350);
    }
    throw new Error(`OpenFox ne répond pas après 45 secondes. ${lastError ? String(lastError) : ''}\n${this.logs.slice(-20).join('')}`);
  }

  private record(channel: string, message: string): void {
    const line = `[${now()}] [${channel}] ${message}`;
    this.logs.push(line);
    if (this.logs.length > 2_000) {
      this.logs.splice(0, this.logs.length - 2_000);
    }
    if (this.paths) {
      void appendFile(this.paths.logPath, line, 'utf8').catch(() => undefined);
    }
  }
}
