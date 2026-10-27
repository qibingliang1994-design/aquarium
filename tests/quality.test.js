import { describe, it, expect } from 'vitest';
import { createQuality, LEVELS, budgetRatio } from '../src/systems/quality.js';

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
  it('构造时应用第 0 级（基准 dpr，无像素预算）', () => {
    const { monitor, applied } = make();
    expect(monitor.level).toBe(0);
    expect(applied).toEqual([{ level: 0, label: '高清', ratio: 2, glass: 'high', bloom: true, pixels: null, shadowHz: 20 }]);
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
    expect(applied.at(-1)).toMatchObject({ level: 4, glass: 'low', bloom: false, ratio: 1, pixels: 1.4e6, shadowHz: 8 });
  });

  it('帧率回升后逐级恢复（8 秒升一级，不越级）', () => {
    const { monitor } = make();
    let t = run(monitor, 20, 30);             // 先压到最低
    expect(monitor.level).toBe(LEVELS.length - 1);
    t = run(monitor, 60, 9, t);               // 9s 高帧率（≥16 个样本）→ 升 1 级
    expect(monitor.level).toBe(3);
    run(monitor, 60, 60, t);                  // 持续高帧率 → 回到 0
    expect(monitor.level).toBe(0);
  });

  it('迟滞：帧率在 40~55 之间不升不降', () => {
    const { monitor } = make();
    monitor.force(2);
    run(monitor, 47, 30);
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

  it('reapply 重发当前级别（resize 后重算像素比用）', () => {
    const { monitor, applied } = make();
    monitor.force(2);
    monitor.reapply();
    expect(applied).toHaveLength(3);
    expect(applied.at(-1)).toEqual({ level: 2, label: '均衡', ratio: 1.25, glass: 'high', bloom: true, pixels: 3.2e6, shadowHz: 12 });
  });
});

describe('budgetRatio', () => {
  it('预算为 null（最高档）直接用基准 dpr', () => {
    expect(budgetRatio(null, 3840, 2160, 2)).toBe(2);
  });

  it('小窗口预算用不完 → 保持基准 dpr', () => {
    // 400×300 = 12 万像素，预算 65 万 → sqrt(5.4) ≈ 2.33，被 base=2 夹住
    expect(budgetRatio(6.5e5, 400, 300, 2)).toBe(2);
  });

  it('4K 全屏按 sqrt(预算/窗口像素) 缩，触底保底', () => {
    // 3840×2160 ≈ 829 万像素，预算 120 万 → sqrt ≈ 0.38 → 下限 0.6
    expect(budgetRatio(1.2e6, 3840, 2160, 2)).toBe(0.6);
    // 预算 460 万（均衡 1 档）→ sqrt(0.5547) ≈ 0.745
    expect(budgetRatio(4.6e6, 3840, 2160, 2)).toBeCloseTo(0.7447, 3);
  });

  it('1080p 窗口下预算 ≈ 各档像素比的平方 × 窗口像素（与旧行为衔接）', () => {
    // 旧 L1 = 1.5² × 207 万 ≈ 466 万：预算 4.6e6 → sqrt(2.218) ≈ 1.489 ≈ 旧 1.5
    expect(budgetRatio(4.6e6, 1920, 1080, 2)).toBeCloseTo(1.489, 2);
  });

  it('像素比上限低于预算算出的值时以 base 为准（小窗口 + 低档）', () => {
    // 预算 65 万、窗口 40 万像素 → sqrt ≈ 1.27，base=1 → 结果 1
    expect(budgetRatio(6.5e5, 500, 800, 1)).toBe(1);
  });

  it('非法尺寸不除零', () => {
    expect(budgetRatio(1e6, 0, 0, 1.5)).toBe(1.5);
  });
});
