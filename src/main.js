// @ts-check
import * as THREE from 'three';
import { sstep } from './utils.js';
import { U } from './uniforms.js';
import { TANK, sandHeight, createTank } from './scene/tank.js';
import { createWorld } from './scene/setup.js';
import { createDayNight } from './scene/daynight.js';
import { setCausticsEnabled } from './scene/caustics.js';
import { createEffects } from './systems/effects.js';
import { Feeder } from './systems/feeder.js';
import { SoundEngine } from './systems/sound.js';
import { createQuality } from './systems/quality.js';
import { SPECIES } from './entities/fish/species.js';
import { loadSpeciesModels } from './entities/fish/species-models.js';
import { SPECIES_META } from './ui/encyclopedia.js';
import { MILESTONES } from './systems/care.js';
import { createFishGrid, rebuildFishGrid } from './entities/fish/steering.js';
import { fishRim } from './fish/glb-style.js';
import { createSceneStore } from './scenes/scene-store.js';
import { TANK_STYLES, NATURAL_CAMS, isNatural } from './scenes/tank-styles.js';
import { createSceneRuntime } from './scenes/scene-runtime.js';
import { createSceneEditor } from './editor/scene-editor.js';
import { renderEncyclopediaPreviews, modelPreviewStats } from './ui/encyclopedia.js';
import { createFishCard } from './ui/fish-card.js';
import { createSettingsPanel } from './ui/settings-panel.js';
import { installBackup } from './ui/backup.js';
import { createScenePicker } from './ui/scene-picker.js';
import { createTankInput, randomFeedPoint } from './ui/tank-input.js';
import { createPhotoMode } from './ui/photo-mode.js';
import { installDebug } from './debug.js';

/* ================================================================
 * 组合根：创建各模块、接线 DOM、驱动主循环
 * 场景（造景/鱼群/水色）由 scenes/ 下的文档驱动，见 scene-runtime.js
 * ================================================================ */
const VERSION='v2.1';
const $=(/** @type {string} */ id)=>{ const el=document.getElementById(id); if(!el) throw new Error(`missing #${id}`); return el; };

const world=createWorld();
const { renderer, scene, camera, controls, hemi, hoodSpot, fillLight, waterGlow, composer, bloom, rim }=world;
const tank=createTank(scene);
const { tankGroup, waterUniforms, glassHigh, glassLow, sandMat, waterMesh, floorGlowMat }=tank;

const air={ x:1.6, z:0.5, on:true };          // 气泡发射点：场景里第一个气石（scene-runtime 原地更新）
const { bubbles, rays, snow, ripples }=createEffects({ tankGroup, air, sandHeight, waterY:TANK.waterY });
const feeder=new Feeder({ tankGroup, sandHeight, waterY:TANK.waterY, ripples });

/* ---------- 场景基础：昼夜 / 存档 / 模型预加载 ---------- */
/** @type {any[]} */ const schools=[];         // 两个数组都由 runtime 原地维护
/** @type {any[]} */ const obstacles=[];
const dayNight=createDayNight({ scene, lights:{ hoodSpot, hemi, fillLight, waterGlow, rim },
  waterUniforms, sandMat, shell:tank.shell, floorGlowMat, rays, schools, fishRim });
const store=createSceneStore();

// 预加载骨骼动画模型（失败物种自动回退程序化鱼）。
// 渐进启动：只先等"当前场景用到的物种"，其余后台补载进同一个 map（后续建 School 自然用上）
const presentIds=Object.entries(store.active().fish).filter(([,n])=>n>0).map(([id])=>id);
const glbMap=await loadSpeciesModels(SPECIES, { only:presentIds });
console.info('[fish] GLB loaded:', presentIds.filter(id=>/** @type {any} */ (glbMap)[id]).join(', ')||'none (procedural fallback)');
loadSpeciesModels(SPECIES, { skip:presentIds }).then(rest=>{
  Object.assign(glbMap, rest);
  console.info('[fish] 其余物种 GLB 已后台就绪:', Object.keys(rest).filter(k=>/** @type {any} */ (rest)[k]).join(', ')||'none');
});

/* ---------- 设置（localStorage：音效 / 自动昼夜 / 昼晚状态 / 特效开关） ---------- */
/** @type {Record<string, any>} */ const settings={ sound:true, cycle:false, night:0, rays:true, bubbles:true, snow:true, caustics:true };
try{ Object.assign(settings, JSON.parse(localStorage.getItem('aquarium.settings')||'{}')); }catch(err){ console.warn('[settings] 读取设置失败，使用默认值', err); }
const saveSettings=()=>{ try{ localStorage.setItem('aquarium.settings', JSON.stringify(settings)); }catch(err){ console.warn('[settings] 保存设置失败', err); } };
const sound=new SoundEngine(); sound.setEnabled(settings.sound);
rays.group.visible=settings.rays; snow.pts.visible=settings.snow; setCausticsEnabled(settings.caustics);

