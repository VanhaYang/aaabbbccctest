# 自动更新功能使用说明

## 功能概述

应用已集成自动更新功能，支持：
- ✅ 启动时自动检查更新
- ✅ 定时检查更新（每24小时）
- ✅ 手动检查更新
- ✅ 下载进度显示
- ✅ 更新提示对话框
- ✅ 自动安装并重启

## 配置更新服务器

### 方法 1: 使用 electron-builder.json（推荐）

编辑 `electron-builder.json`，修改 `publish` 配置：

```json
{
  "publish": {
    "provider": "generic",
    "url": "https://your-update-server.com"
  }
}
```

### 方法 2: 使用环境变量

设置环境变量 `UPDATE_SERVER_URL`：

```bash
# Windows PowerShell
$env:UPDATE_SERVER_URL="https://your-update-server.com"

# Linux/Mac
export UPDATE_SERVER_URL="https://your-update-server.com"
```

### 方法 3: 使用 GitHub Releases

如果使用 GitHub Releases，配置如下：

```json
{
  "publish": {
    "provider": "github",
    "owner": "your-username",
    "repo": "electron-screenshot"
  }
}
```

## 更新服务器要求

### 必需文件

更新服务器需要提供以下文件：

1. **更新清单文件**：`latest.yml`（Windows）或 `latest-mac.yml`（macOS）
2. **安装包文件**：如 `Electron Screenshot-1.0.1-Setup.exe`

### 服务器目录结构示例

```
https://your-update-server.com/
├── latest.yml                    # Windows 更新清单
├── latest-mac.yml               # macOS 更新清单（如果支持）
├── Electron Screenshot-1.0.0-Setup.exe
├── Electron Screenshot-1.0.1-Setup.exe
└── ...
```

### 生成更新清单文件

运行以下命令生成清单文件（不上传）：

```bash
pnpm run build:release
```

这会在 `release` 目录生成：
- `latest.yml` - 更新清单文件
- `Electron Screenshot-{version}-Setup.exe` - 安装包

### 上传文件到服务器

将以下文件上传到更新服务器：
1. `latest.yml` - 放到服务器根目录
2. `Electron Screenshot-{version}-Setup.exe` - 放到服务器根目录

**重要**：每次发布新版本时，需要：
1. 更新 `latest.yml` 指向新版本
2. 上传新的安装包文件

## 使用方式

### 自动检查更新

应用启动后会自动：
1. 延迟 3 秒后检查更新（避免影响启动速度）
2. 每 24 小时自动检查一次

### 手动检查更新

在渲染进程中调用：

```typescript
// 检查更新
const result = await window.electronAPI.update.check()
if (result.available) {
  console.log('发现新版本:', result.info?.version)
  
  // 下载更新
  await window.electronAPI.update.download()
  
  // 安装更新（会重启应用）
  await window.electronAPI.update.install()
}

// 监听更新状态
window.electronAPI.update.onStatus((data) => {
  console.log('更新状态:', data.event, data.data)
  
  if (data.event === 'download-progress') {
    console.log('下载进度:', data.data.percent + '%')
  }
  
  if (data.event === 'update-downloaded') {
    // 更新下载完成，可以提示用户重启
  }
})
```

### 更新状态事件

监听 `update:status` 事件可以获取更新状态：

- `checking` - 正在检查更新
- `update-available` - 发现新版本
- `update-not-available` - 当前已是最新版本
- `error` - 更新检查失败
- `download-progress` - 下载进度更新
- `update-downloaded` - 更新下载完成

## 开发环境

在开发环境中，自动更新功能会被自动禁用，不会影响开发调试。

## 注意事项

1. **HTTPS 必需**：更新服务器必须使用 HTTPS，否则客户端会拒绝连接
2. **代码签名**：Windows 和 macOS 建议使用代码签名，提升用户体验
3. **版本号**：确保 `package.json` 中的版本号正确
4. **清单文件格式**：`latest.yml` 必须符合 electron-updater 的格式要求

## 故障排查

### 更新检查失败

1. 检查更新服务器地址是否正确
2. 检查服务器是否支持 HTTPS
3. 检查 `latest.yml` 文件是否存在且格式正确
4. 查看控制台日志获取详细错误信息

### 下载失败

1. 检查安装包文件是否存在
2. 检查文件访问权限
3. 检查网络连接

### 安装失败

1. 检查是否有管理员权限（Windows）
2. 检查代码签名是否有效（macOS）
3. 查看系统日志获取详细错误信息

## 示例：在设置页面添加更新检查按钮

```tsx
import { useState, useEffect } from 'react'

function UpdateSection() {
  const [checking, setChecking] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<any>(null)
  const [downloadProgress, setDownloadProgress] = useState(0)

  useEffect(() => {
    // 监听更新状态
    window.electronAPI.update.onStatus((data) => {
      if (data.event === 'download-progress') {
        setDownloadProgress(data.data.percent)
      } else if (data.event === 'update-downloaded') {
        setUpdateInfo(data.data)
      }
    })

    return () => {
      window.electronAPI.update.removeStatusListener()
    }
  }, [])

  const handleCheckUpdate = async () => {
    setChecking(true)
    try {
      const result = await window.electronAPI.update.check()
      if (result.available) {
        setUpdateInfo(result.info)
        // 自动开始下载
        await window.electronAPI.update.download()
      } else {
        alert('当前已是最新版本')
      }
    } catch (error) {
      console.error('检查更新失败:', error)
    } finally {
      setChecking(false)
    }
  }

  const handleInstall = async () => {
    await window.electronAPI.update.install()
  }

  return (
    <div>
      <button onClick={handleCheckUpdate} disabled={checking}>
        {checking ? '检查中...' : '检查更新'}
      </button>
      
      {updateInfo && (
        <div>
          <p>发现新版本: {updateInfo.version}</p>
          {downloadProgress > 0 && downloadProgress < 100 && (
            <p>下载进度: {downloadProgress.toFixed(1)}%</p>
          )}
          {downloadProgress === 100 && (
            <button onClick={handleInstall}>立即安装并重启</button>
          )}
        </div>
      )}
    </div>
  )
}
```

