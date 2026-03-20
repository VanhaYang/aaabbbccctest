# HTTP API 接口文档

本文档列出了 Electron Screenshot 应用通过 HTTP 服务器对外暴露的所有接口。

## HTTP API 接口（外部调用）

这些接口通过 HTTP 服务器暴露，默认端口为 `28473`。服务器默认仅监听本机 (`127.0.0.1`)。

### 基础信息

- **基础 URL**: `http://127.0.0.1:28473`
- **CORS**: 支持跨域访问
- **请求方法**: 支持 `GET` 和 `POST`
- **响应格式**: JSON（除截图接口返回 PNG 图片）

如需调整监听地址或开启鉴权，可使用环境变量：

- `API_SERVER_HOST`: 自定义监听地址（例如 `0.0.0.0`）
- `API_SERVER_TOKEN`: 启用 Token 鉴权，所有请求需带 `Authorization: Bearer <token>`

### 接口可用性测试

项目内提供对**全部对外接口**的可用性测试（与 `docs/当前在用/API与规范/openapi.v2.json` 一致），用于校验服务是否正常、响应格式是否符合约定。

**前置条件**：先启动本应用，确保 API 服务已运行（默认 `http://127.0.0.1:28473`）。

**运行方式：**

```bash
npm run test:api
```

**环境变量（可选）：**

| 变量             | 说明                                               |
| ---------------- | -------------------------------------------------- |
| `API_BASE_URL`   | 覆盖请求 base URL，如 `http://192.168.24.66:28473` |
| `API_AUTH_TOKEN` | 若服务端启用了 Token 鉴权，填写 Bearer Token       |

示例：测试远程服务并带鉴权

```bash
API_BASE_URL=http://192.168.24.66:28473 API_AUTH_TOKEN=your-token npm run test:api
```

测试文件位置：`scripts/test-api-availability.test.ts`。

### 响应格式

所有 JSON 响应遵循以下格式：

- 成功：`{ "data": any, "code": 200, "message": "", "success": true }`
- 失败：`{ "data": null, "code": 4xx|5xx, "message": "错误描述", "success": false }`

**错误响应示例**（如参数错误、未配置工作区等）：

```json
{
  "data": null,
  "code": 400,
  "message": "参数错误：需要提供文件路径",
  "success": false
}
```

### 接口列表

#### 1. 测试接口

**GET** `/test`

测试服务器是否正常运行。

**响应示例：**

```json
{
  "data": "",
  "code": 200,
  "message": "",
  "success": true
}
```

---

#### 2. 获取显示器列表

**GET** `/displays`

获取所有显示器的信息。

**响应示例：**

```json
{
  "data": [
    {
      "id": 0,
      "bounds": {
        "x": 0,
        "y": 0,
        "width": 1920,
        "height": 1080
      },
      "scaleFactor": 1
    }
  ],
  "code": 200,
  "message": "",
  "success": true
}
```

---

#### 3. 获取屏幕源信息（调试用）

**GET** `/sources`

获取 desktopCapturer 的屏幕源信息，用于调试屏幕 ID 映射关系。

**响应示例：**

```json
{
  "data": {
    "sources": [...],
    "displays": [...],
    "mapping": [...]
  },
  "code": 200,
  "message": "",
  "success": true
}
```

---

#### 4. 截图接口

**GET** `/screenshot?displayId=<显示器ID>`

截取屏幕截图。

**查询参数：**

- `displayId` (可选): 指定显示器 ID，不指定则截取主显示器

**响应：**

- 成功：返回 PNG 图片（`Content-Type: image/png`）
- 失败：返回 JSON 错误信息

**示例：**

```
GET http://192.168.1.100:28473/screenshot
GET http://192.168.1.100:28473/screenshot?displayId=1
```

---

#### 4.1 终端执行命令

**POST** `/terminal/execute`

执行 Shell 命令并返回结果（stdout/stderr/exitCode）。

**链式命令说明：**

