import { describe, it, expect } from 'vitest';
import { clamp, lerp, sstep, wrapPI, vnoise, rand } from '../src/utils.js';

describe('utils', () => {
  it('clamp 夹紧到区间', () => {
    expect(clamp(-1, 0, 1)).toBe(0);
    expect(clamp(2, 0, 1)).toBe(1);
    expect(clamp(0.4, 0, 1)).toBe(0.4);
  });

  it('lerp 线性插值', () => {
    expect(lerp(2, 4, 0)).toBe(2);
    expect(lerp(2, 4, 0.5)).toBe(3);
    expect(lerp(2, 4, 1)).toBe(4);
  });

  it('sstep 两端饱和、中点 0.5、单调', () => {
    expect(sstep(0, 1, -5)).toBe(0);
    expect(sstep(0, 1, 5)).toBe(1);
    expect(sstep(0, 1, 0.5)).toBeCloseTo(0.5);
    expect(sstep(0, 1, 0.3)).toBeLessThan(sstep(0, 1, 0.6));
  });

  it('wrapPI 把角度折回 (-π, π]', () => {
    for (const a of [0, 3 * Math.PI, -7.5, 100]) {
      const w = wrapPI(a);
      expect(w).toBeGreaterThan(-Math.PI - 1e-9);
      expect(w).toBeLessThanOrEqual(Math.PI + 1e-9);
      expect(Math.cos(w)).toBeCloseTo(Math.cos(a));
    }
  });

  it('vnoise 确定性且落在 [0,1]', () => {
    for (let i = 0; i < 200; i++) {
      const x = i * 0.37 - 20, y = i * 0.91 + 3;
      const v = vnoise(x, y);
      expect(v).toBe(vnoise(x, y));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('rand 单参数 [0,a)、双参数 [a,b)', () => {
    for (let i = 0; i < 100; i++) {
      const r1 = rand(3), r2 = rand(-2, 5);
      expect(r1).toBeGreaterThanOrEqual(0); expect(r1).toBeLessThan(3);
      expect(r2).toBeGreaterThanOrEqual(-2); expect(r2).toBeLessThan(5);
    }
  });
});
