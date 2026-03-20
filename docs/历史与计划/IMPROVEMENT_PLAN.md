# electron-screenshot 分块完善实施计划

## 前置：计划文档

- **产出**：本文档为计划全文（含各块范围、测试策略、通过标准）。
- **确认**：确认后再按块执行实现与测试。

---

## 执行原则

- 严格按块顺序执行：**块 N 测试全部通过后，再开始块 N+1**。
- 每块包含：实现改动 + 本块测试集；测试位置见下表。
- 现有脚本：`pnpm test`（Vitest，`src/**/*.test.ts`）、`pnpm test:api`（API 可用性）。

---

## 块 1：主进程全面使用 Logger，去掉 console

**目标**：主进程可追溯问题、便于用户提供日志；不再直接使用 `console`。

**范围**：

- 主进程入口与各模块：将 `console.log/error/warn` 替换为 `src/main/logger.ts` 导出的 logger（`asyncLog` 或 `syncLog`，按需选用）。
- 涉及文件：约 30 个，集中在 `src/main` 下（如 index.ts、mainWindow.ts、各 ipc、api-server、services、窗口与 tray 等）。
- 入口处 `initializeLogger()` 之前若需输出，可保留极少量 console 或改为先初始化 logger 再打日志。

**测试**：

- **位置**：`src/main/logger.logger.test.ts`（新建）。
- **内容**：对 logger 的 info/error/warn 行为做单元测试（如 mock electron-log，断言调用与参数）。
- **ESLint**：在 `.eslintrc.json` 中为 `src/main` 增加 override，规则 `no-console: error`。
- **通过标准**：`pnpm test` 通过；`eslint src/main` 无 no-console 违规。

---

## 块 2：预加载 API 的 TypeScript 类型完善

**目标**：渲染进程使用 `window.electronAPI` 时有完整类型提示与校验。

**范围**：

- 补全/收紧 `src/preload/index.ts` 中 api 的参数与返回值类型（替换 any）；`ElectronAPI` 与实现一致。
- 渲染进程引用类型后通过 TypeScript 严格检查。

**测试**：`pnpm run build` 必须通过；渲染进程对 electronAPI 的调用无类型报错。

---

## 块 3：IPC 与 API 错误统一返回与展示

**目标**：所有 IPC 与 HTTP API 出错时统一返回结构；渲染进程对失败有统一展示。

**范围**：

- 主进程 IPC 统一返回 `{ success: boolean; data?: T; error?: string }`；所有 handler 在 catch 中返回该形状。
- HTTP API 错误响应符合现有格式，文档补充错误示例。
- 渲染进程至少一处增加统一错误展示（Toast 或内联 + 复制错误信息）。

**测试**：

- `src/main/ipc/ipcResponse.test.ts`：代表性 IPC 在抛错时返回 `{ success: false, error: string }`。
- scripts 下 API 测试：失败请求断言 `success: false` 与 `message`。

---

## 块 4：贡献点注册（IPC 与生命周期）

**目标**：主入口只做注册与调度，新增功能通过贡献点接入。

**范围**：

- 定义贡献点接口：`onAppReady?`、`onBeforeQuit?`、`registerIpc?`。
- 各模块实现并自注册；`index.ts` 遍历调用。

**测试**：`src/main/contributions.test.ts`：贡献列表长度、单贡献调用不抛错。

---

## 块 5：窗口创建统一（BaseWindowManager / 工厂）【已完成】

**目标**：所有窗口通过统一基类或工厂创建，webPreferences 一致。

**范围**：

- 单例窗口改为继承 BaseWindowManager 或统一工厂；公共 webPreferences 抽成常量。

**测试**：`src/main/window/BaseWindowManager.test.ts`：子类生命周期与 webPreferences 断言。

**实施摘要**：新增 `src/main/window/webPreferences.ts`（`DEFAULT_WEB_PREFERENCES`、`getWebPreferencesWithPreload`）；主窗口、截图窗、预览、设置、终端、文件管理、悬浮窗（触发器与面板）均改为使用该公共配置；新增 `BaseWindowManager.test.ts`（子类生命周期 + webPreferences 断言）。`pnpm test`（63 个）、`pnpm run build` 通过。

---

## 块 6：配置与窗口状态分离存储【已完成】

**目标**：持久配置与窗口状态分离，便于重置设置等扩展。

**范围**：

- ConfigManager 仅负责应用配置；窗口状态迁出到单独文件（如 window-state.json）或 WindowStateManager。

**测试**：ConfigManager 与窗口状态模块在临时目录下 load/save round-trip 正确。

**实施摘要**：新增 `src/main/windowStateManager.ts`（WindowState 类型、WindowStateManager、存储 `window-state.json`）；ConfigManager 移除 `mainWindowState` 与 getMainWindowState/saveMainWindowState，AppConfig 不再含窗口状态；主窗口改为使用 `windowStateManager.load()`/`windowStateManager.save()`；新增 `configManager.test.ts`、`windowStateManager.test.ts`（临时目录下 round-trip）。`pnpm test`（71 个）、`pnpm run build` 通过。

---

## 测试位置汇总


| 块   | 测试位置                                                           | 类型       |
| --- | -------------------------------------------------------------- | -------- |
| 1   | `src/main/logger.logger.test.ts`、ESLint override `src/main`    | 单元 + 静态  |
| 2   | 构建 + 类型检查                                                      | 构建       |
| 3   | `src/main/ipc/ipcResponse.test.ts`、scripts 下 API 错误用例          | 单元 + API |
| 4   | `src/main/contributions.test.ts`                               | 单元       |
| 5   | `src/main/window/BaseWindowManager.test.ts`                    | 单元       |
| 6   | `src/main/configManager.test.ts`、可选 windowStateManager.test.ts | 单元       |


---

## 执行顺序

1. 编写并确认本文档。
2. 执行块 1 → 测试与 ESLint 通过 → 块 2 → … → 块 6。
3. 全部完成后在 README 或 docs 中注明改进项已按本计划实施。

