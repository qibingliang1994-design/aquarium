// @ts-check
import * as THREE from 'three';
import { sstep } from './utils.js';
import { U } from './uniforms.js';
import { TANK, createTank } from './scene/tank.js';
import { groundY } from './scene/ground.js';
import { createWorld } from './scene/setup.js';
import { createDayNight } from './scene/daynight.js';
import { setCausticsEnabled, causticsOn } from './scene/caustics.js';
import { updateCaustics, setCausticsWaterY } from './scene/caustics-gen.js';
import { createEffects } from './systems/effects.js';
import { Feeder } from './systems/feeder.js';
import { createLure } from './systems/lure.js';
import { SoundEngine } from './systems/sound.js';
import { createQuality } from './systems/quality.js';
import { createQualityEffects } from './systems/quality-effects.js';
import { createAmbience } from './systems/ambience.js';
import { createWeather, pondTint } from './systems/weather.js';
import { createSettingsStore } from './settings-store.js';
import { reflectDim } from './systems/reflect.js';
import { createSky } from './scene/sky-dome.js';
import { createWaterReflect } from './scene/water-reflect.js';
import { SPECIES } from './entities/fish/species.js';
import { loadSpeciesModels } from './entities/fish/species-models.js';
import { SPECIES_META } from './ui/encyclopedia.js';
import { MILESTONES } from './systems/care.js';
import { createArrival } from './systems/arrival.js';
import { createFishGrid, rebuildFishGrid } from './entities/fish/steering.js';
import { fishRim } from './fish/glb-style.js';
import { createSceneStore } from './scenes/scene-store.js';
import { acquireWriter } from './systems/write-lock.js';
import { TANK_STYLES, NATURAL_CAMS, isNatural } from './scenes/tank-styles.js';
import { boundsFor } from './scenes/tank-bounds.js';
import { createSceneRuntime } from './scenes/scene-runtime.js';
import { createSceneEditor } from './editor/scene-editor.js';
import { renderEncyclopediaPreviews, modelPreviewStats, syncEncyclopediaCounts } from './ui/encyclopedia.js';
import { createFishCard } from './ui/fish-card.js';
import { createSettingsPanel } from './ui/settings-panel.js';
import { installBackup } from './ui/backup.js';
import { createScenePicker } from './ui/scene-picker.js';
import { createTankInput, randomFeedPoint } from './ui/tank-input.js';
import { createPhotoMode } from './ui/photo-mode.js';
import { createThumbnails } from './ui/thumbnails.js';
import { createWaterPass } from './scene/water-pass.js';
import { createScaledRenderPass } from './scene/render-scale.js';
import { installDebug } from './debug.js';
import { createPromo } from './promo/promo.js';
import { holdDialog, releaseDialog } from './ui/dialog.js';

/* ================================================================
 * 组合根：创建各模块、接线 DOM、驱动主循环
 * 场景（造景/鱼群/水色）由 scenes/ 下的文档驱动，见 scene-runtime.js
 * ================================================================ */
const VERSION='v2.3.0';
const $=(/** @type {string} */ id)=>{ const el=document.getElementById(id); if(!el) throw new Error(`missing #${id}`); return el; };

const world=createWorld();
const { renderer, scene, camera, controls, hemi, hoodSpot, fillLight, waterGlow, composer, bloom, rim, grade }=world;
const tank=createTank(scene);
const { tankGroup, waterUniforms, glassHigh, glassLow, sandMat, waterMesh, floorGlowMat }=tank;
// 渲染尺度分离：场景渲进自己的降尺度 RT（画质档 0.6~0.9），后期链仍全画布分辨率——
// 场景是每像素成本大头，几何边缘在折射/景深/颗粒下本就不锐；水面/光柱/散景保持全分辨率
const renderPass=createScaledRenderPass({ scene, camera });
composer.insertPass(renderPass, 0);
// 水体合成 + 镜头 pass（学自 aquarium-editor，v2.2.4 与 lens 合并为单 pass）：折射/全内反射/
// 掠射镜面/阴影光柱/吸收 + 景深（半分辨率螺旋）一体化，玻璃缸专用。
// 读 composer A 的颜色+深度 + 自己的半分辨率副本、写 writeBuffer——任何被采样的目标都
// 不在当前绘制目标上，不踩深度反馈环；也省掉一次全分辨率中间 RT 的写+读
const waterPass=createWaterPass({ camera, scene, light:hoodSpot, waterY:TANK.waterY,
  box:{ min:new THREE.Vector3(-TANK.W/2+TANK.glass, 0.02, -TANK.D/2+TANK.glass),
        max:new THREE.Vector3(TANK.W/2-TANK.glass, TANK.waterY, TANK.D/2+TANK.glass) },
  waterUniforms, sourceRT:renderPass.source });
const lens=waterPass;               // 镜头（景深/雾化）API 已并入水体 pass；保留别名，调用点不变
composer.insertPass(waterPass, 1);
const focusPt=new THREE.Vector3();
setCausticsWaterY(TANK.waterY);

