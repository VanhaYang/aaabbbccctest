# Electron Screenshot × OpenClaw 工具层融合方案

## 1. 目标与前提

- **AI 决策在外部**：已有 AI 决策平台（如 OpenClaw Gateway 或其他）负责理解用户意图、选工具、传参。

- **桌面只做执行**：Electron Screenshot 通过 **HTTP 起服务**，三方决策需要工具调用时，请求本机 API，由桌面端执行并返回结果。
- **丰富工具能力**：参考 OpenClaw 的工具执行层，在 electron-screenshot 中实现更多、与 OpenClaw 语义一致的工具，便于决策平台「同一套工具描述」既可调 OpenClaw 也可调桌面。
- **分层隔离、便于同步**：OpenClaw 更新较频繁，需做好分层，使 OpenClaw 侧代码**迁移过来即用或仅做少量适配**，新功能可平滑迁移。

---

## 2. 为什么 Electron Screenshot 用 HTTP 暴露工具

- 决策在远端/本机另一进程，执行在本机 Electron 进程，**进程边界**用 HTTP 最直接。
- 任意语言/平台的决策端都能用同一套 REST 约定调用，无需依赖 Electron/Node 的进程间协议。
- 你已有「决策平台 → 调工具」的架构，HTTP 是自然接口；桌面端只实现「工具执行层」，不负责会话、模型、多轮逻辑。

---

## 3. 整体分层（三层 + 一层适配）

```
┌─────────────────────────────────────────────────────────────────┐
│  Layer 0: 决策平台（外部）                                        │
│  OpenClaw Gateway / AIConsole 平台 → 决定调用哪个工具、传什么参数      │
│  通过 HTTP 调用 electron-screenshot 的 API                       │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  Layer 1: HTTP API（electron-screenshot 现有 + 可选统一入口）      │
│  - 保留现有路由：/screenshot, /mouse/*, /terminal/*, /workspace/*  │
│  - 可选：POST /tools/execute { toolId, arguments } 统一入口         │
│  - 职责：鉴权、路由、请求/响应格式，不包含具体工具逻辑               │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  Layer 2: 工具注册表 + 调度器（新增，electron-screenshot 内）       │
│  - 维护 toolId → 执行器的映射                                      │
│  - 参数校验、调用执行器、统一返回格式                                │
│  - 与 OpenClaw tool-catalog 的 id/参数约定对齐，便于决策端复用 schema │
└─────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
┌───────────────────────────────┐   ┌───────────────────────────────────┐
│  Layer 3a: 原生执行器（现有）   │   │  Layer 3b: OpenClaw 风格执行器     │
│  - 直接调现有 services：       │   │  - 实现与 OpenClaw 一致的参数语义   │
│    截图、鼠标、终端、工作区     │   │  - 实现方式二选一：                 │
│  - 包装成「工具」统一接口       │   │    (1) 调 Layer 3a / 现有 API      │
│                               │   │    (2) 迁入 OpenClaw 代码+适配层   │
└───────────────────────────────┘   └───────────────────────────────────┘
                                                    │
                                    ┌───────────────┴───────────────┐
                                    ▼                               ▼
                    ┌───────────────────────────┐   ┌───────────────────────────────┐
                    │  Adapter：桌面能力桥接     │   │  OpenClaw 迁移代码（隔离目录） │
                    │  - getWorkspaceRoot()     │   │  - 仅放「可独立运行」的 tool   │
                    │  - runCommand()           │   │  - 通过 adapter 访问 fs/exec   │
                    │  - readFile / writeFile   │   │  - 不依赖 Gateway/通道/会话    │
                    │  - screenshot / mouse     │   │  - 便于 git subtree/copy 同步  │
                    └───────────────────────────┘   └───────────────────────────────┘
```

