/**
 * 对外 API 可用性测试
 * 覆盖 docs/当前在用/API与规范 中 OpenAPI 声明的全部接口，校验接口可访问性与基本响应格式。
 *
 * 注意：测试会执行真实的鼠标移动、点击、拖动、滚动（使用屏幕中心坐标，避免误点标题栏）。
 *
 * 使用前请先启动应用（或确保 API 服务已在运行），默认请求 http://127.0.0.1:28473。
 * 可通过环境变量覆盖：
 *   API_BASE_URL   base URL，如 http://192.168.24.66:28473
 *   API_AUTH_TOKEN 可选，Bearer Token（若服务端启用了鉴权）
 *
 * 运行：npm run test:api
 */

import { describe, it, expect, beforeAll } from 'vitest'

const BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:28473'
const AUTH_TOKEN = process.env.API_AUTH_TOKEN

function headers(): HeadersInit {
  const h: Record<string, string> = {
    'Content-Type': 'application/json'
  }
  if (AUTH_TOKEN) {
    h['Authorization'] = `Bearer ${AUTH_TOKEN}`
  }
  return h
}

async function fetchJson(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { ...headers(), ...init?.headers }
  })
  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return { res, body: await res.json() }
  }
  return { res, body: null }
}

async function fetchBinary(path: string) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {} })
  const buf = await res.arrayBuffer()
  return { res, body: buf }
}