const air={ x:1.6, z:0.5, on:true };          // 气泡发射点：场景里第一个气石（scene-runtime 原地更新）
const { bubbles, snow, ripples, precip }=createEffects({ tankGroup, air, sandHeight:groundY, waterY:TANK.waterY, scene });
const feeder=new Feeder({ tankGroup, sandHeight:groundY, waterY:TANK.waterY, ripples });
const lure=createLure({ tankGroup, camera, canvas:renderer.domElement });   // 逗鱼光点（按钮 / P 开关）

/* ---------- 场景基础：昼夜 / 存档 / 模型预加载 ---------- */
/** @type {any[]} */ const schools=[];         // 两个数组都由 runtime 原地维护
/** @type {any[]} */ const obstacles=[];
/** @type {ReturnType<typeof createFishGrid>} */ let fishGrid=createFishGrid();
const dayNight=createDayNight({ scene, lights:{ hoodSpot, hemi, fillLight, waterGlow, rim },
  waterUniforms, sandMat, shell:tank.shell, floorGlowMat, schools, fishRim });
// 多窗口单写者：必须在第一次写存档（createSceneStore 启动时会回写）之前拿锁
const isWriter=await acquireWriter();
const store=createSceneStore();

// 预加载骨骼动画模型（失败物种自动回退程序化鱼）。
// 渐进启动：只先等"当前场景用到的物种"，其余后台补载进同一个 map（后续建 School 自然用上）
const presentIds=Object.entries(store.active().fish).filter(([,n])=>n>0).map(([id])=>id);
// 锦鲤单文件 2.5MB，不挡首帧：先用程序化身体，模型到了再原位换上
const DEFER_GLB=new Set(['koi']);
const blocking=presentIds.filter(id=>!DEFER_GLB.has(id));
const glbMap=await loadSpeciesModels(SPECIES, { only:blocking });
console.info('[fish] GLB loaded:', blocking.filter(id=>/** @type {any} */ (glbMap)[id]).join(', ')||'none (procedural fallback)');
const restModels=loadSpeciesModels(SPECIES, { skip:blocking });

/* ---------- 设置（localStorage aquarium.settings：默认值 / 读取 / 迁移见 settings-store.js） ---------- */
const { settings, save: saveSettings }=createSettingsStore();
const weather=createWeather(settings);
const sound=new SoundEngine(); sound.setEnabled(settings.sound);
snow.pts.visible=settings.snow; setCausticsEnabled(settings.caustics);
/** @type {number|null} */ let docAbsorb=null;                                // 当前水景自带的水色浓淡（scene-doc.absorb，ADA 致敬景默认 1）
const applyAbsorb=()=>{ waterPass.uniforms.uSigmaK.value=settings.haze===false?0:(docAbsorb ?? settings.absorb); };   // 水体雾化总开关（关=吸收清零，更通透）× 水色浓淡（景内覆盖 > 全局滑杆）
applyAbsorb();
waterPass.setShafts(settings.shafts);                          // 光柱强度（画质最低档时由 onLevel 归零）
lens.setDof(settings.dof!==false);                             // 景深（画质最低档时由 onLevel 连带关闭）

/* ---------- 场景：存档 → 运行时（造景 / 鱼群 / 主题） ---------- */
let waterOn=true;                                // 水体合成总开关（__aqDebug.water(false) 回退网格水面）
/** @type {any} */ let editor=null;               // 提前声明：applyWaterMode 在 runtime.apply（编辑器创建前）就会被 onTank 调到
function applyWaterMode(){
  const nat=isNatural(runtime.doc.tank);
  const on=waterOn && !nat && !editor?.active;   // 玻璃缸且非编辑态才走合成水面
  waterPass.setWaterOn(on);                      // 合并后的单 pass 恒启用：关 = 退化为纯镜头（DOF/雾化照常）
  waterMesh.visible=!editor?.active && (nat || !on);   // 缸走合成时藏网格；自然水域与回退态用网格
}
/** 换缸：饲料边界、点击范围、邻域网格、相机远近一起跟当前缸型走。input 还没建好时先跳过
 * @param {string} id */
