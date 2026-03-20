import { describe, it, expect } from 'vitest'
import { registerTool, getTool, listToolIds } from './registry'
import type { ToolExecutor, ToolId } from './types'

describe('tools/registry', () => {
  const fakeExecutor: ToolExecutor = async () => ({
    success: true,
    data: { ok: true }
  })

  it('registerTool 后 getTool 返回同一执行器', () => {
    registerTool('read' as ToolId, fakeExecutor)
    expect(getTool('read')).toBe(fakeExecutor)
  })

  it('listToolIds 包含已注册的 id', () => {
    registerTool('read' as ToolId, fakeExecutor)
    const ids = listToolIds()
    expect(ids).toContain('read')
  })
})