- 支持 `cd a && cd b && cmd`、`cd a; cd b; cmd` 这类简单链式，并会更新内部 cwd。
- 含 `||` 或括号的复杂链式会交给 shell 直接执行，但不会持久化更新内部 cwd。

**请求体：**

```json
{
  "command": "git status"
}
```

**响应示例：**

```json
{
  "data": {
    "result": {
      "exitCode": 0,
      "stdout": "On branch main\n",
      "stderr": "",
      "duration": 120,
      "killed": false
    },
    "parsed": {
      "raw": "On branch main\n",
      "cleaned": "On branch main\n",
      "isError": false
    },
    "cwd": "D:/workspace/project"
  },
  "code": 200,
  "message": "",
  "success": true
}
```

---

#### 4.2 终端中断命令

**POST** `/terminal/kill`

中断当前正在执行的命令。

**响应示例：**

```json
{
  "data": {
    "success": true
  },
  "code": 200,
  "message": "",
  "success": true
}
```

---

#### 4.3 获取终端会话信息

**GET** `/terminal/session`

获取当前终端会话状态（cwd、是否运行中、历史记录）。

**响应示例：**

```json
{
  "data": {
    "success": true,
    "sessionId": "session-1700000000000",
    "cwd": "D:/workspace/project",
    "isRunning": false,
    "history": ["git status"]
  },
  "code": 200,
  "message": "",
  "success": true
}
```

---

#### 5. 获取鼠标位置

**GET** `/mouse/position`

获取当前鼠标位置。

**响应示例：**

```json
{
  "data": {
    "x": 100,
    "y": 200
  },
  "code": 200,
  "message": "",
  "success": true
}
```

---

#### 6. 移动鼠标

**POST** `/mouse/move`

移动鼠标到指定位置。

**请求体：**

```json
{
  "x": 100,
  "y": 200,
  "smooth": false,
  "displayId": 0
}
```

**参数说明：**

- `x` (必需): 目标 X 坐标
- `y` (必需): 目标 Y 坐标
- `smooth` (可选): 是否平滑移动，默认 `false`
- `displayId` (可选): 显示器 ID，如果指定，坐标相对于该显示器

**响应示例：**

```json
{
  "data": {
    "x": 100,
    "y": 200
  },
  "code": 200,
  "message": "",
  "success": true
}
```

---

#### 7. 点击鼠标

**POST** `/mouse/click`

在指定位置点击鼠标。

**请求体：**

```json
{
  "x": 100,
  "y": 200,
  "button": "left",
  "double": false,
  "displayId": 0
}
```

**参数说明：**

- `x` (可选): 目标 X 坐标，不指定则使用当前位置
- `y` (可选): 目标 Y 坐标，不指定则使用当前位置
- `button` (可选): 鼠标按钮，可选值：`"left"` | `"right"` | `"middle"`，默认 `"left"`
- `double` (可选): 是否双击，默认 `false`
- `displayId` (可选): 显示器 ID，如果指定，坐标相对于该显示器

**响应示例：**

```json
{
  "data": {
    "success": true
  },
  "code": 200,
  "message": "",
  "success": true
}
```

---

#### 8. 拖动鼠标

**POST** `/mouse/drag`

拖动鼠标（按下、移动、释放）。

**请求体：**

```json
{
  "startX": 100,
  "startY": 200,
  "endX": 300,
  "endY": 400,
  "duration": 100,
  "displayId": 0
}
```

**参数说明：**

- `startX` (必需): 起始 X 坐标
- `startY` (必需): 起始 Y 坐标
- `endX` (必需): 结束 X 坐标
- `endY` (必需): 结束 Y 坐标
- `duration` (可选): 拖动持续时间（毫秒），默认 `100`
- `displayId` (可选): 显示器 ID，如果指定，坐标相对于该显示器

**响应示例：**

```json
{
  "data": {
    "success": true
  },
  "code": 200,
  "message": "",
  "success": true
}
```

---

#### 9. 滚动鼠标

**POST** `/mouse/scroll`

在指定位置滚动鼠标。

**请求体：**

