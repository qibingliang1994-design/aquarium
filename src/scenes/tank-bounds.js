// @ts-check
import { TANK_STYLES } from './tank-styles.js';

/* ================================================================
 * 水体边界的单一来源。
 * 默认缸（与 scene/tank.js 的 TANK 一致：4.6×2.2×1.8，玻璃 0.035，水面 1.84）
 * 按历史内缩推出活动范围，并吸附回当年写死的字面量——现有缸型不带 volume，
 * 行为与改前逐值相同。带 volume 的缸型（大户外池塘）用同一套内缩。
 * ================================================================ */

/** @typedef {{ W:number, H:number, D:number, glass:number, waterY:number }} TankVolume */
/** @typedef {{ x:number, z:number }} Half */
/** @typedef {{ volume:TankVolume, swim:Half, place:Half, glassInner:Half, shore:Half, feed:Half, feedClick:Half,
 *   feedScatter:Half, feedReach:Half, yCeil:number, waterY:number,
 *   grid:{ min:{x:number,y:number,z:number}, max:{x:number,y:number,z:number} } }} TankBounds */

/** 与 scene/tank.js 的 TANK 保持一致（这里不 import tank.js，避免转向逻辑的单测拉起画布） */
export const DEFAULT_VOLUME = /** @type {TankVolume} */ ({ W:4.6, H:2.2, D:1.8, glass:0.035, waterY:1.84 });

/** 浮点噪声吸附：默认缸必须回到历史字面量（2.265 而不是 4.6/2-0.035 的 2.2649…）
 * @param {number} v @param {number} target */
const snap = (v, target) => Math.abs(v-target)<1e-6 ? target : v;

/** @param {TankVolume} vol @returns {TankBounds} */
export function deriveBounds(vol){
  const innerX = vol.W/2-vol.glass, innerZ = vol.D/2-vol.glass;
  const swim = { x:snap(innerX-0.135, 2.13), z:snap(innerZ-0.125, 0.74) };
  const place = { x:snap(innerX-0.215, 2.05), z:snap(innerZ-0.115, 0.75) };
  const glassInner = { x:snap(innerX, 2.265), z:snap(innerZ, 0.865) };
  const feed = { x:snap(innerX-0.065, 2.2), z:snap(innerZ-0.065, 0.8) };
  const feedClick = { x:snap(innerX-0.115, 2.15), z:snap(innerZ-0.085, 0.78) };
  const feedScatter = { x:snap(place.x*(1.1/2.05), 1.1), z:snap(place.z*(0.38/0.75), 0.38) };
  const feedReach = { x:snap(innerX*(6/2.265), 6), z:snap(innerZ*(3/0.865), 3) };
  const yCeil = snap(vol.waterY-0.18, 1.66);
  const gridY = snap(vol.waterY+0.06, 1.9);
  return {
    volume:vol, swim, place, glassInner, shore:{ x:place.x, z:place.z },
    feed, feedClick, feedScatter, feedReach, yCeil, waterY:vol.waterY,
    grid:{ min:{ x:-feed.x, y:0.1, z:-feed.z }, max:{ x:feed.x, y:gridY, z:feed.z } },
  };
}

export const DEFAULT_BOUNDS = deriveBounds(DEFAULT_VOLUME);
/** 历史导出名：转向 / 物件元数据继续用这两个字面量 */
export const SWIM = DEFAULT_BOUNDS.swim;
export const PLACE_BOUNDS = DEFAULT_BOUNDS.place;
export const GLASS_INNER = DEFAULT_BOUNDS.glassInner;

/** @type {Map<string, TankBounds>} */
const cache = new Map();

/** 某缸型的边界。没有 volume 的款式共用默认对象（玻璃缸与旧的自然水域都是它）
 * @param {string} id @returns {TankBounds} */
export function boundsFor(id){
  const style = TANK_STYLES[id];
  const vol = style?.volume;
  if(!vol) return DEFAULT_BOUNDS;
  let hit = cache.get(id);
  if(!hit){
    hit = deriveBounds(vol);
    if(style.shore) hit.shore = { x:style.shore.x, z:style.shore.z };
    cache.set(id, hit);
  }
  return hit;
}
