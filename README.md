# Electron Screenshot

基于 Electron + React + TypeScript 的桌面截图与效率工具。除本地截图外，提供 HTTP API 供外部调用截图、显示器信息、鼠标控制、工作区文件与终端执行等能力，并内置设置、文件管理、智能终端、自动更新等模块。

---

## 功能特性

### 截图

- **多种触发方式**
  - 全局快捷键：Windows/Linux `Ctrl+Alt+A`，macOS `Command+Shift+A`
  - 系统托盘：右键菜单「截图」或左键点击托盘后从主窗口操作
  - 悬浮触发器：屏幕右下角圆形按钮（可在设置中开关）
- **选区与输出**
  - 框选区域截图，支持复制到剪贴板或保存到本地
  - 多显示器适配，可指定显示器 ID 截取对应屏幕
- **HTTP API**
  - `GET /screenshot?displayId=<id>` 截取整屏，返回 PNG；不传 `displayId` 时截取主显示器
- **调试**
  - `GET /sources` 获取 desktopCapturer 屏幕源与显示器映射，便于调试

### 显示器与屏幕

- **显示器列表**：`GET /displays` 返回所有显示器的 id、bounds、scaleFactor
- **屏幕尺寸**：`GET /screen/size` 返回主屏宽高
- 鼠标相关 API 支持 `displayId`，坐标可相对于指定显示器

### 鼠标控制（HTTP API）

- **位置**：`GET /mouse/position` 当前鼠标坐标
- **移动**：`POST /mouse/move` 支持 `x,y,smooth,displayId`
- **点击**：`POST /mouse/click` 支持 `x,y,button(left|right|middle),double,displayId`
- **拖动**：`POST /mouse/drag` 指定起止坐标与 `duration`
- **滚动**：`POST /mouse/scroll` 指定坐标、方向（up/down）、滚动量
- **取色**：`GET /mouse/pixel?x=&y=&displayId=` 返回该点颜色（如 `#FF0000`）

### 工作区与文件

需在应用中配置**工作区路径**后可用；接口会做路径校验，防止越权访问。

- **文件列表**：`GET /workspace/files` 支持 `path`、`recursive`、`format`（list/tree/treeText）、`compact`、`includeMeta`、`maxDepth`，便于 AI 等场景省 token
- **读取文件**：`GET /workspace/file?path=` 支持相对/绝对路径，文本直接返回内容，媒体返回 Base64 Data URL；文本 10MB、媒体 50MB 限制
- **ripgrep 搜索**：`POST /workspace/search` 支持正则、路径、大小写、上下文行数、glob/type、maxResults、multiline 等

### 终端（HTTP API + 内置窗口）

- **执行命令**：`POST /terminal/execute` 请求体 `{ "command": "..." }`，返回 stdout/stderr/exitCode、解析结果与当前 cwd；支持简单链式（如 `cd a && cmd`）并维护 cwd
- **中断**：`POST /terminal/kill` 终止当前执行
- **会话**：`GET /terminal/session` 返回 sessionId、cwd、isRunning、history
- **内置智能终端窗口**：从托盘或主界面打开，与上述 API 共用同一会话能力

### 工具窗口

- **主窗口**：托盘左键点击显示/隐藏
- **设置**：工作区路径、开机自启、悬浮触发器、API 等配置；可从此处检查更新
- **打开工作区**：文件管理器窗口，浏览工作区目录
- **智能终端**：内置终端窗口
- **HTML 预览器**：代码/HTML 预览（从具备预览能力的界面打开）

### 自动更新

- 启动后延迟检查、每 24 小时定时检查、支持手动「检查更新」
- 下载进度、更新提示对话框、支持自动安装并重启
- 需配置更新服务器（如 `electron-builder.json` 的 `publish` 或环境变量 `UPDATE_SERVER_URL`），详见 `docs/当前在用/使用说明/AUTO_UPDATE.md`

### 其他

- **开机自启**：在设置中开关，生产环境生效
- **HTTP API 服务器**：默认 `http://127.0.0.1:28473`，可通过 `API_SERVER_HOST` 修改监听地址；可选 `API_SERVER_TOKEN` 启用 Bearer 鉴权
- **API 可用性测试**：`npm run test:api`，可配合 `API_BASE_URL`、`API_AUTH_TOKEN` 测试远程与鉴权
- **日志**：托盘菜单「查看日志」可打开日志目录

---

## 快捷键

| 平台 | 截图 |
|------|------|
| Windows / Linux | `Ctrl+Alt+A` |
| macOS | `Command+Shift+A` |

---

## 技术栈

- **Electron** — 桌面应用框架
- **React 19** — UI
- **TypeScript** — 类型
- **Vite** + **electron-vite** — 构建
- **electron-updater** — 自动更新
- **@nut-tree/nut-js** — 鼠标/屏幕控制
- **@vscode/ripgrep** — 工作区搜索
- **xterm** — 终端

---

## 快速开始

```bash
# 安装依赖（推荐 pnpm）
pnpm install

# 开发
pnpm run dev

# 构建
pnpm run build

# 打包（生成安装包）
pnpm run compile
```

使用 npm 时：

```bash
npm install
npm run dev
```

---

## 项目结构

```
electron-screenshot/
├── src/
│   ├── main/              # 主进程：窗口、托盘、截图、API 服务、更新等
│   │   ├── api-server/    # HTTP API 路由与 handlers
│   │   ├── ipc/           # IPC 通道与处理
│   │   ├── services/      # 终端、搜索、自启等
│   │   └── window/        # 窗口基类与配置
│   ├── renderer/          # 渲染进程（React 页面）
│   ├── preload/           # 预加载脚本
│   └── shared/            # 共享类型与工具
├── docs/                  # 文档
│   ├── API.md             # HTTP API 详细说明
│   ├── AUTO_UPDATE.md     # 自动更新配置与使用
│   └── openapi.json       # OpenAPI 描述（与 test:api 一致）
├── resources/             # 图标等资源
├── scripts/               # 构建与测试脚本
├── package.json
├── tsconfig.json
└── electron.vite.config.ts
```

---

## 文档

| 文档 | 说明 |
|------|------|
| [docs/当前在用/API与规范/API.md](docs/当前在用/API与规范/API.md) | HTTP API 完整说明、参数、示例与注意事项 |
| [docs/当前在用/使用说明/AUTO_UPDATE.md](docs/当前在用/使用说明/AUTO_UPDATE.md) | 自动更新配置、服务器要求与使用方式 |
| docs/历史与计划/UPGRADE_STATUS.md、UPGRADE_RECOMMENDATIONS.md | 升级与改造说明 |

---

## 发布与更新

```bash
# 仅生成安装包
pnpm run compile

# 生成安装包与 latest.yml（用于更新服务器）
pnpm run build:release
```

打包输出在 `release/`。Windows 使用 NSIS 安装包，mac 为 dmg，Linux 为 AppImage。

---

## License

MIT
