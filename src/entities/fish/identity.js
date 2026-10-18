// @ts-check
import { makeRng } from '../../utils.js';

/* ================================================================
 * 鱼的个体身份（纯逻辑，可单测）
 * - 名字：按（场景 id + 物种 + 序号）确定性生成，同一场景里同一条鱼
 *   刷新后名字不变；不需要持久化，也不怕存档丢失。
 * - 个性标签：由 School 每帧累计的真实行为统计（均速/转向/水层）
 *   映射成文案，观察时长不足时显示"观察中"。
 * ================================================================ */

/** 物种词头（外观联想，单字） @type {Record<string, string[]>} */
const PREFIX = {
  tetra:['霓','蓝','银','闪','虹'],
  gold:['橙','金','绣','汤','元'],
  angel:['纱','蝶','月','缎'],
  cory:['沙','盔','须','斑'],
  koi:['锦','丹','露','霞'],
  clown:['葵','橙','礁','斑'],
  lion:['缨','鬃','焰','爵'],
  mandarin:['麟','玢','青','琥'],
  parrot:['鹦','翎','翠','玳'],
};
/** 共用词尾（昵称感，单字）；词头 × 词尾 ≈ 48~60 个组合，够一缸鱼不重名 */
const SUFFIX = ['丸','崽','豆','球','宝','泡','灵','仙','侠','贝','丫','哥'];

/** @param {string} s */
function strHash(s){
  let h=2166136261>>>0;
  for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); }
  return h>>>0;
}

/** 第 i 条鱼的名字（attempt 仅供撞名重摇）
 * @param {string} sceneId @param {string} speciesId @param {number} i @param {number} [attempt] */
export function fishName(sceneId, speciesId, i, attempt=0){
  const rng=makeRng(strHash(`${sceneId}|${speciesId}|${i}|${attempt}`));
  const pre=PREFIX[speciesId] ?? PREFIX.tetra;
  return pre[Math.floor(rng()*pre.length)]+SUFFIX[Math.floor(rng()*SUFFIX.length)];
}

/** 一群鱼的名字（群内去重，同参数结果稳定）
 * @param {string} sceneId @param {string} speciesId @param {number} count */
export function schoolNames(sceneId, speciesId, count){
  /** @type {string[]} */
  const out=[];
  const used=new Set();
  for(let i=0;i<count;i++){
    let name=fishName(sceneId,speciesId,i);
    for(let k=1; used.has(name) && k<64; k++) name=fishName(sceneId,speciesId,i,k);
    used.add(name); out.push(name);
  }
  return out;
}

/** 个体行为统计（School 累计的滑动平均，全部归一化到 0..1）
 * @typedef {{ spd:number, turn:number, layer:number, obs:number }} PersonaStats
 * @typedef {{ spd:number, turn:number }} PersonaAvg（全群平均，用于相对比较） */

/** 个性标签：速度 / 好动 / 水层 各一条。个体与全群均值相对比较，
 * 保证一缸鱼里有急性子也有慢性子；水层看绝对位置（底栖种自然"底栖宅"）。
 * @param {PersonaStats} st @param {PersonaAvg} avg @returns {string[]} */
export function personaTags(st, avg){
  if(st.obs<8) return ['观察中'];
  const tags=[];
  if(st.spd>Math.max(0.75, avg.spd*1.18)) tags.push('急性子');
  else if(st.spd<Math.min(0.35, avg.spd*0.82)) tags.push('慢性子');
  else tags.push('从容');
  if(st.turn>avg.turn*1.2+0.02) tags.push('好动');
  else if(st.turn<avg.turn*0.8) tags.push('沉稳');
  else tags.push('安稳');
  if(st.layer>0.62) tags.push('上层巡游');
  else if(st.layer<0.38) tags.push('底栖宅');
  else tags.push('中层漫游');
  return tags;
}
