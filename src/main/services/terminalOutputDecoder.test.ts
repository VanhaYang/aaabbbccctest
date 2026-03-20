import { describe, it, expect } from 'vitest'
import iconv from 'iconv-lite'
import {
  isLikelyGarbled,
  looksLikeValidText,
  decodeOutput,
  decodeResultOutput,
} from './terminalOutputDecoder'

describe('terminalOutputDecoder', () => {
  describe('isLikelyGarbled', () => {
    it('空字符串返回 false', () => {
      expect(isLikelyGarbled('')).toBe(false)
    })
    it('空内容（仅空白）返回 false', () => {
      expect(isLikelyGarbled('   \n\t')).toBe(false)
    })
    it('包含 UTF-8 替换字符 U+FFFD 返回 true', () => {
      expect(isLikelyGarbled('hello\uFFFDworld')).toBe(true)
      expect(isLikelyGarbled('\uFFFD')).toBe(true)
    })
    it('控制字符超过 10% 返回 true', () => {
      const manyControl = 'a\x00\x01\x02\x03\x04\x05\x06\x07\x08\x0b\x0c' // 11 个控制字符 + 1 个 a
      expect(isLikelyGarbled(manyControl)).toBe(true)
    })
    it('少量控制字符（换行、制表符）不判为乱码', () => {
      expect(isLikelyGarbled('line1\nline2\t')).toBe(false)
    })
    it('连续 3 个以上非常见字符（非 ASCII/中文/换行制表）返回 true', () => {
      expect(isLikelyGarbled('abc\u0100\u0101\u0102')).toBe(true)
      expect(isLikelyGarbled('ab\u0100')).toBe(false) // 仅 1 个
    })
    it('正常中文不判为乱码', () => {
      expect(isLikelyGarbled('命令语法不正确。')).toBe(false)
      expect(isLikelyGarbled('你好世界')).toBe(false)
    })
    it('正常英文不判为乱码', () => {
      expect(isLikelyGarbled('hello world')).toBe(false)
    })
  })

  describe('looksLikeValidText', () => {
    it('空字符串返回 true', () => {
      expect(looksLikeValidText('')).toBe(true)
    })
    it('包含中文返回 true', () => {
      expect(looksLikeValidText('错误')).toBe(true)
      expect(looksLikeValidText('a中b')).toBe(true)
    })
    it('大部分为可打印 ASCII 返回 true', () => {
      expect(looksLikeValidText('hello world 123')).toBe(true)
      expect(looksLikeValidText('a'.repeat(90) + '\x00\x01')).toBe(true) // >80% 可打印
    })
    it('可打印比例不足 80% 且无中文返回 false', () => {
      const mostlyControl = 'a' + '\x00'.repeat(10)
      expect(looksLikeValidText(mostlyControl)).toBe(false)
    })
  })

  describe('decodeOutput', () => {
    describe('非 Windows（isWindows: false）', () => {
      it('字符串原样返回', () => {
        expect(decodeOutput('hello', false)).toBe('hello')
        expect(decodeOutput('命令语法不正确。', false)).toBe('命令语法不正确。')
      })
      it('Buffer 按 UTF-8 解码', () => {
        expect(decodeOutput(Buffer.from('hello', 'utf-8'), false)).toBe('hello')
        const utf8Chinese = Buffer.from('命令语法不正确。', 'utf-8')
        expect(decodeOutput(utf8Chinese, false)).toBe('命令语法不正确。')
      })
    })

    describe('Windows（isWindows: true）', () => {
      it('字符串原样返回', () => {
        expect(decodeOutput('hello', true)).toBe('hello')
        expect(decodeOutput('命令语法不正确。', true)).toBe('命令语法不正确。')
      })
      it('GBK Buffer（如 cmd 错误信息）解码为正确中文', () => {
        const gbkBuffer = iconv.encode('命令语法不正确。', 'gbk')
        expect(decodeOutput(gbkBuffer, true)).toBe('命令语法不正确。')
      })
      it('真实案例：stderr [195,252,...] 解码为「命令语法不正确。」', () => {
        const realStderr = Buffer.from([
          195, 252, 193, 238, 211, 239, 183, 168, 178, 187, 213, 253, 200, 183, 161, 163,
        ])
        expect(decodeOutput(realStderr, true)).toBe('命令语法不正确。')
      })
      it('UTF-8 Buffer 在 Windows 上仍能正确解码为 UTF-8 文本', () => {
        const utf8Buf = Buffer.from('hello 世界', 'utf-8')
        expect(decodeOutput(utf8Buf, true)).toBe('hello 世界')
      })
      it('空 Buffer 返回空字符串', () => {
        expect(decodeOutput(Buffer.alloc(0), true)).toBe('')
      })
      it('仅换行等 ASCII 的 Buffer 正常', () => {
        expect(decodeOutput(Buffer.from('\nok\n', 'utf-8'), true)).toBe('\nok\n')
      })
      it('纯英文 GBK 编码（与 ASCII 兼容）能正确解码', () => {
        const gbkAscii = Buffer.from('mkdir failed', 'utf-8') // 与 GBK 兼容
        expect(decodeOutput(gbkAscii, true)).toBe('mkdir failed')
      })
    })
  })

  describe('decodeResultOutput', () => {
    it('null/undefined 返回空字符串', () => {
      expect(decodeResultOutput(null, false)).toBe('')
      expect(decodeResultOutput(null, true)).toBe('')
      expect(decodeResultOutput(undefined, false)).toBe('')
      expect(decodeResultOutput(undefined, true)).toBe('')
    })
    it('字符串原样返回', () => {
      expect(decodeResultOutput('hello', false)).toBe('hello')
      expect(decodeResultOutput('错误信息', true)).toBe('错误信息')
    })
    it('Buffer 按平台解码', () => {
      expect(decodeResultOutput(Buffer.from('hi', 'utf-8'), false)).toBe('hi')
      const gbkBuf = iconv.encode('命令语法不正确。', 'gbk')
      expect(decodeResultOutput(gbkBuf, true)).toBe('命令语法不正确。')
    })
    it('非 string/Buffer 转为 String()', () => {
      expect(decodeResultOutput(123, false)).toBe('123')
      expect(decodeResultOutput(true, true)).toBe('true')
    })
    it('空字符串返回空字符串', () => {
      expect(decodeResultOutput('', false)).toBe('')
      expect(decodeResultOutput('', true)).toBe('')
    })
  })

  describe('边界与兼容', () => {
    it('isLikelyGarbled: 控制字符恰好 10% 不判为乱码', () => {
      const oneControl = 'a'.repeat(9) + '\x00' // 1/10 = 10%
      expect(isLikelyGarbled(oneControl)).toBe(false)
    })
    it('isLikelyGarbled: 控制字符略超 10% 判为乱码', () => {
      const twoControl = 'a'.repeat(8) + '\x00\x01'
      expect(isLikelyGarbled(twoControl)).toBe(true)
    })
    it('decodeOutput: 长字符串原样返回', () => {
      const long = 'x'.repeat(10000)
      expect(decodeOutput(long, true)).toBe(long)
      expect(decodeOutput(long, false)).toBe(long)
    })
    it('decodeOutput: 含 \\r\\n 的字符串原样返回', () => {
      const crlf = 'line1\r\nline2\n'
      expect(decodeOutput(crlf, true)).toBe(crlf)
    })
    it('decodeResultOutput: 空 Buffer 返回空字符串', () => {
      expect(decodeResultOutput(Buffer.alloc(0), true)).toBe('')
      expect(decodeResultOutput(Buffer.alloc(0), false)).toBe('')
    })
    it('Windows: 多种 GBK 中文错误信息均解码正确', () => {
      const messages = ['不是内部或外部命令', '系统找不到指定的路径。', '拒绝访问。']
      for (const msg of messages) {
        const buf = iconv.encode(msg, 'gbk')
        expect(decodeOutput(buf, true)).toBe(msg)
      }
    })
  })
})
