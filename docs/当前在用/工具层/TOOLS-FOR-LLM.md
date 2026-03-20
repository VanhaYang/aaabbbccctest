# 工具层接口说明（面向 LLM / 决策端）

本说明用于向 LLM 或决策端描述如何调用桌面工具。**推荐**：有多少方法就拆成多少接口，每个 HTTP 接口对应一个 function，请求体即该工具的 arguments，与 function calling 一一对应，避免参数混淆。

## 接口概览

- **列出工具**：`GET {baseUrl}/tools/list` → 返回 `data.toolIds` 列表（如 read, write, edit, exec, screenshot, mouse_move, mouse_click, apply_patch）。
- **按方法执行（推荐）**：每个工具一个接口，请求体即为该工具的 arguments，与 function calling 一一对应。
  - `POST {baseUrl}/tools/read` → body: `{ "path", "startLine?", "endLine?" }`
  - `POST {baseUrl}/tools/write` → body: `{ "path", "content", ... }`
  - `POST {baseUrl}/tools/edit` → body: `{ "path", "edits", ... }`
  - `POST {baseUrl}/tools/exec` → body: `{ "command", "workdir?", "timeout?" }`
  - `POST {baseUrl}/tools/screenshot` → body: `{ "displayId?" }`
  - `POST {baseUrl}/tools/mouse_move` → body: `{ "x", "y", ... }`
  - `POST {baseUrl}/tools/mouse_click` → body: `{ "x", "y", ... }`
  - `POST {baseUrl}/tools/apply_patch` → body: `{ "input" }`
- **统一入口（兼容）**：`POST {baseUrl}/tools/execute`，请求体为 `{ "toolId": "read"|"write"|..., "arguments": { ... } }`。推荐优先用按方法拆开的接口。

响应格式统一为：`{ "success": true/false, "code": 200/4xx/5xx, "message": "...", "data": ... }`。失败时 `data` 可能为空，错误信息在 `message`。

---

## 各 toolId 的 arguments 说明

| toolId | 说明 | arguments 字段（均为 JSON 对象） |
|--------|------|----------------------------------|
| **read** | 读取工作区文件内容 | `path`(必填, string)：文件路径，相对工作区或绝对。`startLine`(可选, int≥1)、`endLine`(可选, int≥1)：按行范围。 |
| **write** | 写入/覆盖工作区文件 | `path`(必填)、`content`(必填, string)。可选：`encoding`(默认 utf-8)、`overwrite`(默认 false)、`createParentDirs`(默认 true)、`baseHash`(乐观锁)。 |
| **edit** | 精准编辑工作区文件 | `path`(必填)、`edits`(必填, array)：元素为 range `{ type, startLine, endLine, newText }` 或 anchor `{ type, oldText, newText }` 等。可选：`strict`(默认 true)、`baseHash`、`encoding`。 |
| **exec** | 执行 shell 命令 | `command`(必填, string)。可选：`workdir`(string)、`timeout`(int, 毫秒)。 |
| **screenshot** | 截屏并返回 PNG | 可选：`displayId`(int)，不传则主显示器。 |
| **mouse_move** | 移动鼠标 | `x`(必填, number)、`y`(必填, number)。可选：`smooth`(默认 false)、`displayId`(int)。 |
| **mouse_click** | 点击鼠标 | `x`(必填)、`y`(必填)。可选：`button`("left"\|"right", 默认 "left")、`double`(默认 false)、`displayId`。 |
| **apply_patch** | 应用统一 patch 文本 | `input`(必填, string)：含 `*** Begin Patch` / `*** End Patch` 的 patch 全文。 |

说明：带 `displayId` 的工具在传入有效 `displayId` 时，坐标或截屏针对该显示器；未传或无效时使用主显示器或全局坐标。

---

## 请求示例

**读文件（全文）：**
```json
{
  "toolId": "read",
  "arguments": { "path": "src/main/index.ts" }
}
```

