# Electron 升级计划

## 当前版本状态

| 包名              | 当前版本 | 最新版本 | 升级建议              |
| ----------------- | -------- | -------- | --------------------- |
| Electron          | 27.1.3   | 39.0.0   | ⚠️ 大版本升级，需谨慎 |
| electron-vite     | ^2.0.0   | 5.0.0    | ⚠️ 大版本升级         |
| electron-builder  | ^24.9.1  | 26.0.19  | ⚠️ 大版本升级         |
| electron-log      | ^5.4.3   | 5.4.3    | ✅ 已是最新           |
| @electron/rebuild | ^4.0.1   | 最新     | ✅ 通常兼容           |

## 兼容性分析

### ✅ 兼容的包

- **electron-log** (5.4.3) - 已确认兼容 Electron 39
- **@electron/rebuild** (^4.0.1) - 通常向后兼容

### ⚠️ 需要升级的包

- **electron-vite** - 需要升级到 5.0 以支持 Electron 39
- **electron-builder** - 需要升级到 26.x 以支持 Electron 39

### 🔍 需要检查的依赖

- **React 19.2.3** - 需要确认与 Electron 39 的兼容性
- **@monaco-editor/react** (^4.7.0) - 需要检查兼容性
- **@nut-tree/nut-js** (^4.0.0) - 需要检查兼容性
- **xterm** (^5.3.0) - 需要检查兼容性

## Electron 39 主要变更

### 破坏性变更

1. **`--host-rules` 命令行参数已废弃**

   - 需要使用 `--host-resolver-rules` 替代
   - 影响：如果代码中使用了 `--host-rules`，需要更新

2. **`window.open` 行为变更**

   - 现在总是创建可调整大小的弹出窗口
   - 如需恢复旧行为，需要使用 `webContents.setWindowOpenHandler`

3. **Offscreen Rendering `paint` 事件数据结构变更**
   - `sharedTextureHandle`、`planes`、`modifier` 统一为 `handle` 属性
   - 影响：如果使用了 offscreen rendering，需要更新代码

### 新特性

- Chromium 142.0.7444.52
- V8 14.2
- Node.js 22.20.0
- ASAR 完整性检查稳定化

## 升级策略

### 方案一：渐进式升级（推荐）

#### 第一阶段：升级到 Electron 30.x

```json
{
  "electron": "30.9.0",
  "electron-vite": "^2.0.0",
  "electron-builder": "^24.9.1"
}
```

- 风险较低
- 可以逐步测试功能
- 验证所有依赖的兼容性

#### 第二阶段：升级到 Electron 35.x

```json
{
  "electron": "35.0.0",
  "electron-vite": "^3.0.0",
  "electron-builder": "^25.0.0"
}
```

- 继续验证兼容性
- 测试新特性

#### 第三阶段：升级到 Electron 39.x

```json
{
  "electron": "39.0.0",
  "electron-vite": "^5.0.0",
  "electron-builder": "^26.0.0"
}
```

- 最终目标版本
- 需要处理破坏性变更

### 方案二：直接升级到 Electron 39（不推荐）

- 风险较高
- 可能遇到多个兼容性问题
- 调试困难

## 升级步骤

### 1. 备份当前代码

```bash
git checkout -b upgrade-electron-39
git commit -am "备份：升级前状态"
```

### 2. 更新 package.json

根据选择的升级方案更新版本号

### 3. 清理并重新安装依赖

```bash
rm -rf node_modules package-lock.json
npm install
```

### 4. 检查代码中的破坏性变更

- [ ] 搜索 `--host-rules` 的使用
- [ ] 检查 `window.open` 的使用
- [ ] 检查 offscreen rendering 的使用

### 5. 运行测试

```bash
npm run dev
npm run build
npm run compile
```

### 6. 功能测试清单

- [ ] 应用启动正常
- [ ] 窗口创建和显示正常
- [ ] IPC 通信正常
- [ ] 截图功能正常
- [ ] 终端功能正常
- [ ] 文件浏览器正常
- [ ] 快捷键功能正常
- [ ] 系统托盘正常
- [ ] 自动更新功能正常
- [ ] 打包功能正常

## 需要特别注意的代码位置

### 1. 检查 window.open 的使用

搜索项目中的 `window.open` 调用：

```bash
grep -r "window.open" src/
```

### 2. 检查命令行参数

搜索 `--host-rules` 的使用：

```bash
grep -r "host-rules" src/
```

### 3. 检查 BrowserWindow 配置

检查所有 `BrowserWindow` 的创建，确保配置正确：

- `webPreferences` 配置
- `contextIsolation` 设置
- `nodeIntegration` 设置

## 回滚计划

如果升级后遇到严重问题：

```bash
git checkout master
git branch -D upgrade-electron-39
```

## 相关链接

- [Electron 39 发布说明](https://www.electronjs.org/blog/electron-39-0)
- [electron-vite 5.0 发布说明](https://electron-vite.org/blog/)
- [electron-builder 文档](https://www.electron.build/)
- [Electron 升级指南](https://www.electronjs.org/docs/latest/tutorial/updates)

## 建议

1. **优先选择渐进式升级**：从 Electron 27 → 30 → 35 → 39
2. **充分测试**：每个阶段都要进行全面测试
3. **保持代码备份**：使用 Git 分支管理升级过程
4. **关注社区反馈**：查看是否有其他开发者遇到类似问题
