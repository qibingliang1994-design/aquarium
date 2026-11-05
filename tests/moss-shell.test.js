import { describe, it, expect, vi, beforeAll } from 'vitest';
import * as THREE from 'three';

// moss-shell → common.js → caustics.js 在模块加载时用 canvas 生成 Voronoi 噪声贴图：给一个最小的 2D canvas 桩
/** @type {any} */ let M;
beforeAll(async () => {
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ({
    createImageData: (/** @type {number} */ w, /** @type {number} */ h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: () => {},
  }) }) });
  M = await import('../src/scenes/items/moss-shell.js');
});

describe('苔藓绒毛壳层', () => {
  it('层高从 1/K 均匀到 1，画质档层数不增且最低档只剩核', () => {
    const hs = Array.from({ length: M.SHELLS }, (_, i) => M.shellHeight(i + 1, M.SHELLS));
    expect(hs[0]).toBeCloseTo(1 / M.SHELLS);
    expect(hs[hs.length - 1]).toBe(1);
    expect(M.SHELL_TIERS[0]).toBe(M.SHELLS);
    for(let i = 1; i < M.SHELL_TIERS.length; i++) expect(M.SHELL_TIERS[i]).toBeLessThanOrEqual(M.SHELL_TIERS[i - 1]);
    expect(M.SHELL_TIERS[M.SHELL_TIERS.length - 1]).toBe(0);
  });

  it('实例化核：壳层共享几何、实例矩阵与颜色，不投影；画质档切换只改材质可见性', () => {
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const core = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial(), 10);
    core.count = 7;
    core.setColorAt(0, new THREE.Color(1, 1, 1));
    const shells = M.addMossShells(core, 'test', () => new THREE.MeshStandardMaterial(), { len: 0.3, freq: 16 });
    expect(shells.length).toBe(M.SHELLS);
    for(const s of shells){
      expect(s.parent).toBe(core);
      expect(s.geometry).toBe(geo);
      expect(s.instanceMatrix).toBe(core.instanceMatrix);
      expect(s.instanceColor).toBe(core.instanceColor);
      expect(s.count).toBe(7);
      expect(s.castShadow).toBe(false);
    }
    // 同一类型的第二块石头复用同一组材质
    const core2 = new THREE.InstancedMesh(geo, core.material, 3);
    const shells2 = M.addMossShells(core2, 'test', () => new THREE.MeshStandardMaterial(), { len: 0.3, freq: 16 });
    shells2.forEach((s, i) => expect(s.material).toBe(shells[i].material));
    M.setMossShells(4);   // 档 4 → 2 层
    expect(shells.map(s => s.material.visible)).toEqual(shells.map((_, i) => i < M.SHELL_TIERS[4]));
    M.setMossShells(6);
    expect(shells.every(s => !s.material.visible)).toBe(true);
    M.setMossShells(0);
    expect(shells.every(s => s.material.visible)).toBe(true);
  });
});
