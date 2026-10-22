/// <reference types="vitest" />
import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 本机（企业管控设备）有安全软件盯防 %TEMP%：esbuild 输入超过 1MB 时会把输入写进
// 系统临时目录、由它的服务进程读取后删除，这个"第三方进程删除刚写入的 %TEMP% 大文件"
// 会被拒（Access is denied，vite build 因此必挂；权限本身经诊断是健康的）。
// 项目目录内不受影响，所以 Windows 下把 TMP/TEMP 重定向到项目内的 .tmp/：
// vite/vitest 生成 esbuild 子进程前加载本文件，环境变量随之传递，dev/build/test 全覆盖。
const projectDir = path.dirname(fileURLToPath(import.meta.url));
if (process.platform === 'win32') {
  const tmp = path.join(projectDir, '.tmp');
  fs.mkdirSync(tmp, { recursive: true });
  process.env.TMP = tmp;
  process.env.TEMP = tmp;
}

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