/* ---------- 场景：存档 → 运行时（造景 / 鱼群 / 主题） ---------- */
const runtime=createSceneRuntime({ tankGroup, tank, glbMap, schools, obstacles, air,
  onTheme:(/** @type {any} */ t)=>dayNight.setTheme(t), onTank:(/** @type {any} */ t)=>{ dayNight.setTank(t); setHint(t.kind==='natural'); }, onSchools:()=>dayNight.refresh() });
runtime.apply(store.active(), { fresh:true });
dayNight.jump(settings.night||0);              // 启动即应用已保存的昼晚状态

/* ---------- 轻提示 ---------- */
const toastEl=$('toast');
/** @type {number|undefined} */ let toastTimer;
function toast(/** @type {string} */ msg){
  toastEl.textContent=msg; toastEl.classList.add('on');
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>toastEl.classList.remove('on'), msg.length>20?4200:2200);
}
if(store.readOnly) toast('存档来自更新的版本：本次的修改不会被保存');
else if(store.recovered) toast('水景存档无法读取，已备份并恢复为默认水景');

/* ---------- 交互：喂食 / 识鱼 / 敲玻璃 ---------- */
const fishCard=createFishCard({ camera, schools, getCare:()=>runtime.care, getSceneId:()=>runtime.doc.id });
/** @type {any} */ let editor=null;
const input=createTankInput({ camera, canvas:renderer.domElement, schools, fishCard, feeder, sound,
  isBlocked:()=>editor?.active });
$('bFeed').addEventListener('click',()=>input.feedAt(randomFeedPoint()));

/* ---------- 相机预设 ---------- */
const CAM_PRESETS=[
  { pos:[0,1.55,6.1],  tgt:[0,1.05,0]  },
  { pos:[5.6,1.4,2.1], tgt:[0,1.0,0]   },
  { pos:[0.0,4.7,3.2], tgt:[0,0.8,0]   },
  { pos:[1.3,1.0,3.0], tgt:[0.3,0.95,0] },
];
/** @type {any} */ let camTween=null; let camIdx=0;
function tweenCam(/** @type {any} */ preset, /** @type {number} */ dur=1.4){
  camTween={ from:camera.position.clone(), fromT:controls.target.clone(),
    to:new THREE.Vector3(...preset.pos), toT:new THREE.Vector3(...preset.tgt), t:0, dur };
}
controls.addEventListener('start',()=>{ camTween=null; });
// 自然水域没有前玻璃，机位改为俯视水面
const camPresets=()=>isNatural(runtime.doc.tank) ? NATURAL_CAMS : CAM_PRESETS;
$('bCam').addEventListener('click',()=>{ const cams=camPresets(); camIdx=(camIdx+1)%cams.length; tweenCam(cams[camIdx]); });
tweenCam(camPresets()[0], 2.6);   // 开场运镜

/* ---------- 昼夜按钮 ---------- */
const bLight=/** @type {HTMLButtonElement} */ ($('bLight'));
function syncLightButton(){              // 按钮显示"点击后会切到"的状态
  const night=dayNight.target>0.5;
  bLight.classList.toggle('is-night',night);
  /** @type {HTMLElement} */ (bLight.querySelector('span')).textContent=night?'日间':'夜间';
  bLight.title=night?'切换到日光':'切换到月光';
}
syncLightButton();
bLight.addEventListener('click',()=>{
  settings.cycle=false; settingsPanel.set('cycle',false);   // 手动切换视为关闭自动循环
  dayNight.target=dayNight.target>0.5?0:1;
  settings.night=dayNight.target; saveSettings();
  syncLightButton();
});

/* ---------- 底部操作提示：自然水域没有玻璃，双击改叫"拍水面" ---------- */
function setHint(/** @type {boolean} */ natural){
  const el=document.getElementById('hint');
  if(el) el.textContent=`拖拽旋转 · 滚轮缩放 · 点水喂食 · 点鱼识鱼 · 双击${natural ? '拍水面' : '敲玻璃'}`;
}

