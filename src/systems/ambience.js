// @ts-check
import { clockNight } from './light-timer.js';
import { createTurbidity } from './turbidity.js';
import { canWrite } from './write-lock.js';
import { U } from '../uniforms.js';

/* ================================================================
 * 氛围接线（main 每帧只调一次 update）：
 * - 灯光定时器：settings.clock 开时按本地时间驱动昼夜（与 180 s 自动循环互斥，由 main 的设置回调保证）
 * - 开缸清澈化：新建空缸 / 首次进入某水景 / 造景保存后 kick 一下，约 5 秒转清。
 *   玻璃缸 → 镜头 pass 的水体纵深加浓（uTurb）+ 悬浮颗粒 ×3；自然水域 → 雾加浓、水面通透度 uClear 降低。
 * 已见过的水景 id 存在 localStorage['aquarium.seen']；键不存在时（升级前的老玩家 / 第一次启动）
 * 把现有水景全部记为见过——第一印象不被一缸浑水打断，此后新建与新发放的预设才触发。
 * ================================================================ */
const SEEN_KEY='aquarium.seen';
const CLOCK_EVERY=1;               // 秒：本地时间每秒取一次就够（渐变 45 分钟）
const FIRST_KICK=1, SAVE_KICK=0.45;

/** @returns {Set<string>|null} */
function loadSeen(){
  try{ const raw=JSON.parse(localStorage.getItem(SEEN_KEY) ?? 'null'); return Array.isArray(raw) ? new Set(raw.map(String)) : null; }
  catch(err){ console.warn('[ambience] 读取已见水景失败', err); return null; }
}

/**
 * @param {{ settings:Record<string, any>, dayNight:any, lens:any, snow:any, scene:any, waterUniforms:any,
 *   isNatural:()=>boolean, knownIds:string[], onFlip?:()=>void, weather:any,
 *   murkBase?:()=>number, onWeather?:(st:any)=>void }} opts
 *   onFlip：定时器让昼夜跨过半程时回调（同步 Dock 日/夜按钮）
 *   onWeather：自动轮换切到下一种天气时回调（落盘，不要每帧写）
 */
export function createAmbience({ settings, dayNight, lens, snow, scene, waterUniforms, isNatural, knownIds, onFlip, weather, murkBase, onWeather }){
  const turb=createTurbidity();
  let seen=loadSeen();
  const saveSeen=()=>{ if(!canWrite() || !seen) return;
    try{ localStorage.setItem(SEEN_KEY, JSON.stringify([...seen])); }catch(err){ console.warn('[ambience] 保存已见水景失败', err); } };
  if(!seen){ seen=new Set(knownIds); saveSeen(); }

  /** 调试用：固定"现在"（null = 真实时间） @type {Date|null} */ let clockOverride=null;
  const now=()=>clockOverride ?? new Date();
  let clockAcc=CLOCK_EVERY, side=dayNight.target>0.5;
  if(settings.clock) dayNight.jump(clockNight(now()));   // 启动即对上本地时间，不从存档的昼夜慢慢过渡

  return {
    get turbidity(){ return turb.value; },
    /** @param {number} s 0..1 */
    kick:(s)=>turb.kick(s),
    /** 进入某个水景（切换揭幕后调用）：第一次来时水有点浑 @param {string} id */
    enterScene(id){
      if(!seen || seen.has(id)) return;
      seen.add(id); saveSeen();
      turb.kick(FIRST_KICK);
    },
    /** 造景保存后："刚动过底床，水有点浑" */
    afterSave(){ turb.kick(SAVE_KICK); },
    /** @param {Date|null} d */
    setClock(d){ clockOverride=d; clockAcc=CLOCK_EVERY; },
    /** @param {number} dt @param {number} t */
    update(dt, t){
      const st=weather.step(dt);
      dayNight.setWeather(st);
      U.wet.value=st.wet;
      if(waterUniforms.uMurk) waterUniforms.uMurk.value=(murkBase?.() ?? 0)+st.rain*0.5;
      if(st.changed) onWeather?.(st);
      if(settings.clock && (clockAcc+=dt)>=CLOCK_EVERY){ clockAcc=0; dayNight.target=clockNight(now()); }
      dayNight.update(dt, t, settings.cycle);
      if((dayNight.target>0.5)!==side){ side=!side; onFlip?.(); }

      const v=turb.update(dt), nat=isNatural();
      lens.uniforms.uTurb.value=nat ? 0 : v;
      snow.setDensity(1+2*v);
      scene.fog.density=dayNight.fogD*(1+(nat ? 2.5 : 0)*v);
      if(nat) waterUniforms.uClear.value=1-0.6*v;
    },
  };
}
