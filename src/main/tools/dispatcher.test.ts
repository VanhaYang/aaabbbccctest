import { describe, it, expect, beforeEach } from 'vitest'
import { executeTool } from './dispatcher'
import { registerTool } from './registry'
import type { ToolExecutor, ToolId } from './types'

describe('tools/dispatcher', () => {
  const fakeExecutor: ToolExecutor = async () => ({
    success: true,
    data: { ok: true }
  })

  beforeEach(() => {
    registerTool('read' as ToolId, fakeExecutor)
  })

  it('未知 toolId 返回 404', async () => {
    const result = await executeTool('nonexistent' as ToolId, {})
    expect(result.success).toBe(false)
    expect(result.code).toBe(404)
    expect(result.message).toContain('未知工具')
  })

  it('已注册工具执行并返回结果', async () => {
    const result = await executeTool('read', { path: 'any' })
    expect(result.success).toBe(true)
    expect(result.data).toEqual({ ok: true })
  })

  it('执行器抛错时返回 500', async () => {
    const throwExecutor: ToolExecutor = async () => {
      throw new Error('mock error')
    }
    registerTool('write' as ToolId, throwExecutor)
    const result = await executeTool('write', { path: 'x', content: 'y' })
    expect(result.success).toBe(false)
    expect(result.code).toBe(500)
    expect(result.message).toBe('mock error')
  })
})
