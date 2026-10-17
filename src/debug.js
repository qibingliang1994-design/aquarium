import { U } from './uniforms.js';
import { sstep } from './utils.js';

/* ================================================================
 * window.__aqDebug：自动化验证用的调试钩子
 * 鱼的索引是 (schoolIndex, fishIndex)，schoolIndex 指当前场景里实际存在的鱼群（按 SPECIES 顺序，数量为 0 的物种不占位）
 * ================================================================ */

export function installDebug(d){
  const { schools, feeder, dayNight, input, fishCard, runtime, store, editor, camera, controls, bloom, scene,
    hoodSpot, waterMesh, glassHigh, modelPreviewStats, updateCareHud, switchScene, stopCamTween }=d;
  const care=()=>runtime.care;
  const sleep=()=>sstep(0.55,0.9,dayNight.k)*(1-U.excite.value)*(1-input.fear);
  window.__aqDebug={
    time:()=>U.time.value,
    pelletCount:()=>feeder.items.filter(it=>it&&!(it.eaten>0)).length,
    excite:()=>U.excite.value,
    night:()=>dayNight.k,
    modelStatus:()=>modelPreviewStats(),
    pickAt:(x,y)=>{ const h=fishCard.pick(x,y); return h?{ id:h.school.spec.id, n:h.fid, glb:h.school.glbMode }:null; },
    satiety:()=>+care().satiety.toFixed(3),
    setSatiety:v=>{ care().satiety=v; updateCareHud(); },
    appetite:()=>+care().appetite().toFixed(3),
    fear:()=>input.fear,
    sleep:()=>+sleep().toFixed(3),
    tapGlass:(x,y)=>input.tapGlass(x,y),
    growthOf:(si,ii)=>({ target:+schools[si].growthTarget[ii].toFixed(3), now:+schools[si].growth[ii].toFixed(3) }),
    feed:()=>input.feedAt(d.randomFeedPoint()),
    tpFish:(si,ii,x,y,z)=>{ const s=schools[si]; s.pos[ii].set(x,y,z); s.vel[ii].set(0.15,0,0);
      if(s.glbMode && s.fishes[ii]){ s.fishes[ii].position.copy(s.pos[ii]); } },
    posOf:(si,ii)=>schools[si].pos[ii].toArray(),
    restState:(si,ii)=>{ const r=schools[si].rest; return r?{on:r[ii].on,t:+r[ii].t.toFixed(1),dur:+r[ii].dur.toFixed(1)}:null; },
    velOf:(si,ii)=>schools[si].vel[ii].toArray().map(v=>+v.toFixed(3)),
    bloom:on=>{ bloom.enabled=on; },
    scene:()=>scene,
    hide:(what,on)=>{ if(what==='light') hoodSpot.visible=!on; if(what==='water') waterMesh.visible=!on; if(what==='glass') glassHigh.visible=!on; },
    restP:(si,ii)=>schools[si].rest?schools[si].rest[ii].p.toArray().map(v=>+v.toFixed(2)):null,
    snapTo:(si,ii)=>{ const p=schools[si].pos[ii];
      camera.position.set(p.x+0.55, p.y+0.14, p.z+0.75);
      controls.target.copy(p); stopCamTween(); },
    projectFish:(si,ii)=>{ const p=schools[si].pos[ii].clone(); p.project(camera);
      return { x:Math.round((p.x+1)/2*innerWidth), y:Math.round((1-p.y)/2*innerHeight) }; },
    look:(pos,tgt)=>{ camera.position.set(...pos); controls.target.set(...tgt); stopCamTween(); },
    // —— 场景系统 ——
    schoolIds:()=>schools.map(s=>`${s.spec.id}:${s.spec.count}`),
    sceneId:()=>store.activeId,
    scenes:()=>store.list().map(s=>({ id:s.id, name:s.name, items:s.items.length })),
    switchScene:id=>switchScene(id),
    itemCount:()=>runtime.itemsGroup.children.length,
    obstacleCount:()=>d.obstacles.length,
    air:()=>({ ...d.air }),
    editor:()=>editor,
    projectItem:id=>{ const r=runtime.rootOf(id); if(!r) return null; const p=r.position.clone(); p.y+=0.05; p.project(camera);
      return { x:Math.round((p.x+1)/2*innerWidth), y:Math.round((1-p.y)/2*innerHeight) }; },
  };
}
