/**
 * 解析 Chrome/Chromium/Edge 可执行路径，便于本机启动浏览器
 * 逻辑迁移自 openclaw-cn src/browser/chrome.executables.ts，仅保留查找逻辑，无 OpenClaw 依赖
 */
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

function exists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath)
  } catch {
    return false
  }
}

function findFirst(candidates: string[]): string | null {
  for (const p of candidates) {
    if (exists(p)) return p
  }
  return null
}

export function findChromeExecutableWindows(): string | null {
  const localAppData = process.env.LOCALAPPDATA ?? ''
  const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files'
  const programFilesX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'
  const join = path.win32.join
  const candidates: string[] = []
  if (localAppData) {
    candidates.push(join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'))
    candidates.push(join(localAppData, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'))
    candidates.push(join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe'))
    candidates.push(join(localAppData, 'Chromium', 'Application', 'chrome.exe'))
    candidates.push(join(localAppData, 'Google', 'Chrome SxS', 'Application', 'chrome.exe'))
  }
  candidates.push(join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'))
  candidates.push(join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'))
  candidates.push(join(programFiles, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'))
  candidates.push(join(programFilesX86, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'))
  candidates.push(join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'))
  candidates.push(join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'))
  return findFirst(candidates)
}

export function findChromeExecutableMac(): string | null {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    path.join(os.homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    path.join(os.homedir(), 'Applications/Brave Browser.app/Contents/MacOS/Brave Browser'),
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    path.join(os.homedir(), 'Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'),
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary'
  ]
  return findFirst(candidates)
}

export function findChromeExecutableLinux(): string | null {
  const candidates = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chrome',
    '/usr/bin/brave-browser',
    '/usr/bin/brave',
    '/snap/bin/brave',
    '/usr/bin/microsoft-edge',
    '/usr/bin/microsoft-edge-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium'
  ]
  return findFirst(candidates)
}

export function resolveChromeExecutable(customPath?: string): string | null {
  if (customPath && customPath.trim()) {
    const p = path.resolve(customPath.trim())
    return exists(p) ? p : null
  }
  const platform = process.platform
  if (platform === 'win32') return findChromeExecutableWindows()
  if (platform === 'darwin') return findChromeExecutableMac()
  if (platform === 'linux') return findChromeExecutableLinux()
  return null
}