**读文件（指定行范围）：**
```json
{
  "toolId": "read",
  "arguments": { "path": "package.json", "startLine": 1, "endLine": 10 }
}
```

**写文件：**
```json
{
  "toolId": "write",
  "arguments": {
    "path": "docs/note.txt",
    "content": "Hello world",
    "createParentDirs": true
  }
}
```

**执行命令：**
```json
{
  "toolId": "exec",
  "arguments": { "command": "npm run build", "workdir": "D:\\my-project" }
}
```

**截屏（主显示器）：**
```json
{
  "toolId": "screenshot",
  "arguments": {}
}
```

**鼠标移动并点击：**
```json
{
  "toolId": "mouse_move",
  "arguments": { "x": 100, "y": 200 }
}
```
```json
{
  "toolId": "mouse_click",
  "arguments": { "x": 100, "y": 200, "button": "left" }
}
```

**应用 patch：**
```json
{
  "toolId": "apply_patch",
  "arguments": {
    "input": "*** Begin Patch\n*** Update File: src/foo.ts\n@@ -1,3 +1,4 @@\n line1\n+line2\n line3\n*** End Patch"
  }
}
```

**按方法调用示例（推荐）**：直接 POST 到对应路径，body 即该工具参数。
```bash
# 读文件
curl -X POST http://host:port/tools/read -H "Content-Type: application/json" -d '{"path":"src/index.ts"}'
# 写文件
curl -X POST http://host:port/tools/write -H "Content-Type: application/json" -d '{"path":"docs/note.txt","content":"Hello"}'
# 执行命令
curl -X POST http://host:port/tools/exec -H "Content-Type: application/json" -d '{"command":"npm run build"}'
```

---

## 两套接口怎么办（读写、终端、截图等）

当前存在两套能力重叠的接口：

| 能力 | 传统 REST（先有） | 工具层（与 OpenClaw 对齐） |
|------|-------------------|----------------------------|
| 读文件 | `GET /workspace/file?path=...` | `POST /tools/read` body: `{ path, startLine?, endLine? }` |
| 写文件 | `POST /workspace/write` | `POST /tools/write` body: `{ path, content, ... }` |
| 精准编辑 | `POST /workspace/edits` | `POST /tools/edit` body: `{ path, edits, ... }` |
| 执行命令 | `POST /terminal/execute` | `POST /tools/exec` body: `{ command, workdir?, timeout? }` |
| 截图 | `GET /screenshot` | `POST /tools/screenshot` body: `{ displayId? }`（返回 JSON 含 base64） |
| 鼠标 | `POST /mouse/move`、`/mouse/click` 等 | `POST /tools/mouse_move`、`POST /tools/mouse_click` |

**建议**：

1. **面向 LLM / 决策端**：只使用 **工具层** 这一套。优先用 **按方法拆开的** `POST /tools/read`、`POST /tools/write`、`POST /tools/exec` 等，每个接口的 body 就是该工具的 schema，与 function calling 一一对应，不混参数。需要时仍可用 `POST /tools/execute` 统一入口。
2. **传统 REST 保留**：`/workspace/*`、`/terminal/*`、`/screenshot`、`/mouse/*` 保留给已有脚本、人类调试或不需要「工具层」语义的调用方；与工具层**同一套实现**，只是暴露路径不同。
3. **后续可收敛**：若希望只维护一套入口，可逐步将调用方迁到 `/tools/*`，再在文档中标记传统路径为兼容/弃用；或长期两套并存、在文档中标明分工。

---

## OpenClaw 的调用方式与如何避免「参数混淆 / 幻觉」

### OpenClaw 是怎么做的

OpenClaw 对 **LLM 暴露的不是「一个执行接口 + toolId + arguments」**，而是 **多个独立的「function」**：

- 每个工具对应一个 function：`read`、`write`、`edit`、`exec`、`apply_patch` 等各自是单独的 function。
- 每个 function 有 **自己的** `name` 和 **自己的** `parameters`（JSON Schema）。例如：
  - function `read` 的 parameters 只有 `path`、`startLine`、`endLine`；
  - function `write` 的 parameters 只有 `path`、`content`、`encoding`、`overwrite` 等。
