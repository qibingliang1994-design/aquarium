/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',          // 产物可部署在任意子路径
  build: {
    target: 'es2022',
  },
  test: {
    environment: 'node',           // 只测纯逻辑模块；浏览器全局按需在用例里 stub
    include: ['tests/**/*.test.js'],
    restoreMocks: true,
    unstubGlobals: true,
  },
});