```json
{
  "x": 100,
  "y": 200,
  "direction": "down",
  "amount": 3,
  "displayId": 0
}
```

**参数说明：**

- `x` (必需): 目标 X 坐标
- `y` (必需): 目标 Y 坐标
- `direction` (可选): 滚动方向，可选值：`"up"` | `"down"`，默认 `"down"`
- `amount` (可选): 滚动量，默认 `3`
- `displayId` (可选): 显示器 ID，如果指定，坐标相对于该显示器

**响应示例：**

```json
{
  "data": {
    "success": true
  },
  "code": 200,
  "message": "",
  "success": true
}
```

---

#### 10. 获取像素颜色

**GET** `/mouse/pixel?x=<X坐标>&y=<Y坐标>&displayId=<显示器ID>`

获取指定位置的像素颜色。

**查询参数：**

- `x` (必需): X 坐标
- `y` (必需): Y 坐标
- `displayId` (可选): 显示器 ID，如果指定，坐标相对于该显示器

**响应示例：**

```json
{
  "data": {
    "x": 100,
    "y": 200,
    "color": "#FF0000"
  },
  "code": 200,
  "message": "",
  "success": true
}
```

---

#### 11. 获取屏幕尺寸

**GET** `/screen/size`

获取屏幕尺寸。

**响应示例：**

```json
{
  "data": {
    "width": 1920,
    "height": 1080
  },
  "code": 200,
  "message": "",
  "success": true
}
```

---

#### 12. 获取工作区文件列表

**GET** `/workspace/files?path=<子路径>&recursive=<是否递归>&format=<格式>&compact=&includeMeta=&maxDepth=`

获取工作区内的文件列表信息。

**查询参数：**

- `path` (可选): 子路径，相对于工作区根目录。不指定则列出工作区根目录
- `recursive` (可选): 是否递归列出所有子目录的文件，可选值：`true` | `false`，默认 `false`
- `format` (可选): 响应格式。`list`（默认）扁平列表；`tree` 嵌套 JSON 树；`treeText` 单段树形文本（**最省 token**，适合 AI 调用）
- `compact` (可选): 仅 `format=list` 时有效。`true` 时使用短键名 `n/r/d/s/t` 以省 token
- `includeMeta` (可选): 仅 `format=list` 时有效。`true` 时包含 `size`、`modifiedTime`，默认不含以省 token
- `maxDepth` (可选): 递归时的最大深度（正整数），如 `1` 仅当前层，`2` 当前层+一层子目录

**省 token 建议（AI 调用）：** 使用 `format=treeText` 或 `format=tree` 省 token，递归时最多返回 **600 条**（超过则只展示前 600 条，响应中带 `totalCount` 与 `truncated: true`）；`format=list` 时最多 30 条，超过会返回 400。若 list 结果超过 30 条，建议：1) 使用更具体的 `path` 缩小范围；2) 用 **POST /workspace/search** 按内容搜索；3) 使用 `format=tree` / `format=treeText` 可展示最多 600 条。

**权限与错误：** 若返回 403「没有读取该目录的权限」，表示该路径未在应用内授权；请在设置中为对应目录勾选读权限后再试。

**响应示例：**

```json
{
  "data": {
    "currentPath": "project",
    "files": [
      {
        "name": "README.md",
        "relativePath": "project/README.md",
        "isDirectory": false,
        "size": 1024,
        "modifiedTime": 1703123456789
      },
      {
        "name": "src",
        "relativePath": "project/src",
        "isDirectory": true,
        "modifiedTime": 1703123456789
      }
    ]
  },
  "code": 200,
  "message": "",
  "success": true
}
```

**响应字段说明：**

- `currentPath`: 当前目录路径（相对于工作区根目录）

**文件信息字段说明：**

- `name`: 文件或目录名称
- `relativePath`: 相对于工作区根目录的路径（使用 `/` 作为分隔符）
- `isDirectory`: 是否为目录
- `size`: 文件大小（字节），仅文件有此字段
- `modifiedTime`: 最后修改时间（时间戳，毫秒）

