import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

// common.js 在模块加载时会引到需要 document 的焦散贴图，不能直接 import；从源码里取锚点字符串
const src = readFileSync(new URL('../src/scenes/items/common.js', import.meta.url), 'utf8');
const anchor = /export const DIRECT_ANCHOR = '([^']+)'/.exec(src)?.[1];

describe('叶片透光注入', () => {
  it('锚点在当前 three 的物理光照片段里恰好出现一次（升级 three 后注入不会静默失效）', () => {
    expect(anchor).toBeTruthy();
    const chunk = THREE.ShaderChunk.lights_physical_pars_fragment;
    expect(chunk.split(/** @type {string} */ (anchor)).length - 1).toBe(1);
    // 透光项用到的 three 内置符号仍在
    expect(chunk).toContain('RE_Direct_Physical');
    expect(THREE.ShaderChunk.common).toContain('vec3 BRDF_Lambert');
  });

  it('MeshStandard / MeshPhysical 的片元着色器都走这个片段', () => {
    expect(THREE.ShaderLib.physical.fragmentShader).toContain('#include <lights_physical_pars_fragment>');
    expect(THREE.ShaderLib.standard.fragmentShader).toContain('#include <lights_physical_pars_fragment>');
  });
});
