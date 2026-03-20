import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

vi.mock('electron', () => ({
  app: {
    getPath: () => require('os').tmpdir(),
    getVersion: () => '1.0.0'
  }
}))

import { ConfigManager } from './configManager'

describe('ConfigManager', () => {
  let tmpDir: string
  let manager: ConfigManager

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-manager-test-'))
    manager = new ConfigManager(tmpDir)
  })

  afterEach(() => {
    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true })
      }
    } catch {
      // ignore
    }
  })

  it('getConfigPath 返回 config.json 路径', () => {
    expect(manager.getConfigPath()).toBe(path.join(tmpDir, 'config.json'))
  })

  it('load/save round-trip：setWorkspacePath 后 getWorkspacePath 一致', () => {
    const testPath = process.platform === 'win32' ? 'C:\\workspace\\test' : '/tmp/workspace'
    manager.setWorkspacePath(testPath)
    expect(manager.getWorkspacePath()).toBe(testPath)
    const configPath = manager.getConfigPath()
    expect(fs.existsSync(configPath)).toBe(true)
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    expect(raw.workspacePath).toBe(testPath)
    expect(raw).not.toHaveProperty('mainWindowState')
  })

  it('load/save round-trip：getConfig 不包含 mainWindowState', () => {
    manager.setWorkspacePath('/some/path')
    const config = manager.getConfig()
    expect(config.workspacePath).toBe('/some/path')
    expect(config).not.toHaveProperty('mainWindowState')
  })

  it('updateConfig 后 getConfig 反映更新', () => {
    manager.updateConfig({ autoStart: true, floatingTriggerEnabled: false })
    const config = manager.getConfig()
    expect(config.autoStart).toBe(true)
    expect(config.floatingTriggerEnabled).toBe(false)
  })
})
