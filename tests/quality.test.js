import { describe, it, expect } from 'vitest';
import { createQuality, LEVELS } from '../src/systems/quality.js';

// 以 0.55s 为一步模拟采样时钟
const STEP = 0.55;
function run(monitor, fps, secs, startT = GRACE) {
  let t = startT;
  const n = Math.round(secs / STEP);
  for (let i = 0; i < n; i++) { monitor.sample(fps, t); t += STEP; }
  return t;
}
const GRACE = 4;

function make() {
  /** @type {any[]} */
  const applied = [];
  const monitor = createQuality({ baseRatio: 2, onLevel: q => applied.push({ ...q }) });
  return { monitor, applied };
}

describe('createQuality', () => {
  it('构造时应用第 0 级（基准 dpr）', () => {
    const { monitor, applied } = make();
    expect(monitor.level).toBe(0);
    expect(applied).toEqual([{ level: 0, label: '高清', ratio: 2, glass: 'high', bloom: true }]);
  });

  it('开场 4 秒内不采样：低帧率不触发降级', () => {
    const { monitor } = make();
    run(monitor, 10, 4, 0);
    expect(monitor.level).toBe(0);
  });

  it('持续低帧率逐级降级（每 3 秒一级）', () => {
    const { monitor, applied } = make();
    let t = run(monitor, 20, 3.3);            // 3.3s @20fps → 降 1 级
    expect(monitor.level).toBe(1);
    t = run(monitor, 20, 3.3, t);             // 再 3.3s → 再降
    expect(monitor.level).toBe(2);
    run(monitor, 20, 30, t);                  // 长时间低帧率 → 降到最低
    expect(monitor.level).toBe(LEVELS.length - 1);
    expect(applied.at(-1)).toMatchObject({ level: 4, glass: 'low', bloom: false, ratio: 1 });
  });

  it('帧率回升后逐级恢复（10 秒升一级，不越级）', () => {
    const { monitor } = make();
    let t = run(monitor, 20, 30);             // 先压到最低
    expect(monitor.level).toBe(LEVELS.length - 1);
    t = run(monitor, 60, 11.6, t);            // 11.6s 高帧率（≥20 个样本）→ 升 1 级
    expect(monitor.level).toBe(3);
    run(monitor, 60, 60, t);                  // 持续高帧率 → 回到 0
    expect(monitor.level).toBe(0);
  });

  it('迟滞：帧率在 32~50 之间不升不降', () => {
    const { monitor } = make();
    monitor.force(2);
    run(monitor, 40, 30);
    expect(monitor.level).toBe(2);
  });

  it('瞬时掉帧（不足 3 秒）不降级', () => {
    const { monitor } = make();
    run(monitor, 10, 2.2);                    // 只有 2.2 秒低帧率
    run(monitor, 60, 1);                      // 随后恢复
    run(monitor, 10, 2.2);                    // 再次短暂掉帧（streak 已被打断）
    expect(monitor.level).toBe(0);
  });

  it('force 越界钳制', () => {
    const { monitor, applied } = make();
    monitor.force(99);
    expect(monitor.level).toBe(LEVELS.length - 1);
    monitor.force(-1);
    expect(monitor.level).toBe(0);
    expect(applied).toHaveLength(3);
  });
});
