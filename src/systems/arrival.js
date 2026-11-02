// @ts-check
import { SPECIES } from '../entities/fish/species.js';
import { SPECIES_META } from '../ui/encyclopedia.js';

/* ================================================================
 * 亲密度里程碑发鱼（care.milestoneDue → runtime.addFish → store.save）
 * 攒够全缸累计饲料数就原地给缸里添一条新鱼，不重建鱼群；
 * 领取顺序按当前在场的物种轮转（从 bondLevel 取模起头），缸满则里程碑转为光泽度
 * ================================================================ */

/**
 * @param {{ runtime:any, store:any, toast:(msg:string)=>void, sound:{ arrival:()=>void }, updateHud:()=>void }} deps
 *   副作用全部显式传入：runtime 加鱼 / 差量应用、store 落盘、toast 提示、sound 音效、updateHud 刷新圆环
 */
export function createArrival({ runtime, store, toast, sound, updateHud }){
  /** 领取当前里程碑：先试按轮转顺序加一条鱼；没有物种能再加就把里程碑转为光泽度 */
  function grant(){
    const care=runtime.care;
    const present=SPECIES.filter(s=>runtime.doc.fish[s.id]>0);
    const start=care.bondLevel%Math.max(1,present.length);
    for(let k=0;k<present.length;k++){
      const spec=present[(start+k)%present.length];
      if(!runtime.addFish(spec.id)) continue;
      care.takeMilestone();
      try{ runtime.apply(store.save(runtime.doc)); }   // 计数已同步到文档：差量应用不会重建鱼群
      catch(err){ console.warn('[bond] 入缸存档失败（本次仍可见）', err); }
      toast(`亲密度 Lv.${care.bondLevel}：一条${SPECIES_META[spec.id].name}入缸了`);
      sound.arrival();
      updateHud();
      return;
    }
    care.takeMilestone();                       // 缸满了：里程碑转为光泽度
  }
  return { grant };
}
