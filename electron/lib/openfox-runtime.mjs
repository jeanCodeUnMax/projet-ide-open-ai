import { EventEmitter } from 'node:events'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { access, appendFile, mkdir } from 'node:fs/promises'
import { ensureOpenFoxBootstrap, syncCanonicalMcpToOpenFox } from './config-store.mjs'

export async function locateOpenFoxCli() {
  let serverEntry
  try {
    serverEntry = fileURLToPath(import.meta.resolve('openfox'))
  } catch (error) {
    throw new Error(
      `Impossible de résoudre le paquet OpenFox en mode ESM. Réinstalle les dépendances avec npm install. ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  const packageRoot = path.resolve(path.dirname(serverEntry), '..', '..')
  const cliPath = path.join(packageRoot, 'dist', 'cli', 'index.js')
  try {
    await access(cliPath)
  } catch {
    throw new Error(`CLI OpenFox introuvable: ${cliPath}. Réinstalle les dépendances avec npm install.`)
  }
  return cliPath
}

function resolveNodeBinary() {
  const candidate = process.env.OPENAI_IDE_NODE_BINARY || 'node'
  const result = spawnSync(candidate, ['--version'], { encoding: 'utf8' })
  if (result.error || result.status !== 0) {
    throw new Error(
      `Node.js est introuvable (${candidate}). Installe Node.js ou définis OPENAI_IDE_NODE_BINARY.`,
    )
  }
  return candidate
}

export class OpenFoxRuntime extends EventEmitter {
  constructor({ paths, port, workspace }) {
    super()
    this.paths = paths
    this.port = port
    this.workspace = workspace
    this.child = null
    this.stopping = false
    this.logs = []
  }

  get baseUrl() {
    return `http://127.0.0.1:${this.port}`
  }

  async start() {
    if (this.child) return
    this.stopping = false
    await ensureOpenFoxBootstrap(this.paths, { port: this.port, workspace: this.workspace })
    await syncCanonicalMcpToOpenFox(this.paths, {
      ...process.env,
      WORKSPACE_PATH: this.workspace,
    })

    const cliPath = await locateOpenFoxCli()
    const nodeBinary = resolveNodeBinary()
    const env = {
      ...process.env,
      ...this.paths.env,
      OPENFOX_MODE: 'production',
      WORKSPACE_PATH: this.workspace,
    }

    await mkdir(path.dirname(this.paths.logPath), { recursive: true })
    this.child = spawn(nodeBinary, [cliPath, '--port', String(this.port), '--no-browser'], {
      cwd: this.workspace,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })

    this.child.stdout?.on('data', (chunk) => this.record('stdout', chunk.toString()))
    this.child.stderr?.on('data', (chunk) => this.record('stderr', chunk.toString()))
    this.child.on('error', (error) => this.emit('error', error))
    this.child.on('exit', (code, signal) => {
      this.record('runtime', `OpenFox arrêté (code=${code ?? 'null'}, signal=${signal ?? 'null'})\n`)
      this.child = null
      if (!this.stopping) this.emit('unexpected-exit', { code, signal })
    })

    await this.waitForHealth()
    this.emit('ready', { baseUrl: this.baseUrl })
  }

  async waitForHealth(timeoutMs = 45_000) {
    const deadline = Date.now() + timeoutMs
    let lastError
    while (Date.now() < deadline) {
      if (!this.child) throw new Error('Le processus OpenFox s’est arrêté pendant le démarrage.')
      try {
        const response = await fetch(`${this.baseUrl}/api/health`, { signal: AbortSignal.timeout(1_500) })
        if (response.ok) return
      } catch (error) {
        lastError = error
      }
      await new Promise((resolve) => setTimeout(resolve, 350))
    }
    throw new Error(`OpenFox ne répond pas après 45 secondes. ${lastError ? String(lastError) : ''}`)
  }

  async stop() {
    this.stopping = true
    const child = this.child
    if (!child) return
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (this.child) child.kill('SIGKILL')
        resolve()
      }, 4_000)
      child.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
      child.kill('SIGTERM')
    })
    this.child = null
  }

  async restart({ workspace = this.workspace } = {}) {
    this.workspace = workspace
    await this.stop()
    await this.start()
  }

  record(channel, message) {
    const line = `[${new Date().toISOString()}] [${channel}] ${message}`
    this.logs.push(line)
    if (this.logs.length > 2_000) this.logs.splice(0, this.logs.length - 2_000)
    void appendFile(this.paths.logPath, line, 'utf8')
    this.emit('log', line)
  }

  getLogs() {
    return this.logs.join('')
  }
}
