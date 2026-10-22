import { describe, it, expect } from 'vitest';
import { createTurbidity, decayTurbidity } from '../src/systems/turbidity.js';

const run = (t, secs, dt = 1 / 60) => { for (let s = 0; s < secs; s += dt) t.update(dt); return t.value; };

describe('turbidity', () => {
  it('初始清澈', () => { expect(createTurbidity().value).toBe(0); });
  it('kick 后约 5 秒回落到接近清澈，之后归零', () => {
    const t = createTurbidity();
    t.kick(1);
    expect(t.value).toBe(1);
    expect(run(t, 1)).toBeGreaterThan(0.4);
    expect(run(t, 4)).toBeLessThan(0.1);
    expect(run(t, 10)).toBe(0);
  });
  it('单调回落、始终有限', () => {
    let v = 1;
    for (let i = 0; i < 600; i++) { const n = decayTurbidity(v, 1 / 60); expect(n).toBeLessThanOrEqual(v); expect(Number.isFinite(n)).toBe(true); v = n; }
  });
  it('连续 kick 取较大值并封顶 1；非法强度忽略', () => {
    const t = createTurbidity();
    t.kick(0.4); t.kick(0.3);
    expect(t.value).toBe(0.4);
    t.kick(5); expect(t.value).toBe(1);
    t.clear(); t.kick(NaN); expect(t.value).toBe(0);
  });
  it('负 dt / 大 dt 都安全', () => {
    expect(decayTurbidity(0.5, -1)).toBe(0.5);
    expect(decayTurbidity(0.5, 1e6)).toBe(0);
  });
});
