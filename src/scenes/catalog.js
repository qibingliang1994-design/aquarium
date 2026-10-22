// @ts-check
import { makeRng } from '../utils.js';
import { buildPlant, PLANT_TYPES } from './items/plants.js';
import { buildRock, buildRockTall, buildLiveRock, buildWood, buildMossBall, buildAirstone } from './items/decor.js';
import { buildLily, buildReeds, buildPebbles } from './items/wetland.js';
import { buildCoralBranch, buildCoralFan, buildCoralBrain, buildAnemone } from './items/corals.js';
import { buildTaihu } from './items/taihu.js';
import { buildBridge } from './items/bridge.js';
import { buildPorcelain } from './items/porcelain.js';
import { buildPine, buildMaple, buildBankGrass, buildLantern } from './items/shore.js';
import { ITEM_TYPES } from './item-meta.js';

/* ================================================================
 * 物件目录：type → 构建函数(rng, seed)。同一 seed 永远长成同一个样子
 * ================================================================ */

/** @type {Record<string, (rng:any, seed:number)=>any>} */
const BUILDERS = {
  rock: buildRock, rockTall: buildRockTall, liveRock: buildLiveRock, wood: buildWood, mossBall: buildMossBall, airstone: buildAirstone,
  lily: buildLily, reeds: buildReeds, pebbles: buildPebbles,
  taihu: buildTaihu, bridge: buildBridge, porcelain: buildPorcelain,
  coralBranch: buildCoralBranch, coralFan: buildCoralFan, coralBrain: buildCoralBrain, anemone: buildAnemone,
  pine: buildPine, maple: buildMaple, bankGrass: buildBankGrass, lantern: buildLantern,
};
for(const t of PLANT_TYPES) BUILDERS[t] = (/** @type {any} */ rng) => buildPlant(t, rng);

const missing = ITEM_TYPES.filter((/** @type {string} */ t)=>!BUILDERS[t]);
if(missing.length) console.warn('[catalog] 以下物件类型缺少构建函数：', missing);

/** 构建物件（局部坐标）。返回 { object, obstacles:[{c,r}] }，object 下的几何体归调用方释放 */
export function buildItem(/** @type {string} */ type, /** @type {number} */ seed){
  const build = BUILDERS[type];
  if(!build) throw new Error(`未知物件类型：${type}`);
  return build(makeRng(seed), seed);
}

/** 释放物件的几何体（材质是按类型共享的，不释放） */
export function disposeItem(/** @type {any} */ object){
  object.traverse((/** @type {any} */ o)=>{ if(o.geometry) o.geometry.dispose(); if(o.isInstancedMesh) o.dispose(); });
}