- **Layer 1**：你现有的 API server 不变，只增加「可选」的统一入口。
- **Layer 2**：新增「工具层」：注册表 + 调度器，与 OpenClaw 的 tool id / 参数约定对齐。
- **Layer 3a**：现有 handler 包装成「工具执行器」，实现统一接口。
- **Layer 3b**：新增/迁移的 OpenClaw 风格工具，通过 **Adapter** 访问桌面能力，或直接调 3a；OpenClaw 源码放在**独立目录**，通过适配层对接，减少改上游代码。

---

## 4. 工具契约（与 OpenClaw 对齐）

- 每个工具在 electron-screenshot 内有一个 **id**（与 OpenClaw `tool-catalog` 的 id 一致更佳，如 `read` / `write` / `edit` / `exec`）。
- 请求体建议统一为：
  - 现有方式：继续用现有 REST 路径与 body（如 `/workspace/file?path=...`）。
  - 统一入口方式：`POST /tools/execute` 或 `POST /v1/tools/execute`，body 如：
    ```json
    { "toolId": "read", "arguments": { "path": "src/index.ts" } }
    ```
- 返回格式与现有 API 一致：`{ data, code, message, success }`；`data` 内为工具执行结果（如 read 返回内容，exec 返回 stdout/exitCode 等），便于决策平台解析。

这样决策端可以：

- 用同一套「工具定义」（name + parameters schema）生成调用；
- 对「桌面执行」的工具，请求发到 electron-screenshot；
- 对会话/消息/网关等工具，请求仍发 OpenClaw。

---

## 5. 哪些工具放在桌面端（electron-screenshot）