function applyTankChrome(id){
  const b=boundsFor(id), style=TANK_STYLES[id] ?? TANK_STYLES.classic, rig=style.rig;
  const docA=store.active().absorb;                  // 景内默认水色浓淡（ADA 岩组/悠然/灰色山脉 = 1）
  docAbsorb=(typeof docA==='number') ? docA : (style.absorb ?? null);
  fishGrid=createFishGrid(0.7, b.grid);
  feeder.setHalf(b.feed.x, b.feed.z);
  snow.setArea(b.swim.x, b.swim.z);
  lure.setBounds(b);
  input?.setBounds(b);
  waterPass.setDofScale(style.dof ?? 1);
  grade.uniforms.uSat.value=style.grade?.[0] ?? 1.08;          // 调色随缸型：ADA 作品照更艳、反差更大
  grade.uniforms.uContrast.value=style.grade?.[1] ?? 1.06;
  if(rig){ controls.minDistance=rig.min; controls.maxDistance=rig.max; camera.near=rig.near; camera.far=rig.far; }
  else { controls.minDistance=1; controls.maxDistance=11; camera.near=0.05; camera.far=60; }
  camera.updateProjectionMatrix();
  applyAbsorb();                                    // 水色浓淡跟着景走（切景即生效）
  camLow=style.kind!=='natural';
}
// 往下转的极限：玻璃缸可以压低到沙线附近往上仰视（像蹲在缸前看），相机高度不低于地板线——
// 缸外是柜面之上 CAM_FLOOR，缸内是沙面之上 CAM_SAND；按当前距离反推最大俯仰角，拉远时自动收窄。
// 自然水域低于地形会穿帮，仍以水平为限
const CAM_FLOOR=0.14, CAM_SAND=0.12, CAM_LOW_MAX=Math.PI*0.62, CAM_FLAT=Math.PI*0.49;
let camLow=true;
function limitPolar(){
  if(!camLow){ controls.maxPolarAngle=CAM_FLAT; return; }
  const p=camera.position, g=boundsFor(runtime.doc.tank).glassInner;
  const inside=Math.abs(p.x)<g.x+0.05 && Math.abs(p.z)<g.z+0.05;
  const floor=inside ? groundY(p.x, p.z)+CAM_SAND : CAM_FLOOR;
  const d=Math.max(0.5, p.distanceTo(controls.target));
  const k=Math.max(-1, Math.min(1, (controls.target.y-floor)/d));
  controls.maxPolarAngle=Math.max(CAM_FLAT, Math.min(CAM_LOW_MAX, Math.PI/2+Math.asin(k)));
}
/** @type {ReturnType<typeof createTankInput>|null} */ let input=null;
const runtime=createSceneRuntime({ tankGroup, tank, glbMap, schools, obstacles, air, renderer,
  onTheme:(/** @type {any} */ t)=>dayNight.setTheme(t),
  onTank:(/** @type {any} */ t, /** @type {string} */ id)=>{ dayNight.setTank(t); setHint(t.kind==='natural'); applyWaterMode(); applyTankChrome(id); },
  onSchools:()=>dayNight.refresh() });
runtime.apply(store.active(), { fresh:true });
restModels.then(rest=>{
  Object.assign(glbMap, rest);
  for(const id of DEFER_GLB) if(rest[id]) runtime.useModel(id);
  console.info('[fish] 其余物种 GLB 已后台就绪:', Object.keys(rest).filter(k=>/** @type {any} */ (rest)[k]).join(', ')||'none');
});
dayNight.setLamp(settings.lamp);               // 灯光亮度（设置面板滑杆），先于昼夜状态应用
dayNight.jump(settings.night||0);              // 启动即应用已保存的昼晚状态
dayNight.setWeather(weather.frame());          // 存档里的天气（默认晴天 = 恒等）
U.wet.value=weather.wet;
/** @type {(st:any)=>void} */ let onWeather=()=>{};
const murkBase=()=>{
  const st=TANK_STYLES[runtime.doc?.tank];
  if(!st?.bowl) return 0;                      // 玻璃缸与旧自然水域：晴天 uMurk=0
  const q=Math.min(1, Math.max(0.35, Number(settings.clarity) || 0.88));
  return pondTint(q, q);
};
// 灯光定时器 + 开缸浊度（跟随本地时间开着时，启动直接对上当前时刻）
const ambience=createAmbience({ settings, dayNight, lens, snow, scene, waterUniforms, isNatural:()=>isNatural(runtime.doc.tank),
  knownIds:store.list().map((/** @type {any} */ d)=>d.id), onFlip:()=>syncLightButton(),
  weather, murkBase, onWeather:(/** @type {any} */ st)=>onWeather(st) });

/* ---------- 轻提示 ---------- */
const toastEl=$('toast');
/** @type {number|undefined} */ let toastTimer;
function toast(/** @type {string} */ msg){
  toastEl.textContent=msg; toastEl.classList.add('on');
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>toastEl.classList.remove('on'), msg.length>20?4200:2200);
}
if(!isWriter) toast('水族箱已在另一个窗口打开：这里可以观赏，但改动不会保存');
else if(store.readOnly) toast('存档来自更新的版本：本次的修改不会被保存');
else if(store.recovered) toast('水景存档无法读取，已备份并恢复为默认水景');

/* ---------- 交互：喂食 / 识鱼 / 敲玻璃 / 逗鱼 ---------- */
const fishCard=createFishCard({ camera, schools, getCare:()=>runtime.care, getSceneId:()=>runtime.doc.id });
input=createTankInput({ camera, canvas:renderer.domElement, schools, fishCard, feeder, sound,
  isBlocked:()=>editor?.active || lure.on });     // 逗鱼时点击让位给光点（不喂食/识鱼/敲玻璃）