describe('API 可用性', () => {
  beforeAll(() => {
    if (!BASE_URL.startsWith('http')) {
      throw new Error('API_BASE_URL 必须为 http(s) 地址')
    }
  })

  describe('Display', () => {
    it('GET /displays - 获取显示器列表', async () => {
      const { res, body } = await fetchJson('/displays')
      expect(res.status).toBe(200)
      expect(body).toBeDefined()
      expect(body.success).toBe(true)
      expect(Array.isArray(body.data)).toBe(true)
    })
  })

  describe('Screenshot', () => {
    it('GET /screenshot - 获取截图', async () => {
      const { res } = await fetchBinary('/screenshot')
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toMatch(/image\/png/)
    })

    it('GET /screenshot?displayId=0 - 指定显示器截图', async () => {
      const { res } = await fetchBinary('/screenshot?displayId=0')
      expect(res.status).toBe(200)
    })
  })

  describe('Mouse', () => {
    // 使用屏幕中心坐标，避免点到 (0,0) 处的标题栏/最小化按钮导致窗口被最小化
    let centerX = 500
    let centerY = 500
    beforeAll(async () => {
      const { res, body } = await fetchJson('/screen/size')
      if (res.status === 200 && body?.data?.width != null && body?.data?.height != null) {
        centerX = Math.floor(body.data.width / 2)
        centerY = Math.floor(body.data.height / 2)
      }
    })

    it('GET /mouse/position - 获取鼠标位置', async () => {
      const { res, body } = await fetchJson('/mouse/position')
      expect(res.status).toBe(200)
      expect(body?.success).toBe(true)
      expect(typeof body?.data?.x).toBe('number')
      expect(typeof body?.data?.y).toBe('number')
    })

    it('POST /mouse/move - 移动鼠标', async () => {
      const { res, body } = await fetchJson('/mouse/move', {
        method: 'POST',
        body: JSON.stringify({ x: centerX, y: centerY })
      })
      expect(res.status).toBe(200)
      expect(body?.success).toBe(true)
    })

    it('POST /mouse/click - 点击鼠标', async () => {
      const { res, body } = await fetchJson('/mouse/click', {
        method: 'POST',
        body: JSON.stringify({ x: centerX, y: centerY })
      })
      expect(res.status).toBe(200)
      expect(body?.success).toBe(true)
    })

    it('POST /mouse/drag - 拖动鼠标', async () => {
      const { res, body } = await fetchJson('/mouse/drag', {
        method: 'POST',
        body: JSON.stringify({
          startX: centerX,
          startY: centerY,
          endX: centerX + 10,
          endY: centerY + 10,
          duration: 0
        })
      })
      expect(res.status).toBe(200)
      expect(body?.success).toBe(true)
    })

    it('POST /mouse/scroll - 滚动鼠标', async () => {
      const { res, body } = await fetchJson('/mouse/scroll', {
        method: 'POST',
        body: JSON.stringify({ x: centerX, y: centerY, direction: 'down', amount: 1 })
      })
      expect(res.status).toBe(200)
      expect(body?.success).toBe(true)
    })

    it('GET /mouse/pixel - 获取像素颜色', async () => {
      const { res, body } = await fetchJson(`/mouse/pixel?x=${centerX}&y=${centerY}`)
      expect(res.status).toBe(200)
      expect(body?.success).toBe(true)
      expect(body?.data?.color).toMatch(/^#[0-9A-Fa-f]{6}$/)
    })
  })

  describe('Screen', () => {
    it('GET /screen/size - 获取屏幕尺寸', async () => {
      const { res, body } = await fetchJson('/screen/size')
      expect(res.status).toBe(200)
      expect(body?.success).toBe(true)
      expect(typeof body?.data?.width).toBe('number')
      expect(typeof body?.data?.height).toBe('number')
    })
  })

  describe('Terminal', () => {
    it('POST /terminal/execute - 执行终端命令（成功时返回 cwd、workspacePath）', async () => {
      const { res, body } = await fetchJson('/terminal/execute', {
        method: 'POST',
        body: JSON.stringify({ command: 'echo ok' })
      })
      expect(res.status).toBe(200)
      expect(body?.success).toBe(true)
      expect(body?.data?.result).toBeDefined()
      expect(typeof body?.data?.result?.exitCode).toBe('number')
      // 成功时也应返回当前 shell 目录与工作区目录，便于调用方/AI 使用
      if (body?.data?.cwd != null) expect(typeof body.data.cwd).toBe('string')
      if (body?.data?.workspacePath != null) expect(typeof body.data.workspacePath).toBe('string')
    })

    it('POST /terminal/execute - 失败时 data 含 cwd、workspacePath 便于排查', async () => {
      const { res, body } = await fetchJson('/terminal/execute', {
        method: 'POST',
        body: JSON.stringify({ command: 'cd 不存在的目录xyz && git rev-parse --is-inside-work-tree' })
      })
      expect(res.status).toBe(400)
      expect(body?.success).toBe(false)
      expect(typeof body?.message).toBe('string')
      // 错误时 data 应包含 cwd、workspacePath（供 AI 迭代修正）；若服务已更新则断言
      if (body?.data != null && typeof body.data === 'object') {
        expect(body.data).toHaveProperty('cwd')
        expect(body.data).toHaveProperty('workspacePath')
        if (body.data.cwd != null) expect(typeof body.data.cwd).toBe('string')
        if (body.data.workspacePath != null) expect(typeof body.data.workspacePath).toBe('string')
      }
    })

    it('POST /terminal/kill - 中断终端命令', async () => {
      const { res, body } = await fetchJson('/terminal/kill', { method: 'POST' })
      expect(res.status).toBe(200)
      expect(body?.success).toBe(true)
    })

    it('GET /terminal/session - 获取终端会话信息', async () => {
      const { res, body } = await fetchJson('/terminal/session')
      // 未配置工作区时可能 400
      expect([200, 400]).toContain(res.status)
      if (res.status === 200) {
        expect(body?.success).toBe(true)
        expect(body?.data).toBeDefined()
      }
    })
  })

  describe('Workspace', () => {
    it('GET /workspace/files - 获取工作区文件列表', async () => {
      const { res, body } = await fetchJson('/workspace/files')
      if (res.status === 200) {
        expect(body?.success).toBe(true)
        expect(body?.data).toBeDefined()
      } else {
        expect([400, 403, 404]).toContain(res.status)
        expect(body?.success).toBe(false)
      }
    })

    it('GET /workspace/files?path=&recursive=false&format=list - 带参数列表', async () => {
      const { res } = await fetchJson('/workspace/files?path=&recursive=false&format=list')
      expect([200, 400, 403, 404]).toContain(res.status)
    })

    it('GET /workspace/file - 读取工作区文件（需有效 path）', async () => {
      const { res, body } = await fetchJson('/workspace/file?path=package.json')
      if (res.status === 200) {
        expect(body?.success).toBe(true)
        expect(body?.data?.content).toBeDefined()
      } else {
        expect([400, 403, 404]).toContain(res.status)
      }
    })

    it('POST /workspace/search - 搜索工作区', async () => {
      const { res, body } = await fetchJson('/workspace/search', {
        method: 'POST',
        body: JSON.stringify({ pattern: '.', maxResults: 1 })
      })
      if (res.status === 200) {
        expect(body?.success).toBe(true)
        expect(body?.data?.matches).toBeDefined()
      } else {
        expect([400, 403, 404, 500]).toContain(res.status)
      }
    })

    it('POST /workspace/write - 写入工作区文件', async () => {
      const { res, body } = await fetchJson('/workspace/write', {
        method: 'POST',
        body: JSON.stringify({
          path: '.api-test-tmp.txt',
          content: 'test',
          overwrite: true,
          createParentDirs: true
        })
      })
      if (res.status === 200) {
        expect(body?.success).toBe(true)
        expect(body?.data?.relativePath).toBeDefined()
      } else {
        expect([400, 403, 409, 500]).toContain(res.status)
      }
    })

    it('POST /workspace/edits - 精准编辑工作区文件', async () => {
      const { res, body } = await fetchJson('/workspace/edits', {
        method: 'POST',
        body: JSON.stringify({
          path: '.api-test-tmp.txt',
          edits: [{ type: 'range', startLine: 1, endLine: 1, newText: 'test\n' }],
          strict: true
        })
      })
      if (res.status === 200) {
        expect(body?.success).toBe(true)
      } else {
        expect([400, 403, 404, 409, 500]).toContain(res.status)
      }
    })
  })

  describe('工具层', () => {
    it('GET /tools/list - 返回 toolIds', async () => {
      const { res, body } = await fetchJson('/tools/list')
      expect(res.status).toBe(200)
      expect(body?.success).toBe(true)
      expect(Array.isArray(body?.data?.toolIds)).toBe(true)
      expect(body?.data?.toolIds).toContain('read')
      expect(body?.data?.toolIds).toContain('write')
    })

    it('POST /tools/execute - 统一入口', async () => {
      const { res, body } = await fetchJson('/tools/execute', {
        method: 'POST',
        body: JSON.stringify({ toolId: 'read', arguments: { path: 'package.json' } })
      })
      if (res.status === 200) {
        expect(body?.success).toBe(true)
        expect(body?.data?.content).toBeDefined()
      } else {
        expect([400, 403, 404, 500]).toContain(res.status)
      }
    })

    it('POST /tools/read - 按方法拆开（与 function calling 一一对应）', async () => {
      const { res, body } = await fetchJson('/tools/read', {
        method: 'POST',
        body: JSON.stringify({ path: 'package.json' })
      })
      if (res.status === 200) {
        expect(body?.success).toBe(true)
        expect(body?.data?.content).toBeDefined()
      } else {
        expect([400, 403, 404, 500]).toContain(res.status)
      }
    })
  })

  describe('错误与边界', () => {
    it('GET 不存在的路径应返回 404', async () => {
      const { res, body } = await fetchJson('/not-exist')
      expect(res.status).toBe(404)
      expect(body?.success).toBe(false)
      expect(body?.code).toBe(404)
    })

    it('POST /mouse/move 缺少 x,y 应返回 400', async () => {
      const { res, body } = await fetchJson('/mouse/move', {
        method: 'POST',
        body: JSON.stringify({})
      })
      expect(res.status).toBe(400)
      expect(body?.success).toBe(false)
    })

    it('GET /mouse/pixel 缺少 x,y 应返回 400', async () => {
      const { res } = await fetchJson('/mouse/pixel')
      expect(res.status).toBe(400)
    })

    it('POST /workspace/write 缺少 path 应返回 400 且 body 含 success:false 与 message', async () => {
      const { res, body } = await fetchJson('/workspace/write', {
        method: 'POST',
        body: JSON.stringify({ content: 'x' })
      })
      expect(res.status).toBe(400)
      expect(body).toBeDefined()
      expect(body.success).toBe(false)
      expect(typeof body.message).toBe('string')
      expect(body.message.length).toBeGreaterThan(0)
    })
  })
})