| OpenClaw 工具 id   | 是否适合桌面执行     | electron-screenshot 现状 / 建议                |
| ---------------- | ------------ | ------------------------------------------ |
| read             | ✅ 适合         | 有 /workspace/file，可包装为工具 read              |
| write            | ✅ 适合         | 有 /workspace/write，可包装为 write              |
| edit             | ✅ 适合         | 有 /workspace/edits，可包装为 edit               |
| apply_patch      | ✅ 适合         | 可迁移 OpenClaw apply-patch 或自实现，依赖 workspace |
| exec             | ✅ 适合         | 有 /terminal/execute，可包装为 exec              |
| process          | ✅ 可选         | 可后续加「后台进程管理」或先不实现                          |
| screenshot       | ✅ 桌面独有       | 已有 /screenshot，可登记为工具                      |
| mouse/*          | ✅ 桌面独有       | 已有，可登记为 move/click/scroll 等                |
| web_search       | ❌ 通常不在桌面     | 建议留在决策平台或网关                                |
| web_fetch        | ❌ 同上         | 同上                                         |
| memory_*         | ⚠️ 看实现       | 若为本地文件/向量库，可放桌面；否则留平台                      |
| sessions_*       | ❌ 依赖 Gateway | 不迁，仍由 OpenClaw 提供                          |
| message          | ❌ 依赖通道       | 不迁                                         |
| browser / canvas | ⚠️ 可选        | 若桌面需控浏览器可后续接 Playwright 等                  |
| nodes            | ⚠️ 可选        | node.invoke 可指向本机或调 electron-screenshot    |
| cron / gateway   | ❌ 依赖 Gateway | 不迁                                         |
| image / tts      | ⚠️ 可选        | 可后续在桌面提供轻量实现                               |


**建议首期**：在 electron-screenshot 实现并暴露 **read / write / edit / exec**（与 OpenClaw 参数一致），再加 **screenshot / mouse** 等已有能力，统一进「工具层」。apply_patch 可作为第二批，用迁移或自实现。

---

## 6. 目录与代码隔离（便于迁移 OpenClaw）

建议在 electron-screenshot 内划出**独立命名空间**，专门放「来自或对齐 OpenClaw 的」工具逻辑，与现有业务解耦：

```
electron-screenshot/
  src/main/
    api-server/           # Layer 1：保持不变 + 可选 /tools/execute
      server.ts
      handlers/           # 现有 handlers 可逐步改为「调用 Layer 2」
    tools/                # Layer 2 + 3：新增
      registry.ts         # 工具注册表：toolId -> executor
      dispatcher.ts       # 解析请求、调 executor、统一响应
      types.ts            # ToolExecutor, ToolResult 等
      executors/          # Layer 3a：原生执行器（包装现有能力）
        read.ts           # 调 workspace 读文件
        write.ts
        edit.ts
        exec.ts           # 调 terminal 执行
        screenshot.ts
        mouse.ts
      openclaw/           # Layer 3b：OpenClaw 迁移/适配（隔离区）
        adapter.ts        # 桌面能力桥接：getWorkspaceRoot, runCommand, readFile, writeFile, screenshot, mouse
        apply-patch.ts    # 从 openclaw 迁入或复制，仅依赖 adapter
        # 以后可加：memory-search.ts 等，仅依赖 adapter
```

- **不**把整个 OpenClaw 仓库拉进来；只复制或 git subtree 你需要的**单文件/模块**（如 `apply-patch`、tool 定义）到 `tools/openclaw/`。
- OpenClaw 里依赖的「工作区路径、执行命令、读写的抽象」在 electron-screenshot 里用 **adapter** 实现（adapter 内部调现有 configManager、terminalExecutionService、workspace handlers）。
- 这样 OpenClaw 更新时，你只需更新 `tools/openclaw/` 下对应文件，并检查 adapter 接口是否仍满足，尽量不改 electron-screenshot 其它层。

---

## 7. Adapter 接口（桌面能力桥接）

让 OpenClaw 迁过来的代码**只依赖一层薄接口**，而不是直接依赖 Electron 或现有业务逻辑：

```ts
// src/main/tools/openclaw/adapter.ts

export interface DesktopBridge {
  getWorkspaceRoot(): string;
  runCommand(command: string, options: { cwd?: string; timeoutMs?: number }): Promise<{ stdout: string; stderr: string; exitCode: number }>;
  readFile(relativePath: string): Promise<string>;
  writeFile(relativePath: string, content: string): Promise<void>;
  // 可选：截图、鼠标，供后续 browser/automation 类工具用
  screenshot?(displayId?: number): Promise<Buffer>;
  mouseMove?(x: number, y: number): void;
  mouseClick?(button: 'left' | 'right', x?: number, y?: number): void;
}
```

- 在 electron-screenshot 里用 **configManager、terminalExecutionService、workspace 的读/写/编辑** 实现 `DesktopBridge`。
- 迁入的 OpenClaw 代码（如 apply_patch）只接收 `DesktopBridge`，不引用 Gateway、不引用 OpenClaw 的 config/channels。这样 OpenClaw 仓库改动时，多数变更不会影响 adapter 契约，只需在隔离区内更新实现。

---

## 8. OpenClaw 更新频率与同步策略

- 从 openclaw-cn 的提交历史看，既有上游合并也有社区自己的更新（如 wechat、安装脚本等），**更新会比较频繁**。
- **建议**：
  - 只同步「工具执行相关」的少量目录/文件（如 `agents/apply-patch.ts`、`agents/tools/` 下部分、或 pi-coding-agent 的 read/write/edit 约定），不要整库依赖。
  - 在 electron-screenshot 用 **只读副本 + 适配层**：把需要用的 OpenClaw 文件复制到 `tools/openclaw/`，在文件头注释注明来源与版本，便于日后 diff 与合并。
  - 若某工具在 OpenClaw 里依赖较多（如 sessions、config、channel），则**不迁**，只在桌面实现「参数与 OpenClaw 一致」的版本，内部用现有 electron-screenshot 能力实现（即「对齐契约，实现自管」）。

---

## 9. 实施顺序建议

1. **Phase 1：工具层骨架**
  - 新增 `src/main/tools/`：`types.ts`、`registry.ts`、`dispatcher.ts`。
  - 实现「原生」执行器：read、write、edit、exec、screenshot、mouse，只做「从现有 handler 转发到执行器」。
  - 可选：增加 `POST /tools/execute`，或先在现有路由上挂「工具 id」查询参数/body 字段，保持兼容。
2. **Phase 2：与 OpenClaw 参数对齐**（已完成）
  - 为 read/write/edit/exec 定义与 OpenClaw 一致的参数名与 schema（path、content、edits、command、workdir 等）。
  - 在 openapi.json 中新增 `GET /tools/list`、`POST /tools/execute` 及 `ToolExecuteRequest`、各工具 Arguments schema，并注明「与 OpenClaw tool-catalog 约定对齐」，方便决策端复用。
3. **Phase 3：OpenClaw 迁移区 + Adapter**（已完成）
  - 已建 `tools/openclaw/adapter.ts`，实现 `DesktopBridge`（getWorkspaceRoot、runCommand、readFile、writeFile、remove、mkdirp、screenshot、mouseMove、mouseClick），内部使用 configManager、pathGuards、terminalExecutionService、screenshotManager、mouseController。
  - 已迁入 apply_patch：`tools/openclaw/apply-patch.ts` 与 `apply-patch-update.ts`（逻辑与格式来自 openclaw-cn，仅依赖 DesktopBridge），并通过 `tools/executors/apply-patch.ts` 注册为工具 `apply_patch`，支持 `POST /tools/execute` 调用。
4. **Phase 4：按需扩展**
  - 增加 process、image、memory 等，要么在 3a 用现有能力实现，要么在 3b 用 OpenClaw 代码 + adapter 实现。

---

## 10. 文件读写：两边对比与是否复用 OpenClaw

### 10.1 会重复造轮子吗？

- **不会完全重复**：你已有的是「HTTP API + 工作区内的读写编辑」；OpenClaw 的是「Agent 工具层里的 read/write/edit + 路径与安全策略」。  
- 若**只做工具丰富化**：在 electron-screenshot 里加「工具注册 + 执行器」，现有读写继续用你的实现，只是多一层对 OpenClaw 参数约定的适配，不算重复造轮子。  
- 若**因为当前读写 bug 多、想换更稳的实现**：可以**只把「路径解析 + 安全校验 + 读写/编辑逻辑」换成 OpenClaw 那套**，HTTP 入口、权限模型仍保留你的，这样也不是重复造轮子，而是**替换底层实现**。

下面是对比和推荐。

### 10.2 路径解析与安全


| 维度                            | electron-screenshot                                                                                                                 | OpenClaw                                                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **路径是否逃逸工作区**                 | 先 `normalize`，再 `normalizedPath.includes('..')` 直接拒绝；再 `path.join(workspace, normalizedPath)`，最后用 `isPathInWorkspace(filePath)` 判断。 | 先 `path.resolve(cwd, path)` 得到绝对路径，再用 `path.relative(root, resolved)`，若 `relative.startsWith('..')` 或为绝对路径则拒绝。     |
| **已知问题（electron-screenshot）** | `normalizedPath.includes('..')` 会误杀**文件名里带 `..`** 的合法路径（如 `my..file.txt`、`file..ext`）。                                              | 用「解析后的相对路径是否以 `..` 开头」判断，不会误杀 `file..txt`。                                                                         |
| **Windows**                   | 用 `resolvedFilePath.startsWith(resolvedWorkspace + path.sep)`，一般正确；未统一用 `path.relative` 做「是否在根下」判定。                                 | `infra/path-guards.ts` 里用 `path.relative` + `startsWith('..')`，且 Windows 上对 root/target 做 `toLowerCase()` 再比较，更稳妥。 |
| **符号链接**                      | 未做「符号链接逃逸」检查。                                                                                                                       | `sandbox-paths` 里有 `assertNoSymlinkEscape`，防止通过 symlink 逃出工作区。                                                     |
| **~ 与 Unicode**               | 未处理 `~`、未做 Unicode 空格规范化。                                                                                                           | `expandPath` 支持 `~` / `~/`；路径先做 Unicode 空格规范化。                                                                     |


结论：**路径与安全这块 OpenClaw 更完善**，尤其是「合法含 `..` 的文件名」和「符号链接逃逸」；你这边有明确 bug（误拒 `..` 文件名）和缺失（symlink、~）。

### 10.3 读文件（read）


| 维度      | electron-screenshot                                 | OpenClaw                                                                               |
| ------- | --------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **能力**  | 支持按 path、startLine/endLine、文本/媒体、10MB 限制、hash、行尾检测。 | 基于 pi-coding-agent 的 read + 自研包装：分页/limit/offset、大文件截断提示、图片尺寸/类型限制、MIME 检测、与模型上下文窗口适配。 |
| **复杂度** | 逻辑集中在一个 handler 里，易读；边界（行号、媒体大小）有校验。                | 功能更多（分页、续读、图片安全），依赖 pi-coding-agent；你的场景若不需要「按 token 分页」可以不必全搬。                        |


结论：**若只做「桌面工具」读文件**，你现有实现够用，但**路径解析建议换成 OpenClaw 那套**（见下）；若以后要做「大文件分页、续读」再考虑借鉴 OpenClaw 的 read 包装。

### 10.4 写文件（write）


| 维度       | electron-screenshot                                         | OpenClaw                                                |
| -------- | ----------------------------------------------------------- | ------------------------------------------------------- |
| **能力**   | 支持 overwrite、createParentDirs、atomic、baseHash 乐观锁、encoding。 | write 来自 pi-coding-agent；OpenClaw 侧主要做 workspace 守卫和策略。 |
| **原子写入** | 有（临时文件 + rename + 失败回滚）。                                    | 上游实现类似。                                                 |


结论：**写文件两边都能用**；同样建议**路径与安全用 OpenClaw 的解析 + 是否在 workspace 内的判定**，避免 `..` 文件名等 bug。

### 10.5 编辑（edit / edits）


| 维度       | electron-screenshot                                                                  | OpenClaw                                                                               |
| -------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| **编辑格式** | 支持 range（startLine/endLine/newText）和 anchor（before/after/oldText/newText），strict 模式。 | edit 来自 pi-coding-agent；另有 apply_patch（*** Begin Patch / Add / Update / Delete 等）完整格式。 |
| **实现**   | 自研 `applyEditsToContent`，行尾 `\r\n`/`\n` 有考虑。                                         | apply_patch 实现完整，适合从模型直接来的 patch。                                                      |


结论：**编辑语义你已有**，可继续用；若决策端要发「OpenAI 风格 patch」，可单独接 OpenClaw 的 `apply_patch`（通过 adapter 调你的 workspace 根与读写），不必重写整块。

#### 10.5.1 为什么 OpenClaw / apply_patch 没有「edits 字符串覆盖整文件」问题（可借鉴点）

- **apply_patch 的约定**：只有一个参数 `input`（字符串），语义唯一 = 「*** Begin Patch … *** End Patch」格式的 patch 正文。解析要么成功并应用，要么抛错（如 `Invalid patch: input is empty`），**从不会把原始字符串当作文件内容写入**。即：**一种格式、一种含义，解析失败即报错，无「整文件替换」回退**。
- **electron-screenshot 的 edit 原先的坑**：`edits` 支持两种形态——(1) JSON 数组字符串，或 (2) 纯文本时当作「整文件替换」的 newText。当 (1) 解析失败（如 AI 生成 JSON 时 `newText` 内双引号未转义）时，代码回退到 (2)，误把整段「编辑指令 JSON」写入文件。
- **可借鉴做法**（已落实）：
  1. **edit 工具**：`edits` 为字符串时**仅**表示「JSON 数组」一种含义；`JSON.parse` 失败即返回 400，**不再**做「整段字符串当整文件替换」的回退，与 apply_patch 的单一语义一致。
  2. **推荐**：HTTP 调用时请求体用标准 JSON，**直接传 `edits` 为数组**（不要传 stringified 的 JSON 字符串），这样服务端收到即数组，无需 parse，从源头避免歧义与转义问题。
  3. **可选**：若决策端更习惯「一段 patch 文本」，可引导使用 `apply_patch` 工具（单一字符串、单一语义、无歧义回退）。

### 10.6 建议：用 OpenClaw 的路径与安全，保留你的 API

- **不必整体废弃你的读写系统**：HTTP 接口、权限模型（filePermissionManager）、返回格式都保留。  
- **建议替换/引入的**：  
  1. **路径解析与「是否在工作区内」**：用 OpenClaw 的 `path.relative` + `startsWith('..')` 模式（或直接复用 `infra/path-guards.ts` 的 `isPathInside`），并**去掉** `normalizedPath.includes('..')` 这种判断，这样既修掉「文件名含 `..` 被拒」的 bug，又和 OpenClaw 行为一致。
  2. **可选**：若需要「符号链接不能逃出工作区」，再引入 OpenClaw 的 `assertNoSymlinkEscape`（或等价逻辑）。
  3. **可选**：若希望和 OpenClaw 的 read/write/edit 参数完全一致，可在你现有 handler 里先做「参数映射」，再调一层**用 OpenClaw 路径与安全封装过的**读写（即：你的 HTTP 层 → 薄适配层 → OpenClaw 风格 resolve + 读/写/编辑），这样决策端同一套参数可复用于桌面。

这样**不是重复造轮子**：你保留 API 和产品形态，只把「容易出 bug 的路径与安全」和（按需）「编辑/patch 逻辑」换成 OpenClaw 那套，减少维护成本并修掉已知问题。

### 10.7 若你希望「直接沿用 OpenClaw 的读写实现」

- OpenClaw 的 read/write/edit 实现在 **pi-coding-agent**（npm 包）和 **openclaw 自研包装**（pi-tools.read.ts、apply-patch 等）里，且依赖 workspace root、cwd、sandbox 等上下文。  
- 做法可以是：在 electron-screenshot 里做一个 **DesktopBridge**，提供 `getWorkspaceRoot()`、`readFile(relativePath)`、`writeFile(relativePath, content)` 等；然后**只迁入 OpenClaw 的路径与安全**（sandbox-paths、path-guards），在你自己的 read/write/edit handler 里先 `resolveSandboxPath` / `assertSandboxPath`，再读写的用你现有 fs 或薄封装。这样 OpenClaw 的「工具实现」不必整块迁，你只是**采用他们的路径与安全策略**，读写仍可以是你的实现。  
- 若将来要整块用 pi-coding-agent 的 read/write/edit：需要把这些工具跑在「有 workspace root 和 cwd」的上下文中，通过你的 Bridge 提供 fs；那时代码量会大一些，但路径与安全可以完全沿用上游。

**总结**：  

- **代码质量上**：OpenClaw 的路径解析与安全更完善，你的实现有明确 bug（`..` 文件名）和缺失（symlink、~）。  
- **是否重复造轮子**：不重复——要么只「换掉路径与安全」并保留你的读写，要么在适配层上按需接 OpenClaw 的 apply_patch/read 包装。  
- **建议**：**先采用 OpenClaw 的路径与「是否在工作区内」判定**（修 bug + 对齐行为），保留现有 HTTP 与读写接口；若仍有很多 bug 再考虑把读写核心也逐步换成 OpenClaw 那套（通过 Bridge 接入）。

---

## 11. 小结

- **HTTP 保留**：决策平台通过 HTTP 调 electron-screenshot，桌面只做执行层，符合你当前架构。
- **工具丰富化**：用「工具注册表 + 执行器」在 electron-screenshot 内实现与 OpenClaw 语义一致的工具（先 read/write/edit/exec + 截图/鼠标），再按需加 apply_patch 等。
- **分层隔离**：HTTP → 工具调度 → 原生执行器 / OpenClaw 风格执行器 → Adapter + 隔离目录，这样 OpenClaw 代码迁移过来即用或只改适配层，便于后续平滑迁移新功能。

如果你愿意，下一步可以在 `src/main/tools/` 下按 Phase 1 先加 `registry`、`dispatcher` 和 2～3 个原生执行器（例如 read、exec、screenshot），再一起对一下和 OpenClaw 的参数约定。