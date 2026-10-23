// @ts-check
import { clamp, lerp } from '../utils.js';

/* ================================================================
 * 自然水域平面反射的画质档与压暗。纯逻辑。
 * 最低档关闭。开着的档每帧都渲（隔帧更新会闪，不在这里做）。
 * ================================================================ */

/** @typedef {{ on:boolean, size:number }} ReflectTier */

/** 反射贴图短边。高档更清晰；极速档关。开着的档每帧都画 */
export const REFLECT_TIERS = /** @type {ReflectTier[]} */ ([
  { on:true, size:768 },
  { on:true, size:512 },
  { on:true, size:384 },
  { on:true, size:256 },
  { on:false, size:0 },
]);

/** @param {number} level */
export function reflectTier(level){
  const i = clamp(Number.isFinite(level) ? level|0 : 0, 0, REFLECT_TIERS.length-1);
  const t = REFLECT_TIERS[i] ?? REFLECT_TIERS[REFLECT_TIERS.length-1];
  return { on:t.on, size:t.size };
}

/** 掠射菲涅尔之外再乘的一层：雨、雾、夜晚把反射压暗，但不关
 * @param {number} nightK @param {{ rain?:number, fogAmt?:number, grey?:number }} [wx] */
export function reflectDim(nightK, wx={}){
  const k = clamp(Number.isFinite(nightK) ? nightK : 0, 0, 1);
  const rain = clamp(wx.rain ?? 0, 0, 1);
  const fog = clamp(wx.fogAmt ?? 0, 0, 1);
  const grey = clamp(wx.grey ?? 0, 0, 1);
  const day = lerp(1, 0.40, k);
  const dull = clamp(rain*0.32+fog*0.50+grey*0.10, 0, 0.75);
  return clamp(day*(1-dull), 0.06, 1);
}
