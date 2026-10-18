// @ts-check
import { clamp, sstep } from '../utils.js';

/** @typedef {{ id:string, count:number }} SpeciesLike */
/** @typedef {{ satiety?:unknown, t?:unknown, fed?:Record<string, unknown>, bond?:unknown, milestones?:unknown }} CareSave */

/* ================================================================
 * 饲养状态：全缸饱食度 + 个体成长 + 亲密度（localStorage 持久化）
 * 饱食度 0..1：每吃到一颗饲料 +PELLET_SATIETY，随时间线性衰减（离线也算）；
 * 食欲 = f(饥饿度)，决定鱼群是否抢食与兴奋度上限。
 * 成长：每条鱼累计吃到的饲料数 → 体型 1.0 ~ 1+GROW_MAX。
 * 亲密度 bond：全缸累计吃到的饲料数，只增不减；每跨过一个 MILESTONES 阈值
 * 发一条新鱼（scene-runtime.addFish），全部里程碑之后转为"光泽度"。
 * ================================================================ */
const DEFAULT_KEY='aquarium.care';
const DECAY_PER_SEC=1/180;       // 吃饱后约 3 分钟饿回来
const PELLET_SATIETY=0.025;      // 一轮 10 颗全吃完 = +0.25
const GROW_PELLETS=30;           // 个体累计吃 30 颗长到上限（约 20 轮喂食可见变化）
const GROW_MAX=0.25;             // 成长上限：体长 +25%
const SAVE_INTERVAL=2;           // 有改动时最多每 2 秒落盘一次
/** 亲密度里程碑（全缸累计吃到饲料数）：8 / 20 / 40 / 70 / 110 轮各来一条新鱼 */
export const MILESTONES=[80,200,400,700,1100,1600];
const GLOSS_SPAN=600;            // 最后一个里程碑之后再吃 600 颗，光泽度满

/** @type {[number, string][]} */
const STATUS=[ [0.75,'饥肠辘辘'], [0.45,'觅食中'], [0.15,'半饱'], [-1,'酒足饭饱'] ];

/** @param {string} key @returns {CareSave} */
function loadState(key){
  try{ return JSON.parse(localStorage.getItem(key)||'{}')||{}; }
  catch(err){ console.warn('[care] 读取饲养存档失败，使用初始状态', err); return {}; }
}

/** 每个场景一份存档：key 由场景系统传入（scenes/scene-store.js careKey）
 * @param {SpeciesLike[]} species @param {{ key?:string }} [opts] */