**示例：**

```
# 获取工作区根目录文件列表
GET http://192.168.1.100:28473/workspace/files

# 获取指定子目录的文件列表
GET http://192.168.1.100:28473/workspace/files?path=project/src

# 递归获取所有文件
GET http://192.168.1.100:28473/workspace/files?recursive=true

# 省 token：树形文本（适合 AI）
GET http://192.168.1.100:28473/workspace/files?recursive=true&format=treeText

# 省 token：紧凑列表
GET http://192.168.1.100:28473/workspace/files?recursive=true&format=list&compact=true
```

---

#### 13. 读取工作区文件

**GET** `/workspace/file?path=<文件路径>`

读取工作区内的文件内容。

**查询参数：**

- `path` (必需): 文件路径，可以是：
  - 绝对路径：文件的完整路径
  - 相对路径：相对于工作区根目录的路径

**响应示例（文本文件）：**

```json
{
  "data": {
    "fileName": "README.md",
    "relativePath": "project/README.md",
    "fileType": "text",
    "size": 1024,
    "content": "# Project\n\nThis is a project...",
    "language": "markdown"
  },
  "code": 200,
  "message": "",
  "success": true
}
```

**响应示例（媒体文件）：**

```json
{
  "data": {
    "fileName": "image.png",
    "relativePath": "project/image.png",
    "fileType": "image",
    "mimeType": "image/png",
    "size": 204800,
    "content": "data:image/png;base64,iVBORw0KGgoAAAANS...",
    "language": "image"
  },
  "code": 200,
  "message": "",
  "success": true
}
```

**响应字段说明：**

- `fileName`: 文件名
- `relativePath`: 相对于工作区根目录的路径（使用 `/` 作为分隔符）
- `fileType`: 文件类型，`text` | `image` | `video` | `audio`
- `mimeType`: MIME 类型（仅媒体文件有此字段）
- `size`: 文件大小（字节）
- `content`: 文件内容
  - 文本文件：直接返回文本内容
  - 媒体文件：返回 Base64 编码的 Data URL
- `language`: 文件语言类型（用于代码高亮）

**文件大小限制：**

- 文本文件：最大 10MB
- 媒体文件（图片/视频/音频）：最大 50MB

**示例：**

```
# 使用相对路径读取文件
GET http://192.168.1.100:28473/workspace/file?path=project/README.md

# 使用绝对路径读取文件
GET http://192.168.1.100:28473/workspace/file?path=D:\workspace\project\README.md
```

---

#### 14. 搜索工作区文件（ripgrep）

**POST** `/workspace/search`

在工作区内执行 ripgrep 搜索，默认正则匹配。

**请求体：**

```json
{
  "pattern": "function\\s+\\w+",
  "path": "project/src",
  "caseSensitive": true,
  "contextLines": 0,
  "glob": ["*.ts", "*.tsx"],
  "type": ["ts", "tsx"],
  "maxResults": 1000,
  "multiline": false
}
```

**参数说明：**

- `pattern` (必需): 正则表达式
- `path` (可选): 搜索起始路径（相对于工作区根目录），默认工作区根目录
- `caseSensitive` (可选): 是否区分大小写，默认 `true`
- `contextLines` (可选): 匹配前后上下文行数，默认 `0`，最大 `10`
- `glob` (可选): 文件 glob 过滤（字符串或数组）。支持大括号写法如 `**/*.{ts,tsx,js,jsx,vue}`，服务端会展开为多个 `-g` 以保证兼容性
- `type` (可选): ripgrep `-t` 类型过滤（字符串或数组，如 `ts`、`tsx`）
- `maxResults` (可选): 最大匹配条数，默认 `30`，上限 `50`
- `multiline` (可选): 是否启用多行正则匹配，默认 `false`

**响应说明：** 当匹配数为 0 时，响应中会包含 `executedCommand`（实际执行的 ripgrep 命令），便于排查「明明有却搜不到」的问题。

