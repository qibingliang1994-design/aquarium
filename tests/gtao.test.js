import { describe, it, expect } from 'vitest';
import { aoRadiusPx, AO_TIERS } from '../src/scene/gtao.js';

describe('环境光遮蔽（GTAO）', () => {
  it('世界半径换算成像素：越远越小，近景封顶', () => {
    const base = { radius: 0.28, proj11: 2.414, height: 400, maxPx: 48 };
    const near = aoRadiusPx({ ...base, viewZ: 0.5 });
    const mid = aoRadiusPx({ ...base, viewZ: 3 });
    const far = aoRadiusPx({ ...base, viewZ: 12 });
    expect(near).toBe(48);
    expect(mid).toBeGreaterThan(far);
    expect(mid).toBeCloseTo(0.28 * 2.414 * 0.5 * 400 / 3, 6);
    expect(aoRadiusPx({ ...base, viewZ: 0 })).toBe(48);   // 0 深度不除零
  });

  it('画质档表：切片/步数随档不增，覆盖到 AA 开着的最后一档（4）', () => {
    expect(AO_TIERS.length).toBe(5);
    for(let i = 1; i < AO_TIERS.length; i++){
      expect(AO_TIERS[i][0]).toBeLessThanOrEqual(AO_TIERS[i - 1][0]);
      expect(AO_TIERS[i][1]).toBeLessThanOrEqual(AO_TIERS[i - 1][1]);
    }
    for(const [s, n] of AO_TIERS){ expect(s).toBeGreaterThanOrEqual(2); expect(n).toBeGreaterThanOrEqual(3); }
  });
});
