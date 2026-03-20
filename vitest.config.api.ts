import { defineConfig } from 'vitest/config'

/** 仅用于 npm run test:api，运行对外 API 可用性测试 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/**/*.test.ts'],
  },
})
