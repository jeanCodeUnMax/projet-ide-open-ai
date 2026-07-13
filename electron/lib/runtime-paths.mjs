import path from 'node:path'

/**
 * Builds an isolated OpenFox runtime rooted in Electron's userData directory.
 * The child process receives virtual HOME/XDG/APPDATA locations so it does not
 * overwrite a separately installed OpenFox configuration.
 */
export function createRuntimePaths(userDataPath, platform = process.platform) {
  const root = path.join(userDataPath, 'openfox-runtime')
  const virtualHome = path.join(root, 'home')
  const roaming = path.join(root, 'roaming')
  const local = path.join(root, 'local')
  const xdgConfig = path.join(root, 'xdg-config')
  const xdgData = path.join(root, 'xdg-data')

  const env = {
    APPDATA: roaming,
    LOCALAPPDATA: local,
    XDG_CONFIG_HOME: xdgConfig,
    XDG_DATA_HOME: xdgData,
  }
  // OpenFox uses homedir() on macOS, so HOME must be virtualized there.
  // Windows and Linux already honor APPDATA/XDG and can retain the user's
  // actual home directory for Git, npm, SSH and MCP credentials.
  if (platform === 'darwin') env.HOME = virtualHome

  let configDir
  let dataDir
  if (platform === 'darwin') {
    configDir = path.join(virtualHome, 'Library', 'Application Support', 'openfox')
    dataDir = configDir
  } else if (platform === 'win32') {
    configDir = path.join(roaming, 'openfox')
    dataDir = path.join(local, 'openfox')
  } else {
    configDir = path.join(xdgConfig, 'openfox')
    dataDir = path.join(xdgData, 'openfox')
  }

  return {
    root,
    virtualHome,
    configDir,
    dataDir,
    configPath: path.join(configDir, 'config.json'),
    authPath: path.join(configDir, 'auth.json'),
    canonicalMcpPath: path.join(root, 'mcp_config.json'),
    desktopSettingsPath: path.join(root, 'desktop-settings.json'),
    logPath: path.join(root, 'openfox.log'),
    env,
  }
}
