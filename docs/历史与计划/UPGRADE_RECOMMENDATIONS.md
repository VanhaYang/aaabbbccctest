# Electron 升级推荐方案

## 当前状态分析

✅ **好消息**：

- 项目已正确使用 `setWindowOpenHandler`，兼容 Electron 39 的 `window.open` 变更
- 未使用 offscreen rendering，不受相关变更影响
- 未使用 `--host-rules` 命令行参数

⚠️ **需要注意**：

- 从 Electron 27 直接升级到 39 跨度较大（12 个大版本）
- 需要同时升级 electron-vite 和 electron-builder

## 推荐升级方案

### 方案 A：渐进式升级（最安全，推荐）

#### 阶段 1：升级到 Electron 30.x（LTS）

```json
{
  "electron": "30.5.1",
  "electron-vite": "^2.0.0",
  "electron-builder": "^24.9.1"
}
```

**理由**：

- Electron 30 是 LTS 版本，稳定性好
- 与当前 electron-vite 2.0.0 兼容
- 风险最低

#### 阶段 2：升级到 Electron 35.x

```json
{
  "electron": "35.0.0",
  "electron-vite": "^3.0.0",
  "electron-builder": "^25.0.0"
}
```

**理由**：

- 继续验证兼容性
- 逐步适应新版本

#### 阶段 3：升级到 Electron 39.x（最新）

```json
{
  "electron": "39.0.0",
  "electron-vite": "^5.0.0",
  "electron-builder": "^26.0.0"
}
```

**理由**：

- 最终目标版本
- 获得最新特性和安全更新

### 方案 B：直接升级到 Electron 35.x（平衡方案）

如果希望更快升级但保持一定稳定性：

```json
{
  "electron": "35.0.0",
  "electron-vite": "^3.0.0",
  "electron-builder": "^25.0.0"
}
```

**理由**：

- Electron 35 相对稳定
- 跳过了 30-34 的中间版本
- 仍然需要测试验证

### 方案 C：直接升级到 Electron 39.x（激进方案，不推荐）

```json
{
  "electron": "39.0.0",
  "electron-vite": "^5.0.0",
  "electron-builder": "^26.0.0"
}
```

**风险**：

- 可能遇到未知的兼容性问题
- 调试困难
- 需要大量测试

## 具体升级步骤（以方案 A 阶段 1 为例）

### 1. 创建升级分支

```bash
git checkout -b upgrade-electron-30
```

### 2. 更新 package.json

将以下内容更新：

```json
{
  "devDependencies": {
    "electron": "30.5.1",
    "electron-vite": "^2.0.0",
    "electron-builder": "^24.9.1"
  }
}
```

### 3. 清理并重新安装

```bash
# Windows PowerShell
Remove-Item -Recurse -Force node_modules
Remove-Item package-lock.json
npm install
```

### 4. 检查 Node.js 版本兼容性

Electron 30 需要 Node.js 18.x，确保本地 Node.js 版本兼容：

```bash
node --version
```

### 5. 运行开发环境测试

```bash
npm run dev
```

### 6. 运行构建测试

```bash
npm run build
npm run compile
```

### 7. 功能测试清单

- [ ] 应用启动
- [ ] 主窗口显示
- [ ] 截图功能
- [ ] 终端功能
- [ ] 文件浏览器
- [ ] IPC 通信
- [ ] 快捷键
- [ ] 系统托盘
- [ ] 自动更新
- [ ] 打包功能

## 依赖包兼容性检查清单

### ✅ 已确认兼容

- `electron-log` (^5.4.3) - 兼容 Electron 39
- `@electron/rebuild` (^4.0.1) - 通常兼容

### ⚠️ 需要验证

- `@monaco-editor/react` (^4.7.0) - 需要测试
- `@nut-tree/nut-js` (^4.0.0) - 需要测试
- `react` (^19.2.3) - 需要测试
- `xterm` (^5.3.0) - 需要测试

### 📝 建议检查的包

运行以下命令检查是否有已知的兼容性问题：

```bash
npm outdated
npm audit
```

## 如果遇到问题

### 常见问题 1：electron-vite 构建失败

**解决方案**：

- 确保 electron-vite 版本与 Electron 版本兼容
- 检查 `electron.vite.config.ts` 配置

### 常见问题 2：原生模块编译失败

**解决方案**：

```bash
npm rebuild
# 或
npx electron-rebuild
```

### 常见问题 3：IPC 通信问题

**解决方案**：

- 检查 `contextIsolation` 设置
- 验证 preload 脚本正确加载

### 常见问题 4：窗口创建失败

**解决方案**：

- 检查 `BrowserWindow` 配置
- 验证 `webPreferences` 设置

## 回滚计划

如果升级失败，可以快速回滚：

```bash
git checkout master
git branch -D upgrade-electron-30
```

然后恢复 package.json：

```bash
git checkout package.json
npm install
```

## 最终建议

1. **优先选择方案 A（渐进式升级）**

   - 风险最低
   - 可以逐步验证
   - 问题容易定位

2. **每个阶段都要充分测试**

   - 不要跳过测试步骤
   - 记录遇到的问题和解决方案

3. **保持代码版本控制**

   - 使用 Git 分支管理
   - 每个阶段一个提交

4. **关注官方文档**
   - 查看 Electron 发布说明
   - 关注 electron-vite 和 electron-builder 的更新

## 下一步行动

1. 选择升级方案（推荐方案 A）
2. 创建 Git 分支
3. 按照步骤执行升级
4. 记录遇到的问题和解决方案
5. 完成测试后合并到主分支