input.setBounds(boundsFor(runtime.doc.tank));
$('bFeed').addEventListener('click',()=>input.feedAt(randomFeedPoint()));

/* ---------- 逗鱼模式：光标化作水中光点，引导鱼群追逐盘旋 ---------- */
const bPlay=/** @type {HTMLButtonElement} */ ($('bPlay'));
function setPlay(/** @type {boolean} */ on){
  lure.set(on);
  bPlay.classList.toggle('on',on);
  bPlay.setAttribute('aria-pressed',String(on));
  if(on) toast('逗鱼模式：移动光标，引导鱼群追逐光点');
}
bPlay.addEventListener('click',()=>{ sound.ensure(); setPlay(!lure.on); });
lure.setOnNibble(()=>sound.pling());

/* ---------- 相机预设 ---------- */
const CAM_PRESETS=[
  { pos:[0,1.55,6.1],  tgt:[0,1.05,0]  },
  { pos:[5.6,1.4,2.1], tgt:[0,1.0,0]   },
  { pos:[0.0,4.7,3.2], tgt:[0,0.8,0]   },
  { pos:[1.3,1.0,3.0], tgt:[0.3,0.95,0] },
];
/** @type {any} */ let camTween=null; let camIdx=0;
const FOV0=camera.fov;                           // 缺省视角；机位可带 fov（作品照用长焦），切到别的机位时缓回缺省
/** 机位 fit:[半宽, 半高, 前玻璃 z]：按当前画面宽高比与该机位的 fov，把相机推到"缸宽正好撑满画面、水体高度也装得下"的距离
 * （作品照机位用，窄屏不会裁掉两侧，宽屏不会离得太远） @param {any} p */
function camPos(p){
  if(!p.fit) return p.pos;
  const [hw, hh, z0]=p.fit, t=Math.tan(THREE.MathUtils.degToRad((p.fov ?? FOV0)/2));
  return [p.pos[0], p.pos[1], z0+Math.max(hw/(t*camera.aspect), hh/t)];
}
function tweenCam(/** @type {any} */ preset, /** @type {number} */ dur=1.4){
  camTween={ from:camera.position.clone(), fromT:controls.target.clone(),
    to:new THREE.Vector3(...camPos(preset)), toT:new THREE.Vector3(...preset.tgt), t:0, dur,
    fov0:camera.fov, fov1:preset.fov ?? FOV0 };
}
const setFov=(/** @type {number} */ f)=>{ if(camera.fov!==f){ camera.fov=f; camera.updateProjectionMatrix(); } };
controls.addEventListener('start',()=>{ if(camTween) setFov(camTween.fov1); camTween=null; });   // 手动接管：视角直接落到目标值
// 自然水域没有前玻璃，机位改为俯视水面；大户外池塘用自己的一组（更远、更高）
const camPresets=()=>{
  const st=TANK_STYLES[runtime.doc.tank];
  if(st?.cams) return st.cams;
  return isNatural(runtime.doc.tank) ? NATURAL_CAMS : CAM_PRESETS;
};
$('bCam').addEventListener('click',()=>{ const cams=camPresets(); camIdx=(camIdx+1)%cams.length; tweenCam(cams[camIdx]); });
tweenCam(camPresets()[0], 2.6);   // 开场运镜

/* ---------- 昼夜按钮 ---------- */
const bLight=/** @type {HTMLButtonElement} */ ($('bLight'));
function syncLightButton(){              // 按钮显示"点击后会切到"的状态
  const night=dayNight.target>0.5;
  bLight.classList.toggle('is-night',night);
  const lightLabel=night?'日间':'夜间';
  /** @type {HTMLElement} */ (bLight.querySelector('span')).textContent=lightLabel;
  bLight.title=night?'切换到日光':'切换到月光';
  bLight.setAttribute('aria-label', lightLabel);
}
syncLightButton();
/** 手动定昼夜：视为关闭自动循环与定时器（Dock 按钮 / 设置里的"日间""夜间"） @param {boolean} night */
function setManualLight(night){
  settings.cycle=false; settings.clock=false;
  dayNight.target=night?1:0;
  settings.night=dayNight.target; saveSettings();
  syncLightButton();
}
/** 设置弹层"光照"四选一的当前值 @returns {'day'|'night'|'cycle'|'clock'} */
const lightMode=()=>settings.clock ? 'clock' : settings.cycle ? 'cycle' : dayNight.target>0.5 ? 'night' : 'day';
bLight.addEventListener('click',()=>{ setManualLight(!(dayNight.target>0.5)); settingsPanel.refresh(); });

