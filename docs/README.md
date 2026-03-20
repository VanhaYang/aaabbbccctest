# docs 文档索引

本目录按 **当前在用** 与 **历史与计划** 分文件夹放置，便于区分需求与维护。

---

## 当前在用

### 当前在用 / API与规范

| 文件 | 说明 |
|------|------|
| **API.md** | HTTP API 接口文档（人类可读），含基础 URL、鉴权、响应格式及各接口说明。 |
| **openapi.v2.json** | 完整 OpenAPI 3.0 规范（传统 REST + 工具层），版本 2.0。 |
| **openapi-rest.json** | 仅传统 REST 的 OpenAPI。由 `scripts/split-openapi.mjs` 从 `openapi.v2.json` 拆出。 |
| **openapi-tools.json** | 仅工具层的 OpenAPI。由 `scripts/split-openapi.mjs` 从 `openapi.v2.json` 拆出。 |

### 当前在用 / 工具层

| 文件 | 说明 |
|------|------|
| **TOOLS-FOR-LLM.md** | 面向 LLM/决策端的工具层说明：按方法拆开的接口、各 toolId 的 arguments、两套接口取舍。 |
| **DESIGN-openclaw-tool-layer.md** | 工具层设计：分层、工具契约、DesktopBridge、与 OpenClaw 对齐的 id/参数约定。 |

### 当前在用 / 使用说明

| 文件 | 说明 |
|------|------|
| **EFFICIENT_FILE_EDITING.md** | 大文件高效编辑指南：精准编辑、行范围读取。 |
| **AUTO_UPDATE.md** | 自动更新功能：配置更新服务器、环境变量、GitHub Releases 等。 |
| **systemPrompt** | 本项目 AI 编程助手的行为约定与工具使用规范。 |

---

## 历史与计划

| 文件 | 说明 |
|------|------|
| **IMPROVEMENT_PLAN.md** | 分块完善计划（Logger、贡献点、窗口统一、配置与窗口状态分离等），部分块已完成。 |
| **ELECTRON_UPGRADE_PLAN.md** | Electron 升级计划与兼容性分析。 |
| **UPGRADE_RECOMMENDATIONS.md** | 升级推荐方案（渐进式阶段）。 |
| **UPGRADE_STATUS.md** | 升级状态记录（已完成阶段及测试结果）。 |
| **openapi.json** | 旧版 OpenAPI（v1.4.5），仅传统 REST，不含工具层。 |

---

## 维护说明

- **拆分 OpenAPI**：修改 `当前在用/API与规范/openapi.v2.json` 后，在项目根目录执行 `node scripts/split-openapi.mjs` 重新生成 `openapi-rest.json` 与 `openapi-tools.json`。
- **测试**：`npm run test:api`（或 `pnpm test:api`）用于校验接口可访问性与基本响应格式。
