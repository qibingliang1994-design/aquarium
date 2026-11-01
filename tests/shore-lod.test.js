import { describe, it, expect } from 'vitest';
import { shoreLod, plantKeep } from '../src/systems/shore-lod.js';

describe('岸边画质档', () => {
  it('高清满叶并保留加密草丛，极速只留骨架', () => {
    const hi = shoreLod(0);
    expect(hi).toEqual({ grass: 1, leaf: 1, extra: true });
    const lo = shoreLod(6);
    expect(lo.grass).toBeLessThan(0.2);
    expect(lo.leaf).toBeLessThan(0.2);
    expect(lo.extra).toBe(false);
    expect(lo.grass).toBeGreaterThan(0);
    expect(shoreLod(4).grass).toBeGreaterThan(lo.grass);
  });

  it('加密草丛从流畅档起隐藏，非法档当高清', () => {
    expect(shoreLod(3).extra).toBe(true);
    expect(shoreLod(4).extra).toBe(false);
    expect(shoreLod(Number.NaN)).toEqual(shoreLod(0));
    expect(shoreLod(9).grass).toBe(shoreLod(6).grass);
  });

  it('缸内水草：高清全留，逐档单调变稀，最低档仍留一半以上', () => {
    expect(plantKeep(0)).toBe(1);
    for (let l = 1; l <= 6; l++) expect(plantKeep(l)).toBeLessThan(plantKeep(l - 1));
    expect(plantKeep(6)).toBeGreaterThan(0.5);
    expect(plantKeep(Number.NaN)).toBe(1);
    expect(plantKeep(12)).toBe(plantKeep(6));
  });
});
