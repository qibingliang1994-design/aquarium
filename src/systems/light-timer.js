// @ts-check
import { sstep } from '../utils.js';

/* ================================================================
 * 灯光定时器（纯函数）：跟随本地时间给出昼夜 k（0 = 白天，1 = 夜里）
 * 渐变落在开灯时段之内：开灯时刻起 ramp 分钟慢慢亮起（日出），关灯时刻前 ramp 分钟慢慢暗下（日落），
 * 到关灯时刻已是月光。关灯早于开灯时（夜班作息）按跨午夜处理。
 * ================================================================ */

/** @typedef {{ on?:string, off?:string, ramp?:number }} TimerOpts */
export const DEFAULT_TIMER={ on:'8:00', off:'21:30', ramp:45 };
const DAY_MIN=24*60;

/** "8:00" → 480（分钟），格式不对返回 NaN @param {string} hhmm */
export function parseClock(hhmm){
  const m=/^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if(!m) return NaN;
  const h=+m[1], mi=+m[2];
  return h<24 && mi<60 ? h*60+mi : NaN;
}

/** @param {Date} date @param {TimerOpts} [opts] @returns {number} 0..1 */
export function clockNight(date, { on=DEFAULT_TIMER.on, off=DEFAULT_TIMER.off, ramp=DEFAULT_TIMER.ramp }={}){
  const a=parseClock(on), b=parseClock(off);
  if(!Number.isFinite(a) || !Number.isFinite(b) || a===b) return 0;
  const now=date.getHours()*60+date.getMinutes()+date.getSeconds()/60;
  const span=(b-a+DAY_MIN)%DAY_MIN;              // 开灯时长（跨午夜也成立）
  const t=(now-a+DAY_MIN)%DAY_MIN;               // 开灯后过了多少分钟
  if(t>=span) return 1;                          // 关灯时段
  const r=Math.max(1e-3, Math.min(ramp, span/2));
  const light=Math.min(sstep(0, r, t), sstep(0, r, span-t));
  return 1-light;
}
