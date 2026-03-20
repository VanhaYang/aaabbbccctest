/// <reference types="vite/client" />
/// <reference types="../../preload/index.d.ts" />

/**
 * Vite 环境变量类型声明
 */
interface ImportMetaEnv {
  readonly VITE_DEV_SERVER_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
