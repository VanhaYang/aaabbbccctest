import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

vi.mock('electron', () => ({ app: { getPath: () => require('os').tmpdir() } }))

import { WindowStateManager } from './windowStateManager'

describe('WindowStateManager', () => {
  let tmpDir: string
  let manager: WindowStateManager

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'window-state-test-'))
    manager = new WindowStateManager(tmpDir)
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

  it('getStatePath 返回 window-state.json 路径', () => {
    expect(manager.getStatePath()).toBe(path.join(tmpDir, 'window-state.json'))
  })

  it('load 在文件不存在时返回 undefined', () => {
    expect(manager.load()).toBeUndefined()
  })

  it('load/save round-trip 正确', () => {
    const state = {
      x: 10,
      y: 20,
      width: 800,
      height: 600,
      isMaximized: false,
      isFullScreen: false
    }
    manager.save(state)
    const loaded = manager.load()
    expect(loaded).toEqual(state)
    expect(fs.existsSync(manager.getStatePath())).toBe(true)
    const raw = JSON.parse(fs.readFileSync(manager.getStatePath(), 'utf-8'))
    expect(raw).toEqual(state)
  })

  it('clear 删除状态文件后 load 返回 undefined', () => {
    manager.save({ width: 100, height: 200 })
    expect(manager.load()).toEqual({ width: 100, height: 200 })
    manager.clear()
    expect(manager.load()).toBeUndefined()
    expect(fs.existsSync(manager.getStatePath())).toBe(false)
  })
})