/* ---------- 缩略图：固定正面机位渲染一帧，裁成 16:9 小图（与玩家当前视角无关） ---------- */
function captureThumb(){
  const keepP=camera.position.clone(), keepQ=camera.quaternion.clone();
  const halfTan=Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*Math.min(camera.aspect, 16/9);
  if(isNatural(runtime.doc.tank)){ camera.position.set(0, 3.4, 4.4); camera.lookAt(0, 1.3, 0); }   // 自然水域：俯拍水面
  else { camera.position.set(0, 1.2, 2.45/halfTan); camera.lookAt(0, 0.98, 0); }           // 缸：缸宽刚好填满裁切框
  composer.render();
  camera.position.copy(keepP); camera.quaternion.copy(keepQ);
  const src=renderer.domElement, w=320, h=180, c=document.createElement('canvas');
  if(!src.width || !src.height) return null;   // 画布尺寸为 0（窗口被最小化/隐藏）时不拍
  c.width=w; c.height=h;
  let sw=src.width, sh=src.height, sx=0, sy=0;
  if(sw/sh>w/h){ sw=sh*w/h; sx=(src.width-sw)/2; } else { sh=sw*h/w; sy=(src.height-sh)/2; }
  /** @type {CanvasRenderingContext2D} */ (c.getContext('2d')).drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
  return c.toDataURL('image/jpeg', 0.8);
}
/** @type {number|undefined} */ let thumbTimer;
function scheduleThumb(){                  // 没有缩略图的场景：开场运镜结束后自动补拍一张
  clearTimeout(thumbTimer);
  const id=store.activeId;
  if(store.thumb(id)) return;
  thumbTimer=setTimeout(()=>{
    if(store.activeId!==id || store.thumb(id)) return;
    // 页面不可见时主循环不跑，粒子等实例矩阵还没初始化，晚点再拍
    if(!(/** @type {any} */ (window)).__aqReady || document.hidden || editor.active || photo.on){ scheduleThumb(); return; }
    const shot=captureThumb();
    if(shot) store.setThumb(id, shot); else scheduleThumb();
  }, 3200);
}

/* ---------- 场景切换（淡出 → 重建 → 淡入） ---------- */
const hudScene=$('hudScene'), fadeEl=$('sceneFade');
const syncHud=()=>{ hudScene.textContent=`「${runtime.doc.name}」`; };
/** @type {boolean} */ let switching=false;
function switchScene(/** @type {string} */ id, /** @type {{ force?:boolean, then?:(()=>void)|null }} */ { force=false, then=null }={}){
  if(switching || !store.get(id)) return;
  if(id===store.activeId && !force){ then?.(); return; }
  switching=true;
  fadeEl.classList.add('on');
  setTimeout(()=>{
    store.activate(id);
    feeder.clear(); bubbles.reset(); fishCard.hide();
    runtime.apply(store.active(), { fresh:true });
    syncHud(); updateCareHud();
    camIdx=0; tweenCam(camPresets()[0], 1.8);
    fadeEl.classList.remove('on');
    switching=false;
    if(then) then(); else { toast(`欢迎来到「${runtime.doc.name}」`); scheduleThumb(); }
  }, 420);
}

/* ---------- 造景编辑器 / 水景选择 ---------- */
editor=createSceneEditor({ canvas:renderer.domElement, camera, controls, runtime, store, tweenCam, toast, captureThumb,
  onEnter:()=>{ fishCard.hide(); settingsPanel.close(); feeder.clear(); waterMesh.visible=false; },   // 俯视时水面会挡住造景
  onExit:()=>{ waterMesh.visible=true; syncHud(); } });
const picker=createScenePicker({ store, toast,
  onSwitch:(/** @type {string} */ id, /** @type {any} */ opts)=>switchScene(id, opts),
  onEdit:(/** @type {string} */ id)=>switchScene(id, { then:()=>editor.enter() }) });
picker.onRenamed=(/** @type {string} */ id)=>{ if(id===store.activeId){ runtime.doc.name=(store.get(id) ?? { name:'' }).name; syncHud(); } };
$('bScenes').addEventListener('click',()=>{ settingsPanel.close(); fishCard.hide(); picker.open(); });
$('bEdit').addEventListener('click',()=>editor.enter());

