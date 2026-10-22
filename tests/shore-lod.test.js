import { describe, it, expect } from 'vitest';
import { shoreLod } from '../src/systems/shore-lod.js';

describe('岸边画质档', () => {
  it('高清满叶并保留加密草丛，极速只留骨架', () => {
    const hi = shoreLod(0);
    expect(hi).toEqual({ grass: 1, leaf: 1, extra: true });
    const lo = shoreLod(4);
    expect(lo.grass).toBeLessThan(0.2);
    expect(lo.leaf).toBeLessThan(0.2);
    expect(lo.extra).toBe(false);
    expect(lo.grass).toBeGreaterThan(0);
  });

  it('加密草丛从第 3 档起隐藏，非法档当高清', () => {
    expect(shoreLod(2).extra).toBe(true);
    expect(shoreLod(3).extra).toBe(false);
    expect(shoreLod(Number.NaN)).toEqual(shoreLod(0));
    expect(shoreLod(9).grass).toBe(shoreLod(4).grass);
  });
});
