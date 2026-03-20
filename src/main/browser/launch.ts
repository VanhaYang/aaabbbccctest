/**
 * 启动本机 Chrome 并开放 CDP 端口，供 Playwright 连接
 * 逻辑迁移自 openclaw-cn src/browser/chrome.ts，仅保留启动与端口检测，无 profile 装饰等依赖
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { app } from 'electron'
import log from '../logger'
import { resolveChromeExecutable } from './executable'

const DEFAULT_CDP_PORT = 9321
const LAUNCH_TIMEOUT_MS = 15000
const POLL_MS = 200

export type RunningChrome = {
  pid: number
  cdpPort: number
  proc: ChildProcessWithoutNullStreams
  userDataDir: string
}

let running: RunningChrome | null = null

function getCdpUrl(port: number): string {
  return `http://127.0.0.1:${port}`
}

async function waitForCdp(port: number, timeoutMs: number): Promise<boolean> {
  const cdpUrl = getCdpUrl(port)
  const versionUrl = `${cdpUrl}/json/version`
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(versionUrl, { signal: AbortSignal.timeout(2000) })
      if (res.ok) {
        const data = (await res.json()) as { webSocketDebuggerUrl?: string }
        if (data?.webSocketDebuggerUrl) return true
      }
    } catch {
      // ignore
    }
    await new Promise(r => setTimeout(r, POLL_MS))
  }
  return false
}

function resolveUserDataDir(configured?: string): string {
  if (configured && configured.trim()) {
    return path.resolve(configured.trim())
  }
  const base = app.getPath('userData')
  return path.join(base, 'browser-user-data')
}

/**
 * 启动 Chrome，若已在运行则直接返回当前 CDP URL
 */
export async function ensureChromeLaunched(options: {
  executablePath?: string
  userDataDir?: string
  port?: number
  headless?: boolean
}): Promise<{ cdpUrl: string; running: RunningChrome }> {
  const port = options.port ?? DEFAULT_CDP_PORT
  const cdpUrl = getCdpUrl(port)

  if (running && running.cdpPort === port) {
    const ok = await waitForCdp(port, 2000)
    if (ok) return { cdpUrl, running }
    try {
      running.proc.kill('SIGTERM')
    } catch {}
    running = null
  }

  const exe = resolveChromeExecutable(options.executablePath)
  if (!exe) {
    throw new Error(
      '未找到 Chrome/Edge/Brave 可执行文件，请安装或配置 browser.executablePath'
    )
  }

  const userDataDir = resolveUserDataDir(options.userDataDir)
  fs.mkdirSync(userDataDir, { recursive: true })

  const args: string[] = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-sync',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-features=Translate,MediaRouter',
    '--disable-session-crashed-bubble',
    '--hide-crash-restore-bubble',
    '--password-store=basic',
    '--disable-blink-features=AutomationControlled',
    'about:blank'
  ]
  if (options.headless) {
    args.push('--headless=new', '--disable-gpu')
  }
  if (process.platform === 'linux') {
    args.push('--disable-dev-shm-usage')
  }

  const proc = spawn(exe, args, {
    stdio: 'pipe',
    env: { ...process.env, HOME: os.homedir() }
  })

  const ok = await waitForCdp(port, LAUNCH_TIMEOUT_MS)
  if (!ok) {
    try {
      proc.kill('SIGTERM')
    } catch {}
    throw new Error('Chrome 启动超时，CDP 端口未就绪')
  }

  running = { pid: proc.pid!, cdpPort: port, proc, userDataDir }
  proc.on('error', err => log.warn('[Browser] Chrome process error:', err))
  proc.on('exit', (code, signal) => {
    if (running?.proc === proc) running = null
    log.info('[Browser] Chrome process exited', { code, signal })
  })
  log.info('[Browser] Chrome launched', { port, pid: running.pid })
  return { cdpUrl, running }
}

export function getRunningChrome(): RunningChrome | null {
  return running
}

export async function stopChrome(): Promise<void> {
  if (!running) return
  try {
    running.proc.kill('SIGTERM')
  } catch {}
  running = null
}