/* ---------- 底部操作提示：自然水域没有玻璃，双击改叫"拍水面" ---------- */
function setHint(/** @type {boolean} */ natural){
  const el=document.getElementById('hint');
  if(el) el.textContent=`拖拽旋转 · 滚轮缩放 · 点水喂食 · 点鱼识鱼 · 双击${natural ? '拍水面' : '敲玻璃'} · P 逗鱼`;
}

/* ---------- 缩略图：固定正面机位补拍，实现与推迟条件见 ui/thumbnails.js ---------- */
const thumbs=createThumbnails({ camera, composer, renderer, store, runtime, ambience,
  isEditorActive:()=>!!editor?.active, isPhotoOn:()=>!!photo?.on });

/* ---------- 场景切换（淡出 → 重建 → 淡入） ---------- */
const hudScene=$('hudScene'), bScenes=$('bScenes'), fadeEl=$('sceneFade');
const syncHud=()=>{                               // 左上角水景名兼"我的水景"入口
  hudScene.textContent=runtime.doc.name;
  bScenes.setAttribute('aria-label', `我的水景（当前：${runtime.doc.name}）`);
};
/** @type {boolean} */ let switching=false;
/** 刚新建、还没保存过的空缸（放弃造景时删掉） @type {{ id:string, back:string }|null} */ let pendingNew=null;
const MAX_PRECOMPILE_MS=1500;               // 切场景黑场里等着色器预编译的上限
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
    const reveal=()=>{
      fadeEl.classList.remove('on');
      switching=false;
      ambience.enterScene(id);                  // 第一次来的水景（含新建空缸）：水由微浊转清
      if(then) then(); else { toast(`欢迎来到「${runtime.doc.name}」`); thumbs.schedule(); }
    };
    // 黑场期间预编译新场景用到的着色器（并行编译扩展可用时不阻塞主线程），揭幕后第一帧不再卡顿；
    // 最多等 MAX_PRECOMPILE_MS，超时照常揭幕（剩下的由首帧同步编译兜底）
    Promise.race([renderer.compileAsync(scene, camera), new Promise(r=>setTimeout(r, MAX_PRECOMPILE_MS))])
      .catch(err=>console.warn('[scene] 预编译着色器失败', err))
      .finally(reveal);
  }, 420);
}

/* ---------- 造景编辑器 / 水景选择 ---------- */
editor=createSceneEditor({ canvas:renderer.domElement, camera, controls, runtime, store, tweenCam, toast, captureThumb:thumbs.capture,
  onEnter:()=>{ fishCard.hide(); settingsPanel.close(); feeder.clear(); if(lure.on) setPlay(false); runtime.setBatching(false); applyWaterMode(); },   // 俯视时水面挡造景；拆批+关水恢复逐件拾取
  onExit:(/** @type {any} */ saved)=>{
    syncHud(); runtime.setBatching(true); applyWaterMode();   // 编辑结束立即重批+重开水体（apply 已跑过，这里补同步）
    if(saved) ambience.afterSave();
    // 新建空缸后在造景里直接放弃：这个缸从没保存过，删掉并回到原来的水景（此前会留下一个空缸，人也停在里面）
    const nw=pendingNew; pendingNew=null;
    if(nw && !saved && store.activeId===nw.id && store.remove(nw.id)){
      switchScene(store.get(nw.back) ? nw.back : store.activeId, { force:true, then:()=>toast('已放弃新建的水景') });
    }
  } });
const picker=createScenePicker({ store, toast,
  onSwitch:(/** @type {string} */ id, /** @type {any} */ opts)=>switchScene(id, opts),
  onEdit:(/** @type {string} */ id)=>switchScene(id, { then:()=>editor.enter() }),
  onCreate:(/** @type {string} */ id)=>{ pendingNew={ id, back:store.activeId }; switchScene(id, { then:()=>editor.enter() }); } });
picker.onRenamed=(/** @type {string} */ id)=>{ if(id===store.activeId){ runtime.doc.name=(store.get(id) ?? { name:'' }).name; syncHud(); } };
bScenes.addEventListener('click',()=>{ settingsPanel.close(); fishCard.hide(); picker.open(); });
$('bEdit').addEventListener('click',()=>editor.enter());

