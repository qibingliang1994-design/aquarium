import { defineConfig } from 'vite';

export default defineConfig({
  base: './',          // 产物可部署在任意子路径
  build: {
    target: 'es2022',
  },
});