/* ---------- 帮助 / 图鉴 ---------- */
const helpEl=$('help');
$('bHelp').addEventListener('click',()=>{ helpEl.hidden=false; });
$('helpClose').addEventListener('click',()=>{ helpEl.hidden=true; });
helpEl.addEventListener('click',e=>{ if(e.target===helpEl) helpEl.hidden=true; });
const guideEl=$('encyclopedia');
const syncBondHud=()=>{                       // 图鉴页脚的亲密度进度
  const c=runtime.care, lv=c.bondLevel;
  $('bondText').textContent = lv>=MILESTONES.length
    ? `亲密度 Lv.${lv} · ${c.bondProgress()>=1 ? '鱼儿们容光焕发' : '鱼群渐渐泛起光泽'}`
    : `亲密度 Lv.${lv} · 距离下一位新朋友 ${Math.round(c.bondProgress()*100)}%`;
};
const openGuide=()=>{ guideEl.hidden=false; guideEl.setAttribute('aria-hidden','false'); syncBondHud(); requestAnimationFrame(renderEncyclopediaPreviews); };
const closeGuide=()=>{ guideEl.hidden=true; guideEl.setAttribute('aria-hidden','true'); };
$('bGuide').addEventListener('click',openGuide);
$('guideClose').addEventListener('click',closeGuide);
guideEl.addEventListener('click',e=>{ if(e.target===guideEl) closeGuide(); });

/* ---------- 设置弹层 ---------- */
const settingsPanel=createSettingsPanel({ settings, onChange:(/** @type {string} */ key,/** @type {boolean} */ on)=>{
  settings[key]=on;
  if(key==='sound'){ sound.setEnabled(on); if(on){ sound.ensure(); sound.blip(); } }
  if(key==='rays') rays.group.visible=on;
  if(key==='snow') snow.pts.visible=on;
  if(key==='caustics') setCausticsEnabled(on);
  saveSettings();
}});
addEventListener('pointerdown',()=>sound.ensure(),{ once:true });
installBackup({ toast });                         // 设置弹层里的存档导出/导入

/* ---------- PWA：生产构建注册 Service Worker（离线可玩），dev 不介入 ---------- */
if(import.meta.env.PROD && 'serviceWorker' in navigator){
  navigator.serviceWorker.register('./sw.js').catch(err=>console.warn('[pwa] 注册失败', err));
}

/* ---------- 拍照模式 / 全局按键 ---------- */
const photo=createPhotoMode({ renderer, composer, hideTargets:['hud','dock','care','stats','hint'],
  onEnter:()=>{ fishCard.hide(); settingsPanel.close(); },
  onShot:ok=>toast(ok?'照片已保存':'拍摄失败，请稍后再试') });
addEventListener('keydown',e=>{
  if(editor.active) return;                    // 编辑器有自己的快捷键
  if(e.key==='Escape'){
    if(!guideEl.hidden) closeGuide();
    helpEl.hidden=true;
    if(picker.isOpen) picker.close();
    fishCard.hide(); settingsPanel.close();
    if(photo.on) photo.set(false);
  }
  if((e.key==='h'||e.key==='H') && !e.repeat && !(e.target instanceof HTMLInputElement)) photo.press();
});

/* ================================================================
 * 主循环
 * ================================================================ */
const clock=new THREE.Clock();
const statsEl=$('stats'), careFill=$('careFill'), careText=$('careText');
let fpsFrames=0, fpsTime=0, realT=0;
const fishGrid=createFishGrid();                  // 全体鱼共享的邻域查询网格（每帧重建）

/* ---------- 自动画质：阶梯降级（1.5 → 1.25 → 1 + 低配玻璃 → 关泛光），帧率回升逐级恢复 ---------- */
const coarsePointer=matchMedia?.('(pointer:coarse)').matches ?? false;   // 触屏上限 1.5（与 setup.js 一致）
const quality=createQuality({
  baseRatio:Math.min(devicePixelRatio, coarsePointer?1.5:2),
  onLevel(q){
    renderer.setPixelRatio(q.ratio);
    composer.setPixelRatio(q.ratio);
    composer.setSize(innerWidth,innerHeight);
    for(const g of /** @type {any[]} */ (tankGroup.children)){
      const gm=/** @type {any} */ (g);
      if(gm.material===glassHigh || gm.material===glassLow) gm.material=q.glass==='low'?glassLow:glassHigh;
    }
    bloom.enabled=q.bloom;
  },
});

const onEat=(/** @type {any} */ school, /** @type {number} */ i)=>{ school.setGrowth(i, runtime.care.eat(school.spec.id,i)); sound.crunch(); };
function updateCareHud(){                // 圆环 pathLength=100：dashoffset = 100 - 百分比
  careFill.style.strokeDashoffset=`${100-Math.round(runtime.care.satiety*100)}`;
  careText.textContent=runtime.care.status();
}
/* ---------- 亲密度里程碑：攒够就发一条新鱼入缸（原地加，不重建鱼群） ---------- */
function grantArrival(){
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
    updateCareHud();
    return;
  }
  care.takeMilestone();                       // 缸满了：里程碑转为光泽度
}
syncHud();
scheduleThumb();

