import { describe, it, expect } from 'vitest';
import { shellDensity, shellCount } from '../src/systems/shell-lod.js';

describe('外壳密度', () => {
  it('七档递减，极速仍留得住草', () => {
    expect(shellDensity(0)).toBe(1);
    expect(shellDensity(6)).toBeLessThan(shellDensity(3));
    expect(shellDensity(3)).toBeLessThan(shellDensity(0));
    expect(shellDensity(99)).toBe(shellDensity(6));
    expect(shellDensity(Number.NaN)).toBe(shellDensity(0));
    expect(shellCount(1100, 0)).toBe(1100);
    expect(shellCount(1100, 6)).toBeGreaterThanOrEqual(3);
    expect(shellCount(1100, 6)).toBeLessThan(shellCount(1100, 4));
    expect(shellCount(9, 6)).toBeGreaterThanOrEqual(1);
  });
});
