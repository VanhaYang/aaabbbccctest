import log from '../logger'
import { ipcMain, app } from 'electron'
import { mainWindowManager } from '../mainWindow'
import { escapeScriptString } from '../utils'

export const registerFileIpcHandlers = (): void => {
  // 上传文件到网站（通过 BroadcastChannel）
  ipcMain.handle(
    'file:upload-to-website',
    async (_event, files: Array<{ name: string; size: number; type: string; data: string }>) => {
      try {
        let window = mainWindowManager.getWindow()
        if (!window || window.isDestroyed()) {
          window = mainWindowManager.createWindow()
          if (window && !window.isDestroyed() && window.isVisible()) {
            window.hide()
          }
          await new Promise(resolve => setTimeout(resolve, 500))
        }

        window = mainWindowManager.getWindow()
        if (!window || window.isDestroyed()) {
          throw new Error('主窗口不可用')
        }

        await new Promise(resolve => setTimeout(resolve, 300))

        const appVersion = app.getVersion() || '1.0.0'
        const appName = app.getName() || 'Electron Screenshot'
        const escapedVersion = escapeScriptString(appVersion)
        const escapedName = escapeScriptString(appName)

        const filesArray = files
          .map(file => {
            const escapedName = escapeScriptString(file.name)
            const escapedType = escapeScriptString(file.type)
            const escapedData = escapeScriptString(file.data)
            return `{
          name: '${escapedName}',
          mimeType: '${escapedType}',
          data: '${escapedData}',
          size: ${file.size}
        }`
          })
          .join(',')

        const uploadScript = `
        (function() {
          try {
            if (typeof BroadcastChannel === 'undefined') {
              log.error('[客户端集成] 浏览器不支持 BroadcastChannel');
              return;
            }

            const channel = new BroadcastChannel('fileUpload');

            if (!window.__CLIENT_CHANNEL_READY__) {
              channel.postMessage({
                type: 'clientReady',
                source: 'client',
                data: {
                  version: '${escapedVersion}',
                  name: '${escapedName}'
                },
                timestamp: Date.now()
              });
              window.__CLIENT_CHANNEL_READY__ = true;
            }

            const files = [${filesArray}];

            channel.postMessage({
              type: 'fileUpload',
              source: 'client',
              data: {
                files,
                timestamp: Date.now()
              },
              timestamp: Date.now()
            });

            channel.onmessage = (event) => {
              const { type, source, data } = event.data || {};
            };
          } catch (error) {
            log.error('[客户端集成] 上传文件失败:', error);
          }
        })();
      `

        await window.webContents.executeJavaScript(uploadScript)

        return { success: true }
      } catch (error) {
        log.error('[IPC] 上传文件到网站失败:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : '未知错误'
        }
      }
    }
  )
}
