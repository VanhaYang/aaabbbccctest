# 静态资源目录

应用静态资源统一放在此目录。

## 目录结构

```
resources/
├── app/
│   └── icons/          # 应用图标（窗口、托盘、安装包）
│       ├── icon-16x16.png   # 托盘等小尺寸（可选，会回退到 32/96）
│       ├── icon-32x32.png   # 托盘备用
│       ├── icon-96x96.png   # 窗口与托盘默认
│       └── icon-512x512.png # 安装包/商店图标
├── win32/               # 可选：Windows 专用（如 .ico、清单）
├── darwin/              # 可选：macOS 专用
└── linux/               # 可选：Linux 专用
```

- **开发环境**：从项目根 `resources/app/icons/` 读取（以 `app.getAppPath()` 为根）。
- **打包后**：由 electron-builder 的 `extraResources` 将整个 `resources` 拷到安装目录，主进程通过 `process.resourcesPath` 访问，例如 `app/icons/icon-96x96.png`。

至少需提供 **icon-96x96.png** 或 **icon-512x512.png**，托盘会按 16→32→96→512 顺序尝试加载。

**兼容**：若存在旧目录 `resources/icons/`，会优先使用 `resources/app/icons/`，找不到文件时再回退到 `resources/icons/`。建议将图标迁移到 `app/icons/`。
