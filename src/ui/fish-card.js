import * as THREE from 'three';
import { SPECIES_META } from './encyclopedia.js';

/* ================================================================
 * 识鱼：射线拾取（GLB 逐条模型 / 程序化 InstancedMesh）+ 资料卡片
 * ================================================================ */
const CARD_W=284, CARD_H=236, CARD_MS=6000;

export function createFishCard({ camera, schools, care }){
  const raycaster=new THREE.Raycaster(), ndc=new THREE.Vector2();
  const $=id=>document.getElementById(id);
  const cardEl=$('fishCard');
  let timer=null;

  function pick(cx,cy){
    ndc.set((cx/innerWidth)*2-1, -(cy/innerHeight)*2+1);
    raycaster.setFromCamera(ndc,camera);
    let best=null;
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
  function findFishIndex(obj){
    for(let o=obj; o; o=o.parent) if(o.userData.fishIndex!==undefined) return o.userData.fishIndex;
    return 0;
  }

  function show(hit,cx,cy){
    const s=hit.school, m=SPECIES_META[s.spec.id];
    const grow=care.growthProgress(s.spec.id,hit.fid);
    cardEl.dataset.species=s.spec.id;           // 物种强调色（CSS）
    $('fcTitle').textContent=m.name;
    $('fcNo').textContent=`#${hit.fid+1}`;
    $('fcLatin').textContent=m.latin;
    $('fcZone').textContent=m.zone;
    $('fcSize').textContent=m.size;
    $('fcBehavior').textContent=m.behavior;
    $('fcDiet').textContent=m.diet;
    $('fcMood').textContent=care.status();
    $('fcGrowBar').style.width=`${Math.round(grow*100)}%`;
    $('fcGrowth').textContent=grow>=1 ? '已长成' : `${Math.round(grow*100)}%`;
    cardEl.hidden=false;
    cardEl.style.left=`${Math.min(cx+14, innerWidth-CARD_W)}px`;
    cardEl.style.top =`${Math.min(cy+14, innerHeight-CARD_H)}px`;
    clearTimeout(timer); timer=setTimeout(hide, CARD_MS);
  }
  function hide(){ cardEl.hidden=true; }
  $('fcClose').addEventListener('click',hide);

  return { pick, show, hide };
}
