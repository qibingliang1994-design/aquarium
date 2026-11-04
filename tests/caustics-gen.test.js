import { describe, it, expect } from 'vitest';
import { makeWaveSet, wavePhases, waveGrad, gridFor, FINE, BROAD, MARGIN, LOW_GRID_LEVEL } from '../src/scene/caustics-gen.js';

const TAU = Math.PI * 2;

describe('焦散生成：波组', () => {
  it('同 seed 结果确定', () => {
    const o = { seed: 7, count: 8, tile: 1.7, nLo: 4, nHi: 12, slope: 0.05, speed: 0.5 };
    expect(makeWaveSet(o)).toEqual(makeWaveSet(o));
  });

  it('波数在 tile 上取整：波面严格周期，焦散图无缝平铺', () => {
    for(const L of [FINE, BROAD]){
      expect(L.waves.length).toBeGreaterThan(3);
      for(const w of L.waves){
        const m = w.kx * L.tile / TAU, n = w.kz * L.tile / TAU;
        expect(Math.abs(m - Math.round(m))).toBeLessThan(1e-9);
        expect(Math.abs(n - Math.round(n))).toBeLessThan(1e-9);
      }
      const ph = wavePhases(L.waves, 12.3, 0.4, new Float32Array(L.waves.length));
      const [a, b] = waveGrad(L.waves, ph, 0.31, 0.77);
      const [c, d] = waveGrad(L.waves, ph, 0.31 + L.tile, 0.77 - 2 * L.tile);
      expect(c).toBeCloseTo(a, 6);
      expect(d).toBeCloseTo(b, 6);
    }
  });

  it('没有同向/反向重复的波数（会互相抵消或叠成单一方向）', () => {
    for(const L of [FINE, BROAD]){
      const keys = L.waves.map(w => [Math.round(w.kx * L.tile / TAU), Math.round(w.kz * L.tile / TAU)]);
      const set = new Set(keys.map(([m, n]) => `${m},${n}`));
      expect(set.size).toBe(keys.length);
      for(const [m, n] of keys) expect(set.has(`${-m},${-n}`)).toBe(false);
    }
  });

  it('网格外扩足够：最坏情况落点偏移小于外扩宽度（tile 外折进来的光不丢）', () => {
    const ETA = 1 / 1.333;
    for(const L of [FINE, BROAD]){
      const maxSlope = L.waves.reduce((s, w) => s + w.a * Math.hypot(w.kx, w.kz), 0) * 2;   // 天气浪最大 2 倍
      const D = Math.max(...L.depths);
      expect((1 - ETA) * maxSlope * D * 1.2).toBeLessThan(MARGIN * L.tile);   // 小角度近似 + 20% 余量
    }
  });
});

describe('焦散生成：相位', () => {
  it('相位落在 [0, 2π)，大时间值下仍精确（CPU 双精度取模）', () => {
    const out = new Float32Array(FINE.waves.length);
    wavePhases(FINE.waves, 1e6, -37.5, out);
    for(const p of out){ expect(p).toBeGreaterThanOrEqual(0); expect(p).toBeLessThan(TAU + 1e-6); }
  });

  it('水流漂移 = 波形整体沿 +x 平移', () => {
    const ph0 = wavePhases(FINE.waves, 3, 0, new Float32Array(FINE.waves.length));
    const ph1 = wavePhases(FINE.waves, 3, 0.25, new Float32Array(FINE.waves.length));
    const [a, b] = waveGrad(FINE.waves, ph0, 0.4, 0.6);
    const [c, d] = waveGrad(FINE.waves, ph1, 0.4 + 0.25, 0.6);
    expect(c).toBeCloseTo(a, 4);
    expect(d).toBeCloseTo(b, 4);
  });
});

describe('焦散生成：画质档', () => {
  it('高档用密网格，低档换稀网格，且每格不超过 4 个纹素（网纹尖点不糊成块）', () => {
    for(const L of [FINE, BROAD]){
      expect(gridFor(L, 0)).toBe(L.grid);
      expect(gridFor(L, LOW_GRID_LEVEL - 1)).toBe(L.grid);
      expect(gridFor(L, LOW_GRID_LEVEL)).toBe(L.gridLo);
      expect(gridFor(L, 6)).toBe(L.gridLo);
      expect(L.gridLo).toBeLessThan(L.grid);
      expect(L.res / L.gridLo).toBeLessThanOrEqual(4);
    }
  });
});
