// @ts-check
import { U } from './uniforms.js';
import { sstep } from './utils.js';
import { schoolNames, personaTags } from './entities/fish/identity.js';
import { mixNoteFor } from './ui/encyclopedia.js';

/* ================================================================
 * window.__aqDebug：自动化验证用的调试钩子
 * 鱼的索引是 (schoolIndex, fishIndex)，schoolIndex 指当前场景里实际存在的鱼群（按 SPECIES 顺序，数量为 0 的物种不占位）
 * ================================================================ */

export function installDebug(/** @type {any} */  d){
  const { schools, feeder, dayNight, input, fishCard, runtime, store, editor, camera, controls, bloom, lens, scene,
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
    pellets:()=>feeder.pellets.map((/** @type {any} */ it)=>it.p.toArray().map((/** @type {number} */ v)=>+v.toFixed(2))),
    pelletCount:()=>feeder.items.filter((/** @type {any} */ it)=>it&&!(it.eaten>0)).length,
    excite:()=>U.excite.value,
    night:()=>dayNight.k,
    setNight:(/** @type {number} */ k)=>{ d.setCycle?.(false); dayNight.jump(k); },   // 固定昼夜（截图对比用，关自动循环、不落盘）
    setWeather:(/** @type {string} */ mode, /** @type {number} */ intensity)=>d.setWeather?.(mode, intensity) ?? null,   // 本次运行的天气，不落盘
    sky:(/** @type {boolean|null} */ on)=>d.sky?.setForce(on),
    reflect:(/** @type {boolean|null} */ on)=>d.reflect?.setForce(on),
    shore:(/** @type {boolean} */ on)=>runtime.setShoreVisible(on),
    reflectOn:()=>d.reflect?.on ?? 0,
    skyOn:()=>!!d.sky?.dome?.visible,
    weather:()=>d.weather?.() ?? null,
    modelStatus:()=>modelPreviewStats(),
    pickAt:(/** @type {number} */ x,/** @type {number} */ y)=>{ const h=fishCard.pick(x,y); return h?{ id:h.school.spec.id, n:h.fid, glb:h.school.glbMode }:null; },
    satiety:()=>+care().satiety.toFixed(3),
    setSatiety:(/** @type {number} */ v)=>{ care().satiety=v; updateCareHud(); },
    appetite:()=>+care().appetite().toFixed(3),
    fear:()=>input.fear,
    // —— 逗鱼光点：play(on) 开关；playAt(x,y,z) 直接摆放；nibbles() 鱼咬光点计数（传 0 归零）——
    play:(/** @type {boolean} */ on)=>{ d.lure.set(on); return d.lure.on; },
    playState:()=>{ const L=/** @type {any} */ (d.lure); return { on:L.on, k:+L.k.toFixed(3), p:L.p.toArray().map((/** @type {any} */ v)=>+v.toFixed(3)) }; },
    playAt:(/** @type {number} */ x,/** @type {number} */ y,/** @type {number} */ z)=>{ d.lure.set(true); d.lure.place(x,y,z); return d.lure.p.toArray(); },
    nibbles:(/** @type {number} */ reset)=>d.lure.nibbleCount(reset),
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
    haze:(/** @type {boolean} */ on, /** @type {number} */ k, /** @type {number} */ max)=>{ lens.setHaze(on); if(k!==undefined) lens.uniforms.uDensity.value=k; if(max!==undefined) lens.uniforms.uMaxMix.value=max; },   // 水体纵深（k = 每单位雾化系数）
    dof:(/** @type {boolean} */ on, /** @type {number} */ k)=>{ lens.setDof(on); if(k!==undefined) lens.uniforms.uK.value=k; },   // 景深（k = 弥散圆强度）
    scene:()=>scene,
    hide:(/** @type {string} */ what,/** @type {any} */ on)=>{ if(what==='light') hoodSpot.visible=!on; if(what==='water') waterMesh.visible=!on; if(what==='glass') glassHigh.visible=!on; },
    restP:(/** @type {number} */ si,/** @type {number} */ ii)=>schools[si].rest?schools[si].rest[ii].p.toArray().map((/** @type {any} */ v)=>+v.toFixed(2)):null,
    snapTo:(/** @type {number} */ si,/** @type {number} */ ii)=>{ const p=schools[si].pos[ii];
      camera.position.set(p.x+0.55, p.y+0.14, p.z+0.75);
      controls.target.copy(p); stopCamTween(); },
    projectFish:(/** @type {number} */ si,/** @type {number} */ ii)=>{ const p=schools[si].pos[ii].clone(); p.project(camera);
      return { x:Math.round((p.x+1)/2*innerWidth), y:Math.round((1-p.y)/2*innerHeight) }; },
    look:(/** @type {any} */ pos,/** @type {any} */ tgt)=>{ camera.position.set(...pos); controls.target.set(...tgt); stopCamTween(); },
    // —— 常识与时间：灯光定时器 / 开缸浊度 / 混养提示 / 在缸时长 ——
    // clockAt('21:50')：本次运行打开"跟随本地时间"并把"现在"钉在该时刻（不落盘）；clockAt(null) 恢复真实时间并关掉
    clockAt:(/** @type {string|null} */ hhmm)=>{
      const m=hhmm ? /^(\d{1,2}):(\d{2})$/.exec(hhmm) : null;
      if(m){ const dt=new Date(); dt.setHours(+m[1], +m[2], 0, 0); d.settings.clock=true; d.settings.cycle=false; d.ambience.setClock(dt); }
      else { d.settings.clock=false; d.ambience.setClock(null); }
      return { clock:d.settings.clock, target:+dayNight.target.toFixed(3) };
    },
    turbidity:()=>+d.ambience.turbidity.toFixed(3),
    kickTurbid:(/** @type {number} */ s=1)=>d.ambience.kick(s),
    mixNote:()=>mixNoteFor(runtime.doc.fish),
    daysOf:(/** @type {number} */ si,/** @type {number} */ ii)=>care().daysOf(schools[si].spec.id, ii),
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
    // —— 性能与批处理（优化验证用） ——
    // perf() 取上一完整帧的整帧统计（主场景+阴影+后期；main 每帧手动 reset renderer.info）
    perf:()=>{ const i=renderer.info; return { calls:i.render.calls, triangles:i.render.triangles,
      points:i.render.points, lines:i.render.lines, geometries:i.memory.geometries, textures:i.memory.textures,
      programs:i.programs?.length ?? null, pixelRatio:renderer.getPixelRatio(),
      drawSize:[renderer.domElement.width, renderer.domElement.height] }; },
    // 物件绘制批：每桶一次多绘制；sources = 桶内合批的原网格数（对比 setBatching(false) 前后 perf().calls 可量化收益）
    itemBatches:()=>runtime.batchStats(),
    setBatching:(/** @type {boolean} */ on)=>runtime.setBatching(on),
    // —— 水体合成（water-pass.js）：water(false) 回退网格水面做 A/B；absorb(k) 吸收强度；shafts(k) 光柱 ——
    water:(/** @type {boolean} */ on=true)=>{ d.setWaterOn?.(on); return { composite:on }; },
    absorb:(/** @type {number} */ k=0.4)=>{ d.waterPass.uniforms.uSigmaK.value=k; return k; },
    shafts:(/** @type {number} */ k=0.1)=>{ d.waterPass.setShafts(k); return k; },
    // —— 灯光：lamp(k) 临时调缸灯亮度（0~1.5，1=默认；不落盘，截图对比用） ——
    lamp:(/** @type {number} */ k=1)=>{ dayNight.setLamp(k); return k; },
  };
}