/* ---------- 帮助（设置 › 更多 里打开）/ 图鉴 ---------- */
const helpEl=$('help');
const castEl=helpEl.querySelector('.help-cast');
if(castEl) castEl.textContent='缸中居民：'+SPECIES.map(s=>SPECIES_META[s.id]?.name).filter(Boolean).join(' · ');
const openHelp=()=>holdDialog(helpEl, '#helpClose');
const closeHelp=()=>{ if(!helpEl.hidden) releaseDialog(helpEl); };
$('bHelp').addEventListener('click',()=>{
  settingsPanel.close();
  $('bSettings').focus();                         // 关掉说明后焦点回到设置按钮（弹层已收起）
  openHelp();
});
$('helpClose').addEventListener('click', closeHelp);
helpEl.addEventListener('click',e=>{ if(e.target===helpEl) closeHelp(); });
const guideEl=$('encyclopedia');
const syncBondHud=()=>{                       // 图鉴页脚的亲密度进度
  const c=runtime.care, lv=c.bondLevel;
  $('bondText').textContent = lv>=MILESTONES.length
    ? `亲密度 Lv.${lv} · ${c.bondProgress()>=1 ? '鱼儿们容光焕发' : '鱼群渐渐泛起光泽'}`
    : `亲密度 Lv.${lv} · 距离下一位新朋友 ${Math.round(c.bondProgress()*100)}%`;
};
const openGuide=()=>{ holdDialog(guideEl, '#guideClose'); guideEl.setAttribute('aria-hidden','false'); syncBondHud(); syncEncyclopediaCounts(runtime.doc.fish); requestAnimationFrame(renderEncyclopediaPreviews); };
const closeGuide=()=>{ if(guideEl.hidden) return; releaseDialog(guideEl); guideEl.setAttribute('aria-hidden','true'); };
$('bGuide').addEventListener('click',openGuide);
$('guideClose').addEventListener('click',closeGuide);
guideEl.addEventListener('click',e=>{ if(e.target===guideEl) closeGuide(); });

/* ---------- 设置弹层 ---------- */
const settingsPanel=createSettingsPanel({ settings, lightMode, isBowl:()=>!!TANK_STYLES[runtime.doc.tank]?.bowl,
  onChange:(/** @type {string} */ key,/** @type {any} */ value)=>{
  if(key==='light'){ setManualLight(value==='night'); return; }   // 光照"日间 / 夜间"：不是存档键，走手动昼夜
  settings[key]=value;
  if(key==='sound'){ sound.setEnabled(value); if(value){ sound.ensure(); sound.blip(); } }
  if(key==='snow') snow.pts.visible=value;
  if(key==='caustics') setCausticsEnabled(value);
  if(key==='absorb' || key==='haze') applyAbsorb();   // 雾化总开关或浓度变了都重算吸收
  if(key==='shafts') waterPass.setShafts(qualityFX.bloom ? value : 0);
  if(key==='dof') lens.setDof(!!value && qualityFX.bloom);   // 画质最低档时与光柱一致：保持关闭
  if(key==='lamp') dayNight.setLamp(value);
  if(key==='qualityMode') applyQualityLock();     // 手动锁档 / 切回自动
  if(key==='weatherMode') weather.set(String(value));
  if(key==='weatherI') weather.set(weather.mode, /** @type {number} */ (value));
  if(key==='weatherAuto') weather.setAuto(!!value);
  if(key==='weatherMode' || key==='weatherI' || key==='weatherAuto'){
    Object.assign(settings, weather.snapshot());
    dayNight.setWeather(weather.frame());
    U.wet.value=weather.wet;
  }
  saveSettings();
}});
onWeather=(/** @type {any} */ st)=>{
  settings.weatherMode=st.mode; settings.weatherI=st.intensity; settings.weatherWet=st.wet;
  settingsPanel.sync('weatherMode', st.mode);
  settingsPanel.sync('weatherI', st.intensity);
  saveSettings();
};
addEventListener('pointerdown',()=>sound.ensure(),{ once:true });
installBackup({ toast });                         // 设置弹层里的存档导出/导入

/* ---------- PWA：生产构建注册 Service Worker（离线可玩），dev / npm run serve 不介入 ---------- */
if(import.meta.env?.PROD && 'serviceWorker' in navigator){
  navigator.serviceWorker.register('./sw.js').catch(err=>console.warn('[pwa] 注册失败', err));
}

/* ---------- 拍照模式 / 全局按键 ---------- */
const photo=createPhotoMode({ renderer, composer, hideTargets:['hud','dock','care','hint'],
  onEnter:()=>{ fishCard.hide(); settingsPanel.close(); },
  onShot:ok=>toast(ok?'照片已保存':'拍摄失败，请稍后再试') });
$('bPhoto').addEventListener('click',()=>photo.set(true));
addEventListener('keydown',e=>{
  if(editor.active) return;                    // 编辑器有自己的快捷键
  if(e.key==='Escape'){
    if(!guideEl.hidden) closeGuide();
    closeHelp();
    if(picker.isOpen) picker.close();
    fishCard.hide(); settingsPanel.close();
    if(photo.on) photo.set(false);
  }
  if((e.key==='h'||e.key==='H') && !e.repeat && !(e.target instanceof HTMLInputElement)) photo.press();
  if((e.key==='p'||e.key==='P') && !e.repeat && !(e.target instanceof HTMLInputElement)){ sound.ensure(); setPlay(!lure.on); }
});

/* ================================================================
 * 主循环
 * ================================================================ */
const clock=new THREE.Clock();
const statsEl=$('stats'), careFill=$('careFill'), careText=$('careText');
$('verText').textContent=`Aquarium ${VERSION}`;
let fpsFrames=0, fpsTime=0, realT=0;
renderer.info.autoReset=false;                    // 整帧统计（含阴影/后期）由主循环手动重置（__aqDebug.perf 用）

