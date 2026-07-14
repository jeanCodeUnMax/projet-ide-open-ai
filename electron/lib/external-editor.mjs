import { access } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

function launchDetached(executable, args, { platform = process.platform } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      detached: true,
      stdio: 'ignore',
      // Hiding a GUI process on Windows can leave Code.exe running without a
      // visible foreground window. Other platforms do not need a Windows flag.
      windowsHide: platform !== 'win32',
    })
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}

function vscodeExecutables(platform, env) {
  const candidates = []
  if (platform === 'win32') {
    if (env.LOCALAPPDATA) {
      candidates.push(path.join(env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code', 'Code.exe'))
      candidates.push(path.join(env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code Insiders', 'Code - Insiders.exe'))
    }
    if (env.ProgramFiles) candidates.push(path.join(env.ProgramFiles, 'Microsoft VS Code', 'Code.exe'))
    if (env['ProgramFiles(x86)']) candidates.push(path.join(env['ProgramFiles(x86)'], 'Microsoft VS Code', 'Code.exe'))
  } else if (platform === 'darwin') {
    candidates.push('/Applications/Visual Studio Code.app/Contents/MacOS/Electron')
    candidates.push('/Applications/Visual Studio Code - Insiders.app/Contents/MacOS/Electron')
  } else {
    candidates.push('/usr/bin/code', '/usr/local/bin/code', '/snap/bin/code')
  }
  return candidates
}

function vscodeArguments(targetPath, platform) {
  // --new-window avoids a silent hand-off to an existing background/minimized
  // VS Code process and gives Windows a real foreground window to display.
  return platform === 'win32'
    ? ['--new-window', '--goto', targetPath]
    : ['--goto', targetPath]
}

export async function openInVSCode(targetPath, {
  platform = process.platform,
  env = process.env,
  shellApi,
  launch = launchDetached,
} = {}) {
  if (typeof targetPath !== 'string' || targetPath.trim() === '') {
    throw new Error('Aucun fichier à ouvrir dans VS Code.')
  }

  for (const executable of vscodeExecutables(platform, env)) {
    try {
      await access(executable)
      await launch(executable, vscodeArguments(targetPath, platform), { platform })
      return { opened: true, method: 'executable', executable, path: targetPath }
    } catch {
      // Essayer le prochain emplacement connu.
    }
  }

  if (shellApi?.openExternal) {
    const fileUrl = pathToFileURL(targetPath)
    const vscodeUrl = `vscode://file${fileUrl.pathname}`
    try {
      await shellApi.openExternal(vscodeUrl)
      return { opened: true, method: 'protocol', path: targetPath }
    } catch {
      // Le protocole vscode:// n’est probablement pas enregistré.
    }
  }

  throw new Error('VS Code est introuvable. Installe VS Code ou active la commande/protocole « code » lors de son installation.')
}
