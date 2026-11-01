// @ts-check
import { clamp } from '../utils.js';

/* ================================================================
 * 岸边景物的画质档。纯逻辑：草叶 / 枫叶保留比例，以及加密草丛要不要画。
 * 最低档仍留一丛草的骨架，只是更稀。
 * ================================================================ */

/** @typedef {{ grass:number, leaf:number, extra:boolean }} ShoreLod */

const GRASS = [1, 0.82, 0.66, 0.52, 0.4, 0.28, 0.16];
const LEAF = [1, 0.86, 0.72, 0.58, 0.46, 0.32, 0.18];

/** @param {number} level 0 高清 .. 6 极速 @returns {ShoreLod} */
export function shoreLod(level){
  const i = clamp(Number.isFinite(level) ? level|0 : 0, 0, GRASS.length-1);
  return { grass:GRASS[i] ?? 0.16, leaf:LEAF[i] ?? 0.18, extra:i<4 };
}

/* 缸内水草丛（一丛 = 一个 InstancedMesh，实例 = 一株）的保留比例：致敬水景一缸几十丛、上百万三角形，
 * 弱机降档时整体变稀而不是整丛消失；高清档全留，最低档留一半出头 */
const PLANT = [1, 0.93, 0.86, 0.78, 0.7, 0.62, 0.54];
/** @param {number} level 0 高清 .. 6 极速 */
export function plantKeep(level){
  return PLANT[clamp(Number.isFinite(level) ? level|0 : 0, 0, PLANT.length-1)] ?? 0.54;
}