/* ---------- 自然水域：天空穹顶 + 平面反射（玻璃缸不走这里） ---------- */
const sky=createSky({ renderer, scene, hemi });
/** @type {any[]} */ const reflectRoots=[];
const reflect=createWaterReflect({ renderer, scene, camera, waterMesh, waterUniforms, sky,
  hideRoots:()=>{                                 // 复用数组：反射 pass 每帧调用
    reflectRoots.length=0;
    for(const s of schools) reflectRoots.push(s.group);
    for(const p of precip.parts) reflectRoots.push(p);
    return reflectRoots;
  } });

/* ---------- 自动画质：阶梯降级（像素预算+像素比上限 → 1.25/1 + 低配玻璃 → 关泛光），帧率回升逐级恢复 ---------- */
const coarsePointer=matchMedia?.('(pointer:coarse)').matches ?? false;   // 触屏上限 1.5（与 setup.js 一致）
const qualityFX=createQualityEffects({ renderer, composer, bloom, lens, tankGroup, glassHigh, glassLow,
  waterPass, renderPass, precip, reflect, runtime, tank, settings });   // 档位 → 渲染器/场景副作用（见 systems/quality-effects.js）
const quality=createQuality({ baseRatio:Math.min(devicePixelRatio, coarsePointer?1.5:2), onLevel:qualityFX.apply });

// 手动画质锁：'auto' 交给阶梯，数字档位直接锁定（不再采样自动升降）
function applyQualityLock(){
  if(settings.qualityMode!=='auto') quality.force(Number(settings.qualityMode));
}
if(settings.qualityMode!=='auto') applyQualityLock();

const onEat=(/** @type {any} */ school, /** @type {number} */ i)=>{ school.setGrowth(i, runtime.care.eat(school.spec.id,i)); sound.crunch(); };
const onGulp=(/** @type {THREE.Vector3} */ p)=>ripples.spawn(p.x, p.z);   // 迷鳃鱼上水面吞气：水面一圈涟漪
function updateCareHud(){                // 圆环 pathLength=100：dashoffset = 100 - 百分比
  careFill.style.strokeDashoffset=`${100-Math.round(runtime.care.satiety*100)}`;
  careText.textContent=runtime.care.status();
}
/* ---------- 亲密度里程碑：攒够就发一条新鱼入缸（原地加，不重建鱼群；实现见 systems/arrival.js） ---------- */
const arrival=createArrival({ runtime, store, toast, sound, updateHud:updateCareHud });
syncHud();
thumbs.schedule();

