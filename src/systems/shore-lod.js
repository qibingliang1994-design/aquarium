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