export function createCare(species, { key=DEFAULT_KEY }={}){
  const saved=loadState(key);
  const elapsed=typeof saved.t==='number' && Number.isFinite(saved.t) ? Math.max(0,(Date.now()-saved.t)/1000) : 0;
  const savedSatiety=Number(saved.satiety);
  let satiety=clamp((Number.isFinite(savedSatiety)?savedSatiety:0.3)-elapsed*DECAY_PER_SEC, 0, 1);
  /** @type {Record<string, number[]>} */
  const fed={};
  /** @type {Record<string, number>} */
  const counts={};
  for(const s of species){
    counts[s.id]=s.count;
    const raw=saved.fed?.[s.id];
    const arr=Array.isArray(raw) ? raw : [];
    // 保留存档里多出来的个体：编辑器里临时减鱼再取消，不丢成长
    fed[s.id]=Array.from({length:Math.min(64,Math.max(s.count,arr.length))},(_,i)=>Math.max(0,Number(arr[i])||0));
  }
  // 亲密度只增不减，离线不衰减
  let bond=Math.max(0, Math.floor(Number(saved.bond)||0));
  let milestonesDone=clamp(Math.floor(Number(saved.milestones)||0), 0, MILESTONES.length);
  let dirty=false, saveTimer=SAVE_INTERVAL;
  // 最近一次把饱食度结算到"现在"的墙钟时间：标签页在后台时 rAF 停摆、dt 被钳，
  // 回来后（或后台直接关页）按墙钟补扣，和关掉重开的离线衰减一致
  let lastT=Date.now();
  const STALL_SECS=1;              // 两次结算间隔超过它，视为渲染循环停过，按墙钟补算
  /** 按墙钟补算停摆期间的衰减；返回本次实际用的秒数 @param {number} dt */
  function settle(dt){
    const now=Date.now(), gap=(now-lastT)/1000;
    lastT=now;
    const step=gap>STALL_SECS ? gap : dt;
    satiety=Math.max(0,satiety-step*DECAY_PER_SEC);
    return step;
  }

  /** @type {(id:string, i:number)=>number} */
  const growthProgress=(id,i)=>Math.min(1,(fed[id]?.[i]??0)/GROW_PELLETS);
  /** @type {(id:string, i:number)=>number} */
  const growthOf=(id,i)=>1+GROW_MAX*growthProgress(id,i);

  function save(){
    if(Date.now()-lastT>STALL_SECS*1000) settle(0);   // 后台挂着直接关页：先补扣再落盘，否则这段时间永久丢失
    try{ localStorage.setItem(key, JSON.stringify({ satiety, t:Date.now(), fed, bond, milestones:milestonesDone })); dirty=false; }
    catch(err){ console.warn('[care] 保存饲养存档失败', err); }
  }
  addEventListener('pagehide', save);

  return {
    get satiety(){ return satiety; },
    set satiety(/** @type {number} */ v){ satiety=clamp(v,0,1); dirty=true; },
    // 食欲 0..1：饱食度 ≥0.96 时几乎为 0（饲料沉底无人理）
    appetite:()=>sstep(0.04,0.6,1-satiety),
    /** @returns {string} */
    status:()=>(STATUS.find(([k])=>1-satiety>k) ?? STATUS[STATUS.length-1])[1],
    growthOf,
    growthProgress,
    growthArray:(/** @type {string} */ id)=>Array.from({length:counts[id]??0},(_,i)=>growthOf(id,i)),
    // 一颗饲料被吃：饱食度↑、个体成长、亲密度 +1；返回该鱼新的体型系数
    /** @param {string} id @param {number} i */
    eat(id,i){
      satiety=Math.min(1,satiety+PELLET_SATIETY);
      bond+=1;
      const arr=fed[id] ?? (fed[id]=[]);
      while(arr.length<=i) arr.push(0);        // 新入缸的鱼也能记成长
      arr[i]+=1;
      counts[id]=Math.max(counts[id]??0, i+1);
      dirty=true;
      return growthOf(id,i);
    },
    // —— 亲密度：里程碑到达 → 调用方安排新鱼入缸；满了之后 bond 转为光泽度 ——
    /** @returns {boolean} 是否有未领取的里程碑 */
    milestoneDue:()=>milestonesDone<MILESTONES.length && bond>=MILESTONES[milestonesDone],
    /** 领取当前里程碑（编辑器打开时不要领取，等退出后再发鱼） */
    takeMilestone(){
      if(!this.milestoneDue()) return false;
      milestonesDone++; dirty=true;
      return true;
    },
    get bondLevel(){ return milestonesDone; },
    /** 距离下一个里程碑的进度 0..1（全部领完后为光泽度进度） */
    bondProgress(){
      if(milestonesDone>=MILESTONES.length) return clamp((bond-MILESTONES[MILESTONES.length-1])/GLOSS_SPAN,0,1);
      const lo=milestonesDone?MILESTONES[milestonesDone-1]:0, hi=MILESTONES[milestonesDone];
      return clamp((bond-lo)/(hi-lo),0,1);
    },
    /** 光泽度 0..1：全部里程碑领完后的余量换"鱼更亮" */
    glossK(){ return milestonesDone>=MILESTONES.length ? clamp((bond-MILESTONES[MILESTONES.length-1])/GLOSS_SPAN,0,1) : 0; },
    /** @param {number} dt 秒 */
    update(dt){
      saveTimer-=settle(dt);
      if(saveTimer<=0){ saveTimer=SAVE_INTERVAL; if(dirty) save(); }
    },
    save,
    // 切换场景/改鱼群前调用：落盘并解除页面关闭监听
    dispose(){ save(); removeEventListener('pagehide', save); },
  };
}