function frame(){
  const rawDt=clock.getDelta();
  const dt=Math.min(rawDt,0.05);
  U.time.value+=dt;
  const t=U.time.value;

  dayNight.update(dt, t, settings.cycle);

  if(camTween){                                 // 相机运镜
    camTween.t+=dt;
    const k=Math.min(1,camTween.t/camTween.dur), e=1-Math.pow(1-k,3);
    camera.position.lerpVectors(camTween.from,camTween.to,e);
    controls.target.lerpVectors(camTween.fromT,camTween.toT,e);
    if(k>=1) camTween=null;
  }
  controls.update();

  // 兴奋度：有饲料 → 升到食欲上限（饿 → 疯抢，饱 → 懒散）
  const care=runtime.care;
  care.update(dt);
  if(care.milestoneDue() && !editor.active && !switching) grantArrival();
  runtime.setGloss(care.glossK());            // 里程碑领完后的余量换光泽（同值不重设）
  const appetite=care.appetite();
  const active=feeder.pellets;
  U.excite.value+=((active.length?appetite:0)-U.excite.value)*Math.min(1,dt*1.4);
  const shake=input.update(dt, t);
  // 夜间睡眠：喂食与惊吓都会把鱼叫醒
  const sleep=sstep(0.55,0.9,dayNight.k)*(1-U.excite.value)*(1-input.fear);

  const flow=/** @type {any} */ (TANK_STYLES[runtime.doc.tank])?.env?.current ?? 0;   // 溪流/小河的水流
  feeder.flow=flow; snow.flow=flow; waterUniforms.uFlow.value=flow;
  const ctx={ obstacles, pellets:active, feeder, excite:U.excite.value, time:t, schools, current:flow,
    appetite, fear:input.fear, sleep, onEat, grid:fishGrid };
  rebuildFishGrid(fishGrid, schools);             // 共享统一网格：同种/异种 pair 查询走邻域
  for(const s of schools) s.update(dt,ctx);

  feeder.update(dt,t);
  bubbles.mesh.visible=settings.bubbles && air.on;
  bubbles.update(dt,t);
  sound.update(dt, settings.bubbles && air.on);
  snow.update(dt,t);
  ripples.update(dt);
  editor.update(t);

  if(shake){                                    // 敲玻璃：镜头轻震（只影响本帧渲染）
    camera.position.x+=shake.x; camera.position.y+=shake.y;
    composer.render();
    camera.position.x-=shake.x; camera.position.y-=shake.y;
  } else composer.render();

  const w=(/** @type {any} */ (window));
  if(!w.__aqReady){                              // 首帧：隐藏加载层
    w.__aqReady=true;
    const l=$('loading');
    l.classList.add('done');
    setTimeout(()=>l.remove(),900);
  }

  // FPS / 自动画质：按真实帧间隔统计（页面隐藏回来的大间隔重置窗口，不计入）
  realT+=rawDt;
  fpsFrames++;
  if(rawDt<=0.5) fpsTime+=rawDt; else fpsFrames=0;
  if(fpsTime>=0.5){
    const fps=Math.round(fpsFrames/fpsTime);
    statsEl.textContent=`${fps} FPS · ${runtime.fishTotal()} 条鱼 · ${quality.label}模式 · ${VERSION}`;
    fpsFrames=0; fpsTime=0;
    updateCareHud();
    quality.sample(fps, realT);   // 门槛/迟滞按真实秒计：低帧率下模拟时间会被 clamp 拖慢
  }
}
renderer.setAnimationLoop(frame);

addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
  composer.setSize(innerWidth,innerHeight);
});

installDebug({ schools, obstacles, air, feeder, dayNight, input, fishCard, runtime, store, editor, camera, controls,
  bloom, scene, hoodSpot, waterMesh, glassHigh, modelPreviewStats, updateCareHud, switchScene, randomFeedPoint,
  stopCamTween:()=>{ camTween=null; }, renderer, loopFrame:frame, quality,
  glbLoaded:()=>Object.keys(glbMap).filter(k=>/** @type {any} */ (glbMap)[k]),
  // 隐藏页面里 rAF 停摆（three 的动画循环已被启动占位）时重启主循环；
  // 配合先把 window.requestAnimationFrame 换成 setTimeout 垫片使用
  restartLoop(){ renderer.setAnimationLoop(null); renderer.setAnimationLoop(frame); } });