**排查 searchWorkspace 无结果：** 1) `pattern` 按正则解析，特殊字符需转义；2) `path` 所指目录需有读权限（否则 403）；3) 查看响应中的 `executedCommand` 在终端复现，确认路径、glob、编码无误；4) 中文等 Unicode 按 UTF-8 处理，一般无需额外配置。

**响应示例：**

```json
{
  "data": {
    "matches": [
      {
        "filePath": "project/src/app.ts",
        "lineNumber": 12,
        "lineText": "function foo() {",
        "submatches": [
          {
            "matchText": "function foo",
            "start": 0,
            "end": 12
          }
        ]
      }
    ],
    "truncated": false,
    "stats": {
      "matchCount": 1,
      "fileCount": 1
    },
    "searchRoot": "project/src"
  },
  "code": 200,
  "message": "",
  "success": true
}
```

**响应字段说明：**

- `matches`: 匹配结果数组
  - `filePath`: 相对于工作区根目录的路径
  - `lineNumber`: 行号
  - `lineText`: 行文本
  - `submatches`: 子匹配数组（文本与起止偏移）
  - `before` / `after`: 上下文行（当 `contextLines > 0` 时返回）
- `truncated`: 是否被 `maxResults` 截断
- `stats.matchCount`: 总匹配数（未截断）
- `stats.fileCount`: 命中文件数
- `searchRoot`: 搜索起始路径（相对于工作区根目录）

**示例：**

```
# 正则搜索 TypeScript 文件
curl -X POST http://192.168.1.100:28473/workspace/search \
  -H "Content-Type: application/json" \
  -d '{"pattern":"export\\s+class","path":"project/src","type":["ts","tsx"],"maxResults":200}'
```

---

## 使用示例

### JavaScript/TypeScript 示例

```typescript
// 获取截图
const response = await fetch('http://192.168.1.100:28473/screenshot')
const blob = await response.blob()
const imageUrl = URL.createObjectURL(blob)

// 获取显示器列表
const displaysResponse = await fetch('http://192.168.1.100:28473/displays')
const displays = await displaysResponse.json()

// 移动鼠标
await fetch('http://192.168.1.100:28473/mouse/move', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ x: 100, y: 200 })
})

// 点击鼠标
await fetch('http://192.168.1.100:28473/mouse/click', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ x: 100, y: 200, button: 'left' })
})
```

### cURL 示例

```bash
# 测试接口
curl http://192.168.1.100:28473/test

# 获取显示器列表
curl http://192.168.1.100:28473/displays

# 截图
curl http://192.168.1.100:28473/screenshot -o screenshot.png

# 移动鼠标
curl -X POST http://192.168.1.100:28473/mouse/move \
  -H "Content-Type: application/json" \
  -d '{"x": 100, "y": 200}'

# 点击鼠标
curl -X POST http://192.168.1.100:28473/mouse/click \
  -H "Content-Type: application/json" \
  -d '{"x": 100, "y": 200, "button": "left"}'

# 获取工作区文件列表
curl "http://192.168.1.100:28473/workspace/files?recursive=true"

# 读取工作区文件
curl "http://192.168.1.100:28473/workspace/file?path=project/README.md"
```

---

## 注意事项

1. **HTTP API 服务器**：默认端口为 `28473`，可在配置中修改
2. **安全性**：HTTP API 允许跨域访问，请确保在安全网络环境中使用
3. **文件权限**：文件管理器相关操作受工作区路径限制
4. **错误处理**：所有接口都返回统一的错误格式，请检查 `success` 字段
5. **显示器坐标**：如果指定 `displayId`，坐标将相对于该显示器的左上角
6. **工作区路径**：使用工作区文件接口前，需要先在应用中配置工作区路径
7. **路径安全**：工作区文件接口会自动检查路径是否在工作区内，防止路径遍历攻击
8. **文件大小限制**：文本文件最大 10MB，媒体文件最大 50MB
9. **隐藏文件**：文件列表接口会自动跳过以 `.` 开头的隐藏文件
