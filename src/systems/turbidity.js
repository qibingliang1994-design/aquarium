// @ts-check
/* ================================================================
 * 开缸清澈化（纯逻辑）：浊度 0..1，kick 一下变浑，约 5 秒指数回落到清澈。
 * 只是画面：不计数值、不影响鱼。触发时机与画面映射见 systems/ambience.js。
 * ================================================================ */

/** 指数回落的时间常数（秒）：5 秒后剩约 6% */
export const TURBID_TAU=1.8;
/** 低于它视为已清澈（归零，停止写 uniform） */
const EPS=1e-3;

/** 浊度推进一步 @param {number} v @param {number} dt @param {number} [tau] */
export function decayTurbidity(v, dt, tau=TURBID_TAU){
  const n=v*Math.exp(-Math.max(0, dt)/tau);
  return n<EPS ? 0 : n;
}

export function createTurbidity({ tau=TURBID_TAU }={}){
  let v=0;
  return {
    get value(){ return v; },
    /** 变浑：取较大值（连续触发不叠加超过上限） @param {number} strength 0..1 */
    kick(strength){ const s=Number(strength); if(Number.isFinite(s)) v=Math.min(1, Math.max(v, s)); },
    /** @param {number} dt */
    update(dt){ v=decayTurbidity(v, dt, tau); return v; },
    clear(){ v=0; },
  };
}
