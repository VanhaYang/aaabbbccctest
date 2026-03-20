#!/usr/bin/env node
/**
 * 将 openapi.v2.json 拆成两套 OpenAPI：
 * - openapi-rest.json：传统 REST（/displays, /screenshot, /mouse/*, /terminal/*, /workspace/*）
 * - openapi-tools.json：工具层（/tools/list, /tools/execute, /tools/read, /tools/write, ...）
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(scriptDir, '..')
const apiSpecDir = path.join(root, 'docs', '当前在用', 'API与规范')
const v2Path = path.join(apiSpecDir, 'openapi.v2.json')

const spec = JSON.parse(fs.readFileSync(v2Path, 'utf-8'))

const restPaths = {}
const toolPaths = {}
for (const [pathKey, pathItem] of Object.entries(spec.paths || {})) {
  if (pathKey.startsWith('/tools/')) {
    toolPaths[pathKey] = pathItem
  } else {
    restPaths[pathKey] = pathItem
  }
}

// 按方法拆开的工具路径：POST /tools/{id}，body = 对应 Tool*Arguments
const TOOL_METHODS = [
  { id: 'read', summary: '读取文件', schemaRef: 'ToolReadArguments' },
  { id: 'write', summary: '写入文件', schemaRef: 'ToolWriteArguments' },
  { id: 'edit', summary: '精准编辑文件', schemaRef: 'ToolEditArguments' },
  { id: 'exec', summary: '执行命令', schemaRef: 'ToolExecArguments' },
  { id: 'screenshot', summary: '截屏', schemaRef: 'ToolScreenshotArguments' },
  { id: 'mouse_move', summary: '移动鼠标', schemaRef: 'ToolMouseMoveArguments' },
  { id: 'mouse_click', summary: '点击鼠标', schemaRef: 'ToolMouseClickArguments' },
  { id: 'apply_patch', summary: '应用 patch', schemaRef: 'ToolApplyPatchArguments' }
]

const toolExecuteResponses = spec.paths['/tools/execute']?.post?.responses || {}

for (const { id, summary, schemaRef } of TOOL_METHODS) {
  const pathKey = `/tools/${id}`
  if (toolPaths[pathKey]) continue
  toolPaths[pathKey] = {
    post: {
      summary: `执行工具：${summary}`,
      description: `与 function calling 一一对应。请求体即该工具参数，见 ${schemaRef}。`,
      operationId: `executeTool_${id}`,
      tags: ['Tools'],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: `#/components/schemas/${schemaRef}` }
          }
        }
      },
      responses: { ...toolExecuteResponses }
    }
  }
}

const allSchemas = spec.components?.schemas || {}

const restSchemas = {}
const toolSchemas = {}
for (const [name, schema] of Object.entries(allSchemas)) {
  if (name.startsWith('Tool')) {
    toolSchemas[name] = schema
  } else {
    restSchemas[name] = schema
  }
}
if (allSchemas.ErrorResponse) {
  toolSchemas.ErrorResponse = allSchemas.ErrorResponse
}

// 构建两个 spec
const restSpec = {
  openapi: spec.openapi,
  info: {
    ...spec.info,
    title: 'Electron Screenshot API (REST)',
    description: 'Electron Screenshot 传统 REST API：截图、鼠标、终端、工作区文件等。\n\n鉴权：可选 `Authorization: Bearer <token>`，未配置 token 时不校验。',
    version: '2.0.0',
    'x-app-version': spec.info['x-app-version'] || '1.5.0'
  },
  servers: spec.servers,
  paths: restPaths,
  components: {
    schemas: restSchemas
  },
  tags: (spec.tags || []).filter(t => t.name !== 'Tools')
}

const toolSpec = {
  openapi: spec.openapi,
  info: {
    ...spec.info,
    title: 'Electron Screenshot API (Tools)',
    description: 'Electron Screenshot 工具层 API：与 OpenClaw tool-catalog 约定对齐，面向 LLM/决策端。\n\n- GET /tools/list 列出工具；\n- POST /tools/read、/tools/write、… 按方法拆开（推荐，与 function calling 一一对应）；\n- POST /tools/execute 统一入口（兼容）。\n\n鉴权：可选 `Authorization: Bearer <token>`。',
    version: '2.0.0',
    'x-app-version': spec.info['x-app-version'] || '1.5.0'
  },
  servers: spec.servers,
  paths: toolPaths,
  components: {
    schemas: toolSchemas
  },
  tags: [{ name: 'Tools', description: '工具层（与 OpenClaw tool-catalog 约定对齐）' }]
}

fs.writeFileSync(path.join(apiSpecDir, 'openapi-rest.json'), JSON.stringify(restSpec, null, 2), 'utf-8')
fs.writeFileSync(path.join(apiSpecDir, 'openapi-tools.json'), JSON.stringify(toolSpec, null, 2), 'utf-8')

console.log('Generated docs/当前在用/API与规范/openapi-rest.json (paths: %d, schemas: %d)', Object.keys(restPaths).length, Object.keys(restSchemas).length)
console.log('Generated docs/当前在用/API与规范/openapi-tools.json (paths: %d, schemas: %d)', Object.keys(toolPaths).length, Object.keys(toolSchemas).length)
