import { describe, it, expect } from 'vitest'
import { ipcError, ipcSuccess } from './ipcResponse'

describe('ipcResponse', () => {
  describe('ipcError', () => {
    it('returns success: false and error message from Error', () => {
      const result = ipcError(new Error('getConfig failed'), '获取配置失败')
      expect(result).toEqual({ success: false, error: 'getConfig failed' })
    })

    it('returns fallback message when error is not an Error instance', () => {
      const result = ipcError('unknown', '获取配置失败')
      expect(result).toEqual({ success: false, error: '获取配置失败' })
    })

    it('returns fallback when error is null', () => {
      const result = ipcError(null, '操作失败')
      expect(result).toEqual({ success: false, error: '操作失败' })
    })
  })

  describe('ipcSuccess', () => {
    it('returns success: true with spread data', () => {
      const result = ipcSuccess({ config: { version: '1.0' } })
      expect(result).toEqual({ success: true, config: { version: '1.0' } })
    })
  })
})
