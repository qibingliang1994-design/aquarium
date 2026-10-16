// @ts-check
import { clamp, sstep } from '../utils.js';

/** @typedef {{ id:string, count:number }} SpeciesLike */
/** @typedef {{ satiety?:unknown, t?:unknown, fed?:Record<string, unknown> }} CareSave */

/* ================================================================
 * 饲养状态：全缸饱食度 + 个体成长（localStorage 持久化）
 * 饱食度 0..1：每吃到一颗饲料 +PELLET_SATIETY，随时间线性衰减（离线也算）；
 * 食欲 = f(饥饿度)，决定鱼群是否抢食与兴奋度上限。
 * 成长：每条鱼累计吃到的饲料数 → 体型 1.0 ~ 1+GROW_MAX。
 * ================================================================ */
const STORE_KEY='aquarium.care';
const DECAY_PER_SEC=1/180;       // 吃饱后约 3 分钟饿回来
const PELLET_SATIETY=0.025;      // 一轮 10 颗全吃完 = +0.25
const GROW_PELLETS=30;           // 个体累计吃 30 颗长到上限（约 20 轮喂食可见变化）
const GROW_MAX=0.25;             // 成长上限：体长 +25%
const SAVE_INTERVAL=2;           // 有改动时最多每 2 秒落盘一次

/** @type {[number, string][]} */
const STATUS=[ [0.75,'饥肠辘辘'], [0.45,'觅食中'], [0.15,'半饱'], [-1,'酒足饭饱'] ];

/** @returns {CareSave} */
function loadState(){
  try{ return JSON.parse(localStorage.getItem(STORE_KEY)||'{}')||{}; }
  catch(err){ console.warn('[care] 读取饲养存档失败，使用初始状态', err); return {}; }
}

/** @param {SpeciesLike[]} species */
export function createCare(species){
  const saved=loadState();
  const elapsed=typeof saved.t==='number' && Number.isFinite(saved.t) ? Math.max(0,(Date.now()-saved.t)/1000) : 0;
  const savedSatiety=Number(saved.satiety);
  let satiety=clamp((Number.isFinite(savedSatiety)?savedSatiety:0.3)-elapsed*DECAY_PER_SEC, 0, 1);
  /** @type {Record<string, number[]>} */
  const fed={};
  for(const s of species){
    const raw=saved.fed?.[s.id];
    const arr=Array.isArray(raw) ? raw : [];
    fed[s.id]=Array.from({length:s.count},(_,i)=>Math.max(0,Number(arr[i])||0));
  }
  let dirty=false, saveTimer=SAVE_INTERVAL;

  /** @type {(id:string, i:number)=>number} */
  const growthProgress=(id,i)=>Math.min(1,(fed[id]?.[i]??0)/GROW_PELLETS);
  /** @type {(id:string, i:number)=>number} */
  const growthOf=(id,i)=>1+GROW_MAX*growthProgress(id,i);

  function save(){
    try{ localStorage.setItem(STORE_KEY, JSON.stringify({ satiety, t:Date.now(), fed })); dirty=false; }
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
    growthArray:(/** @type {string} */ id)=>fed[id].map((_,i)=>growthOf(id,i)),
    // 一颗饲料被吃：饱食度↑、个体成长；返回该鱼新的体型系数
    /** @param {string} id @param {number} i */
    eat(id,i){
      satiety=Math.min(1,satiety+PELLET_SATIETY);
      if(fed[id] && i<fed[id].length) fed[id][i]+=1;
      dirty=true;
      return growthOf(id,i);
    },
    /** @param {number} dt 秒 */
    update(dt){
      satiety=Math.max(0,satiety-dt*DECAY_PER_SEC);
      saveTimer-=dt;
      if(saveTimer<=0){ saveTimer=SAVE_INTERVAL; if(dirty) save(); }
    },
    save,
  };
}
