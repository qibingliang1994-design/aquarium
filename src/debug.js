// @ts-check
import { U } from './uniforms.js';
import { sstep } from './utils.js';
import { schoolNames, personaTags } from './entities/fish/identity.js';

/* ================================================================
 * window.__aqDebug：自动化验证用的调试钩子
 * 鱼的索引是 (schoolIndex, fishIndex)，schoolIndex 指当前场景里实际存在的鱼群（按 SPECIES 顺序，数量为 0 的物种不占位）
 * ================================================================ */

export function installDebug(/** @type {any} */  d){
  const { schools, feeder, dayNight, input, fishCard, runtime, store, editor, camera, controls, bloom, scene,
    hoodSpot, waterMesh, glassHigh, modelPreviewStats, updateCareHud, switchScene, stopCamTween,
    renderer, loopFrame, restartLoop, quality, glbLoaded }=d;
  const care=()=>runtime.care;
  const sleep=()=>sstep(0.55,0.9,dayNight.k)*(1-U.excite.value)*(1-input.fear);
  /** @type {any} */ (window).__aqDebug={
    renderer, loopFrame, restartLoop,
    glbLoaded:()=>glbLoaded?.() ?? [],
    quality:()=>({ level:quality.level, label:quality.label }),
    qualityForce:(/** @type {number} */ lv)=>quality.force(lv),
    time:()=>U.time.value,
    pelletCount:()=>feeder.items.filter((/** @type {any} */ it)=>it&&!(it.eaten>0)).length,
    excite:()=>U.excite.value,
    night:()=>dayNight.k,
    setNight:(/** @type {number} */ k)=>{ d.setCycle?.(false); dayNight.jump(k); },   // 固定昼夜（截图对比用，关自动循环、不落盘）
    modelStatus:()=>modelPreviewStats(),
    pickAt:(/** @type {number} */ x,/** @type {number} */ y)=>{ const h=fishCard.pick(x,y); return h?{ id:h.school.spec.id, n:h.fid, glb:h.school.glbMode }:null; },
    satiety:()=>+care().satiety.toFixed(3),
    setSatiety:(/** @type {number} */ v)=>{ care().satiety=v; updateCareHud(); },
    appetite:()=>+care().appetite().toFixed(3),
    fear:()=>input.fear,
    sleep:()=>+sleep().toFixed(3),
    tapGlass:(/** @type {number} */ x,/** @type {number} */ y)=>input.tapGlass(x,y),
    growthOf:(/** @type {number} */ si,/** @type {number} */ ii)=>({ target:+schools[si].growthTarget[ii].toFixed(3), now:+schools[si].growth[ii].toFixed(3) }),
    // —— 个体身份 / 亲密度 ——
    nameOf:(/** @type {number} */ si,/** @type {number} */ ii)=>schoolNames(store.activeId, schools[si].spec.id, schools[si].spec.count)[ii],
    personaOf:(/** @type {number} */ si,/** @type {number} */ ii)=>personaTags(schools[si].persona(ii), schools[si].personaAvg()),
    bond:()=>{ const c=care(); return { level:c.bondLevel, due:c.milestoneDue(),
      progress:+c.bondProgress().toFixed(3), gloss:+c.glossK().toFixed(3) }; },
    addFish:(/** @type {string} */ id)=>!!runtime.addFish(id),
    feed:()=>input.feedAt(d.randomFeedPoint()),
    tpFish:(/** @type {number} */ si,/** @type {number} */ ii,/** @type {number} */ x,/** @type {number} */ y,/** @type {number} */ z)=>{ const s=schools[si]; s.pos[ii].set(x,y,z); s.vel[ii].set(0.15,0,0);
      if(s.glbMode && s.fishes[ii]){ s.fishes[ii].position.copy(s.pos[ii]); } },
    posOf:(/** @type {number} */ si,/** @type {number} */ ii)=>schools[si].pos[ii].toArray(),
    restState:(/** @type {number} */ si,/** @type {number} */ ii)=>{ const r=schools[si].rest; return r?{on:r[ii].on,t:+r[ii].t.toFixed(1),dur:+r[ii].dur.toFixed(1)}:null; },
    velOf:(/** @type {number} */ si,/** @type {number} */ ii)=>schools[si].vel[ii].toArray().map((/** @type {any} */ v)=>+v.toFixed(3)),
    bloom:(/** @type {any} */ on)=>{ bloom.enabled=on; },
    scene:()=>scene,
    hide:(/** @type {string} */ what,/** @type {any} */ on)=>{ if(what==='light') hoodSpot.visible=!on; if(what==='water') waterMesh.visible=!on; if(what==='glass') glassHigh.visible=!on; },
    restP:(/** @type {number} */ si,/** @type {number} */ ii)=>schools[si].rest?schools[si].rest[ii].p.toArray().map((/** @type {any} */ v)=>+v.toFixed(2)):null,
    snapTo:(/** @type {number} */ si,/** @type {number} */ ii)=>{ const p=schools[si].pos[ii];
      camera.position.set(p.x+0.55, p.y+0.14, p.z+0.75);
      controls.target.copy(p); stopCamTween(); },
    projectFish:(/** @type {number} */ si,/** @type {number} */ ii)=>{ const p=schools[si].pos[ii].clone(); p.project(camera);
      return { x:Math.round((p.x+1)/2*innerWidth), y:Math.round((1-p.y)/2*innerHeight) }; },
    look:(/** @type {any} */ pos,/** @type {any} */ tgt)=>{ camera.position.set(...pos); controls.target.set(...tgt); stopCamTween(); },
    // —— 场景系统 ——
    schoolIds:()=>schools.map((/** @type {any} */ s)=>`${s.spec.id}:${s.spec.count}`),
    sceneId:()=>store.activeId,
    scenes:()=>store.list().map((/** @type {any} */ s)=>({ id:s.id, name:s.name, items:s.items.length })),
    switchScene:(/** @type {string} */ id)=>switchScene(id),
    itemCount:()=>runtime.itemsGroup.children.length,
    obstacleCount:()=>d.obstacles.length,
    air:()=>({ ...d.air }),
    editor:()=>editor,
    projectItem:(/** @type {string} */ id)=>{ const r=runtime.rootOf(id); if(!r) return null; const p=r.position.clone(); p.y+=0.05; p.project(camera);
      return { x:Math.round((p.x+1)/2*innerWidth), y:Math.round((1-p.y)/2*innerHeight) }; },
  };
}