- 模型做的是 **原生 function calling**：先选「要调哪个 function」，再按 **该 function 的 schema** 填参数。  
  因此模型不会「选 read 却填 write 的 content」——因为 read 的 schema 里根本没有 `content` 这个字段，binding 是由 **function 名字 + 该 function 的 parameters 定义** 决定的。

执行时，OpenClaw 内部根据 **被调用的 function 名字** 找到对应工具实现并执行；HTTP 网关（如 `/tools/invoke`）收到的也是 `tool`（名字）+ `args`（该工具的参数），由服务端按名字分发。

### 我们这边：单入口 + toolId + arguments 的风险

本机工具层是 **一个入口** `POST /tools/execute`，body 为 `{ "toolId": "read"|"write"|... , "arguments": { ... } }`。

若决策端直接把「只有这一个接口 + 一张大表写清各 toolId 的 arguments」交给 LLM（例如只靠 system prompt 或一段自然语言），模型有可能：

- 选对了 `toolId: "read"` 却填了 `arguments: { path, content }`（把 write 的 content 带进来），或  
- 选 `toolId: "write"` 却只传 `path` 没传 `content`，或  
- 其他「toolId 与 arguments 不匹配」的情况。

也就是说，**单入口 + 通用 arguments 对象** 在「只靠自然语言约束」时，确实比「多 function、每个带独立 schema」更容易出现参数混淆或幻觉。

### 推荐做法：按方法拆开的接口与 function calling 一一对应

本机已提供 **按方法拆开的接口**：`POST /tools/read`、`POST /tools/write`、`POST /tools/edit`、`POST /tools/exec`、`POST /tools/screenshot`、`POST /tools/mouse_move`、`POST /tools/mouse_click`、`POST /tools/apply_patch`。每个接口的 **请求体即该工具的 arguments**，与 function calling 一一对应：

1. 决策端为每个 tool 建一个 function 给 LLM，name 即 toolId，parameters 用本页表格或 OpenAPI 的 `Tool*Arguments`。
2. LLM 输出 (function name, arguments) 后，决策端直接 **POST /tools/{name}**，body 即 **arguments**，无需再包一层 `toolId`/`arguments`。
3. 这样「选哪个 function」=「调哪个 URL」，参数与接口绑定清晰，不会出现「写的参数被 AI 传成读的参数」。

仍可使用 `POST /tools/execute`，body 为 `{ "toolId", "arguments" }`，作为兼容或单入口场景。

### 服务端可做的兜底

本机在执行时可按 `toolId` 对 `arguments` 做 **schema 校验**（与 OpenAPI 中各 `Tool*Arguments` 一致），不合法则返回 400 并提示缺少/多余字段。这样即使决策端或模型出错，也不会误执行错误参数。

---

## 如何给 LLM 用

1. **推荐：按方法拆开的接口**  
   决策端为每个 tool 建一个 function，name 即 toolId，parameters 按上表或 OpenAPI 转成 JSON Schema。LLM 输出 (name, arguments) 后，决策端请求 **POST /tools/{name}**，body 即 arguments。与 function calling 一一对应，不混参数。
2. **兼容：统一入口**  
   也可将 (name, arguments) 转成 `POST /tools/execute` 的 `{ "toolId": name, "arguments": arguments }`。
3. **OpenAPI**  
   - **工具层**：`docs/当前在用/API与规范/openapi-tools.json`（仅含 /tools/list、/tools/execute、/tools/read、/tools/write 等工具接口及 Tool*Arguments schema）。  
   - **传统 REST**：`docs/当前在用/API与规范/openapi-rest.json`（截图、鼠标、终端、工作区等）。  
   完整合并版见 `docs/当前在用/API与规范/openapi.v2.json`。两套由 `scripts/split-openapi.mjs` 从该文件拆出。
