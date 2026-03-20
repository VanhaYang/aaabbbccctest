import { describe, it, expect } from 'vitest'
import { CONTRIBUTION_IDS, type IContribution } from './contributions.types'

describe('contributions', () => {
  it('CONTRIBUTION_IDS 长度不少于 9', () => {
    expect(CONTRIBUTION_IDS.length).toBeGreaterThanOrEqual(9)
  })

  it('CONTRIBUTION_IDS 包含 mainWindow、ipc、cleanup', () => {
    expect(CONTRIBUTION_IDS).toContain('mainWindow')
    expect(CONTRIBUTION_IDS).toContain('ipc')
    expect(CONTRIBUTION_IDS).toContain('cleanup')
  })

  it('CONTRIBUTION_IDS 顺序：mainWindow 首位，cleanup 末位', () => {
    expect(CONTRIBUTION_IDS[0]).toBe('mainWindow')
    expect(CONTRIBUTION_IDS[CONTRIBUTION_IDS.length - 1]).toBe('cleanup')
  })

  it('IContribution 类型：id 必选，其余可选', () => {
    const minimal: IContribution = { id: 'test' }
    expect(minimal.id).toBe('test')
    const withReady: IContribution = { id: 'x', onAppReady: () => {} }
    expect(typeof withReady.onAppReady).toBe('function')
  })
})