function frame(){
  renderer.info.reset();                          // 与 autoReset=false 配对：统计覆盖主场景+阴影+后期整帧
  const rawDt=clock.getDelta();
  const dt=Math.min(rawDt,0.05);
  U.time.value+=dt;
  const t=U.time.value;

  ambience.update(dt, t);                       // 昼夜（自动循环 / 本地时间）+ 开缸浊度

  if(camTween){                                 // 相机运镜
    camTween.t+=dt;
    const k=Math.min(1,camTween.t/camTween.dur), e=1-Math.pow(1-k,3);
    camera.position.lerpVectors(camTween.from,camTween.to,e);
    controls.target.lerpVectors(camTween.fromT,camTween.toT,e);
    setFov(camTween.fov0+(camTween.fov1-camTween.fov0)*e);
    if(k>=1) camTween=null;
  }
  limitPolar();
  controls.update();
  lens.focusOn(fishCard.focusPoint(focusPt) ?? controls.target, dt);   // 识鱼时拉焦到那条鱼

  // 兴奋度：有饲料 → 升到食欲上限（饿 → 疯抢，饱 → 懒散）
  const care=runtime.care;
  care.update(dt);
  if(care.milestoneDue() && !editor.active && !switching) arrival.grant();
  runtime.setGloss(care.glossK());            // 里程碑领完后的余量换光泽（同值不重设）
  const appetite=care.appetite();
  const active=feeder.pellets;
  // 兴奋度：有饲料 → 食欲上限（饿 → 疯抢，饱 → 懒散）；逗鱼光点 → 固定的玩耍兴奋（也会叫醒夜眠的鱼）
  U.excite.value+=((Math.max(active.length?appetite:0, lure.on?0.55:0))-U.excite.value)*Math.min(1,dt*1.4);
  if(!input) return;
  const shake=input.update(dt, t);
  // 夜间睡眠：喂食与惊吓都会把鱼叫醒
  const sleep=sstep(0.55,0.9,dayNight.k)*(1-U.excite.value)*(1-input.fear);

  const flow=/** @type {any} */ (TANK_STYLES[runtime.doc.tank])?.env?.current ?? 0;   // 溪流/小河的水流
  feeder.flow=flow; snow.flow=flow; U.flow.value=flow;
  feeder.wafers=schools.some(s=>s.spec.hug!=null && s.spec.count>0) ? 3 : 0;   // 有底栖鱼才投沉底片
  lure.update(dt, t);                            // 光点视觉/位置先就位，鱼群本帧就追得上
  const ctx={ obstacles, pellets:active, feeder, excite:U.excite.value, time:t, schools, current:flow,
    appetite, fear:input.fear, sleep, onEat, onGulp, grid:fishGrid, lure };
  rebuildFishGrid(fishGrid, schools);             // 共享统一网格：同种/异种 pair 查询走邻域
  for(const s of schools) s.update(dt,ctx);

  feeder.update(dt,t);
  bubbles.mesh.visible=settings.bubbles && air.on;
  bubbles.update(dt,t);
  sound.update(dt, settings.bubbles && air.on);
  snow.update(dt,t);
  ripples.update(dt);
  const wxNow=weather.frame();                   // 每帧只算一次天气帧
  precip.update(dt, wxNow, t);
  editor.update(t);
  const natural=isNatural(runtime.doc.tank);
  sky.update(dt, dayNight.k, wxNow, hoodSpot.position, natural);
  sky.place(camera.position);
  reflect.setDim(reflectDim(dayNight.k, wxNow));
  runtime.glowShore(dayNight.k);                 // 先点灯，反射 pass 里的石灯才是亮的
  reflect.render(natural && !editor.active && waterMesh.visible);

  // 焦散：按实时波面重新泼溅（光子泼溅，学自 tidewater）。波随天气的浪与水流走；焦散关时不画
  updateCaustics(renderer, hoodSpot, { t, dt, flow, chop:U.chop.value, on:causticsOn.value>0 });

  // 阴影贴图限频：鱼游得慢，降频更新肉眼看不出，省下大半帧的投影 pass（它要把全部投影物再画一遍）；
  // 频率随画质档走（高清 30 Hz → 极速 10 Hz，学自 aquarium-editor 的分级阴影）
  qualityFX.shadowTick(rawDt);

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
    statsEl.textContent=`实时 ${fps} FPS · ${quality.label}${settings.qualityMode==='auto' ? '（自动调节）' : '（已锁定）'} · ${runtime.fishTotal()} 条鱼`;   // 设置 › 画面
    fpsFrames=0; fpsTime=0;
    updateCareHud();
    if(settings.qualityMode==='auto') quality.sample(fps, realT);   // 门槛/迟滞按真实秒计：低帧率下模拟时间会被 clamp 拖慢
  }
}
renderer.setAnimationLoop(frame);

addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
  composer.setSize(innerWidth,innerHeight);
  quality.reapply();                              // 像素预算依赖窗口尺寸，resize 后重算当前档的实际像素比
});

installDebug({ composer, schools, obstacles, air, feeder, dayNight, ambience, settings, input, fishCard, runtime, store, editor, camera, controls, waterPass, lure, renderPass,
  bloom, lens, scene, hoodSpot, waterMesh, glassHigh, modelPreviewStats, updateCareHud, switchScene, randomFeedPoint,
  sky, reflect,
  stopCamTween:()=>{ camTween=null; }, renderer, loopFrame:frame, quality,
  setCycle:(/** @type {boolean} */ on)=>{ settings.cycle=on; },   // 只改本次运行，不落盘
  settingsPanel,
  setWeather:(/** @type {string} */ mode, /** @type {number|undefined} */ intensity)=>{
    weather.set(mode, intensity); weather.setAuto(false); settings.weatherAuto=false;
    settingsPanel.set('weatherAuto', false);
    settingsPanel.sync('weatherMode', weather.mode); settingsPanel.sync('weatherI', weather.intensity);
    const f=weather.frame(); dayNight.setWeather(f); U.wet.value=weather.wet;
    return { mode:f.mode, intensity:f.intensity, rain:+f.rain.toFixed(3), snow:+f.snow.toFixed(3), grey:+f.grey.toFixed(3), chop:+f.chop.toFixed(3) };
  },
  weather:()=>weather.snapshot(),
  setWaterOn:(/** @type {boolean} */ on)=>{ waterOn=on; applyWaterMode(); },   // __aqDebug.water：关=回退网格水面
  glbLoaded:()=>Object.keys(glbMap).filter(k=>/** @type {any} */ (glbMap)[k]),
  // 隐藏页面里 rAF 停摆（three 的动画循环已被启动占位）时重启主循环；
  // 配合先把 window.requestAnimationFrame 换成 setTimeout 垫片使用
  restartLoop(){ renderer.setAnimationLoop(null); renderer.setAnimationLoop(frame); } });

/* ---------- 宣传片导演模式：?promo=1 才激活（分镜/逐帧导出，见 promo/promo.js），正常启动零开销 ---------- */
createPromo({ clock, renderer, composer, camera, controls, photo, settings, quality });
