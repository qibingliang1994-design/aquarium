// @ts-check
import * as THREE from 'three';
import { SPECIES_META } from './encyclopedia.js';
import { schoolNames, personaTags } from '../entities/fish/identity.js';

/* ================================================================
 * 识鱼：射线拾取（GLB 逐条模型 / 程序化 InstancedMesh）+ 资料卡片
 * 卡片带个体身份：名字（getName，随场景确定性生成）与个性标签（真实行为统计）
 * ================================================================ */
const CARD_W=284, CARD_H=268, CARD_MS=6000;

/** @param {{ camera:any, schools:any[], getCare:()=>any, getSceneId?:()=>string }} opts */
export function createFishCard({ camera, schools, getCare, getSceneId }){   // getCare/getSceneId：随场景切换
  const raycaster=new THREE.Raycaster();
  const $=(/** @type {string} */ id)=>{ const el=document.getElementById(id); if(!el) throw new Error(`missing #${id}`); return el; };
  const cardEl=$('fishCard');
  /** @type {number|undefined} */ let timer;
  /** 卡片打开期间的那条鱼（景深对焦用） @type {{ school:any, fid:number }|null} */ let focused=null;

  function pick(/** @type {number} */ cx, /** @type {number} */ cy){
    const ndc=new THREE.Vector2((cx/innerWidth)*2-1, -(cy/innerHeight)*2+1);
    raycaster.setFromCamera(ndc,camera);
    /** @type {any} */ let best=null;
    for(const s of schools){
      const hit=s.glbMode
        ? raycaster.intersectObjects(s.group.children,true)[0]
        : raycaster.intersectObject(s.mesh,false)[0];
      if(!hit || (best && hit.distance>=best.distance)) continue;
      const fid=s.glbMode ? findFishIndex(hit.object) : hit.instanceId;
      best={ distance:hit.distance, fid, school:s };
    }
    return best;
  }
  // GLB 命中的是子网格：向上找带 fishIndex 的克隆根
  function findFishIndex(/** @type {any} */ obj){
    for(let o=obj; o; o=o.parent) if(o.userData.fishIndex!==undefined) return o.userData.fishIndex;
    return 0;
  }

  function show(/** @type {any} */ hit, /** @type {number} */ cx, /** @type {number} */ cy){
    const s=hit.school, m=SPECIES_META[s.spec.id];
    const care=getCare(), grow=care.growthProgress(s.spec.id,hit.fid);
    const name=getSceneId ? schoolNames(getSceneId(), s.spec.id, s.spec.count)[hit.fid] : null;
    cardEl.dataset.species=s.spec.id;           // 物种强调色（CSS）
    $('fcTitle').textContent=name ?? m.name;
    $('fcNo').textContent=`#${hit.fid+1}${name ? ' · '+m.name : ''}`;
    $('fcLatin').textContent=m.latin;
    $('fcZone').textContent=m.zone;
    $('fcSize').textContent=m.size;
    $('fcBehavior').textContent=m.behavior;
    $('fcDiet').textContent=m.diet;
    $('fcMood').textContent=care.status();
    $('fcTags').innerHTML=personaTags(s.persona(hit.fid), s.personaAvg())
      .map(t=>`<span class="tag">${t}</span>`).join('');
    const bar=/** @type {HTMLElement} */ ($('fcGrowBar'));
    bar.style.width=`${Math.round(grow*100)}%`;
    $('fcGrowth').textContent=grow>=1 ? '已长成' : `${Math.round(grow*100)}%`;
    cardEl.hidden=false;
    focused={ school:s, fid:hit.fid };
    cardEl.style.left=`${Math.min(cx+14, innerWidth-CARD_W)}px`;
    cardEl.style.top =`${Math.min(cy+14, innerHeight-CARD_H)}px`;
    clearTimeout(timer); timer=setTimeout(hide, CARD_MS);
  }
  function hide(){ cardEl.hidden=true; focused=null; }
  $('fcClose').addEventListener('click',hide);

  /** 卡片打开时返回那条鱼的世界坐标（写入 out），否则 null @param {THREE.Vector3} out */
  function focusPoint(out){
    if(!focused || !focused.school.pos[focused.fid]) return null;
    return focused.school.group.localToWorld(out.copy(focused.school.pos[focused.fid]));
  }

  return { pick, show, hide, focusPoint };
}
