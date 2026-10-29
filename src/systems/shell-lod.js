// @ts-check
import { clamp } from '../utils.js';

/* ================================================================
 * 自然水域外壳的散布密度。纯逻辑，跟自动画质的 7 档走。
 * 只减实例数量（草 / 芦苇 / 卵石 / 浮叶 / 岸石），不重建地形网格——
 * 高度场每档重算会在自动降档时卡一下，和像素预算那条路叠在一起不划算。
 * ================================================================ */

/** 0 高清满密度 .. 6 极速仍留约两成，避免岸上一下秃掉 */
const DENSITY = [1, 0.86, 0.72, 0.58, 0.46, 0.34, 0.22];

/** @param {number} level @returns {number} 0..1 */
export function shellDensity(level){
  const i = clamp(Number.isFinite(level) ? level|0 : 0, 0, DENSITY.length-1);
  return DENSITY[i] ?? 0.22;
}

/** 按满数量和画质档得到实际绘制条数。大片至少留 3，小片至少留 1。
 * @param {number} full @param {number} level */
export function shellCount(full, level){
  const n = Math.max(0, Math.floor(full));
  if(n<=0) return 0;
  const min = n>12 ? 3 : 1;
  return Math.min(n, Math.max(min, Math.round(n*shellDensity(level))));
}
