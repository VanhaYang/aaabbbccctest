import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer')
      }
    },
    plugins: [react()],
    define: {
      'process.platform': JSON.stringify(process.platform)
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          capture: resolve(__dirname, 'src/renderer/capture.html'),
          'floating-trigger': resolve(__dirname, 'src/renderer/floating-trigger.html'),
          'floating-panel': resolve(__dirname, 'src/renderer/floating-panel.html'),
          settings: resolve(__dirname, 'src/renderer/settings.html'),
          preview: resolve(__dirname, 'src/renderer/preview.html'),
          'file-explorer': resolve(__dirname, 'src/renderer/file-explorer.html'),
          terminal: resolve(__dirname, 'src/renderer/terminal.html')
        }
      }
    }
  }
})
