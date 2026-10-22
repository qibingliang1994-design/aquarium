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
import { createQuality, budgetRatio } from './systems/quality.js';
import { createAmbience } from './systems/ambience.js';
import { SPECIES } from './entities/fish/species.js';
import { loadSpeciesModels } from './entities/fish/species-models.js';
import { SPECIES_META } from './ui/encyclopedia.js';
import { MILESTONES } from './systems/care.js';
import { createFishGrid, rebuildFishGrid } from './entities/fish/steering.js';
import { fishRim } from './fish/glb-style.js';
import { createSceneStore } from './scenes/scene-store.js';
import { acquireWriter, canWrite } from './systems/write-lock.js';
import { TANK_STYLES, NATURAL_CAMS, isNatural } from './scenes/tank-styles.js';
import { createSceneRuntime } from './scenes/scene-runtime.js';
import { createSceneEditor } from './editor/scene-editor.js';
import { renderEncyclopediaPreviews, modelPreviewStats, syncEncyclopediaCounts } from './ui/encyclopedia.js';
import { createFishCard } from './ui/fish-card.js';
import { createSettingsPanel } from './ui/settings-panel.js';
import { installBackup } from './ui/backup.js';
import { createScenePicker } from './ui/scene-picker.js';
import { createTankInput, randomFeedPoint } from './ui/tank-input.js';
import { createPhotoMode } from './ui/photo-mode.js';
import { createLensPass, attachDepth } from './scene/lens-pass.js';
import { createWaterPass } from './scene/water-pass.js';
import { installDebug } from './debug.js';

/* ================================================================
 * 组合根：创建各模块、接线 DOM、驱动主循环
 * 场景（造景/鱼群/水色）由 scenes/ 下的文档驱动，见 scene-runtime.js
 * ================================================================ */
const VERSION='v2.1';
const $=(/** @type {string} */ id)=>{ const el=document.getElementById(id); if(!el) throw new Error(`missing #${id}`); return el; };

const world=createWorld();
const { renderer, scene, camera, controls, hemi, hoodSpot, fillLight, waterGlow, composer, bloom, rim, setMSAA }=world;
const tank=createTank(scene);
const { tankGroup, waterUniforms, glassHigh, glassLow, sandMat, waterMesh, floorGlowMat }=tank;
const lens=createLensPass(camera, scene);       // 景深 + 水体纵深：紧跟 RenderPass，在泛光之前（线性 HDR）
// 水体合成 pass（学自 aquarium-editor）：折射/全内反射/掠射镜面/阴影光柱/吸收一体化，玻璃缸专用。
// 读 composer A 的颜色+深度、写私有 rtWater（needsSwap=false）→ lens 颜色源切到 rtWater、深度仍读 A——
// 任何被采样的目标都不在当前绘制目标上，不踩深度反馈环
const waterPass=createWaterPass({ camera, scene, light:hoodSpot, waterY:TANK.waterY,
  box:{ min:new THREE.Vector3(-TANK.W/2+TANK.glass, 0.02, -TANK.D/2+TANK.glass),
        max:new THREE.Vector3(TANK.W/2-TANK.glass, TANK.waterY, TANK.D/2-TANK.glass) },
  waterUniforms, turbUniform:lens.uniforms.uTurb });
attachDepth(composer);
composer.insertPass(waterPass, 1);
composer.insertPass(lens, 2);
const focusPt=new THREE.Vector3();

const air={ x:1.6, z:0.5, on:true };          // 气泡发射点：场景里第一个气石（scene-runtime 原地更新）
const { bubbles, snow, ripples }=createEffects({ tankGroup, air, sandHeight, waterY:TANK.waterY });
const feeder=new Feeder({ tankGroup, sandHeight, waterY:TANK.waterY, ripples });

/* ---------- 场景基础：昼夜 / 存档 / 模型预加载 ---------- */
/** @type {any[]} */ const schools=[];         // 两个数组都由 runtime 原地维护
/** @type {any[]} */ const obstacles=[];
const dayNight=createDayNight({ scene, lights:{ hoodSpot, hemi, fillLight, waterGlow, rim },
  waterUniforms, sandMat, shell:tank.shell, floorGlowMat, schools, fishRim });
// 多窗口单写者：必须在第一次写存档（createSceneStore 启动时会回写）之前拿锁
const isWriter=await acquireWriter();
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
/** @type {Record<string, any>} */ const settings={ sound:true, cycle:false, clock:false, night:0, lamp:1, absorb:0.4, shafts:0.1, bubbles:true, snow:true, caustics:true, dof:true, haze:true };
try{ Object.assign(settings, JSON.parse(localStorage.getItem('aquarium.settings')||'{}')); }catch(err){ console.warn('[settings] 读取设置失败，使用默认值', err); }
settings.lamp=Math.min(1.5, Math.max(0, +settings.lamp||1));   // 旧存档/坏值兜底：0~1.5，1=默认
const saveSettings=()=>{ if(!canWrite()) return; try{ localStorage.setItem('aquarium.settings', JSON.stringify(settings)); }catch(err){ console.warn('[settings] 保存设置失败', err); } };
const sound=new SoundEngine(); sound.setEnabled(settings.sound);
snow.pts.visible=settings.snow; setCausticsEnabled(settings.caustics);
const applyAbsorb=()=>{ waterPass.uniforms.uSigmaK.value=settings.haze===false?0:settings.absorb; };   // 水体雾化总开关（关=吸收清零，更通透）× 水色浓淡滑杆
applyAbsorb();
waterPass.setShafts(settings.shafts);                          // 光柱强度（画质最低档时由 onLevel 归零）
lens.setDof(settings.dof!==false);                             // 景深（画质最低档时由 onLevel 连带关闭）

/* ---------- 场景：存档 → 运行时（造景 / 鱼群 / 主题） ---------- */
let waterOn=true;                                // 水体合成总开关（__aqDebug.water(false) 回退网格水面）
/** @type {any} */ let editor=null;               // 提前声明：applyWaterMode 在 runtime.apply（编辑器创建前）就会被 onTank 调到
function applyWaterMode(){
  const nat=isNatural(runtime.doc.tank);
  const on=waterOn && !nat && !editor?.active;   // 玻璃缸且非编辑态才走合成水面
  waterPass.enabled=on;
  lens.setSource(on ? waterPass.output : null);  // lens 颜色源：合成输出 / 直接读场景目标
  lens.setHaze(false);                           // 水体吸收由合成 pass 接管（自然水域本就关，网格+水深贴图自管）
  waterMesh.visible=!editor?.active && (nat || !on);   // 缸走合成时藏网格；自然水域与回退态用网格
}
const runtime=createSceneRuntime({ tankGroup, tank, glbMap, schools, obstacles, air, renderer,
  onTheme:(/** @type {any} */ t)=>dayNight.setTheme(t), onTank:(/** @type {any} */ t)=>{ dayNight.setTank(t); setHint(t.kind==='natural'); applyWaterMode(); }, onSchools:()=>dayNight.refresh() });
runtime.apply(store.active(), { fresh:true });
dayNight.setLamp(settings.lamp);               // 灯光亮度（设置面板滑杆），先于昼夜状态应用
dayNight.jump(settings.night||0);              // 启动即应用已保存的昼晚状态
// 灯光定时器 + 开缸浊度（跟随本地时间开着时，启动直接对上当前时刻）
const ambience=createAmbience({ settings, dayNight, lens, snow, scene, waterUniforms, isNatural:()=>isNatural(runtime.doc.tank),
  knownIds:store.list().map((/** @type {any} */ d)=>d.id), onFlip:()=>syncLightButton() });

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

/* ---------- 交互：喂食 / 识鱼 / 敲玻璃 ---------- */
const fishCard=createFishCard({ camera, schools, getCare:()=>runtime.care, getSceneId:()=>runtime.doc.id });
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
  for(const k of ['cycle','clock']){ settings[k]=false; settingsPanel.set(k,false); }   // 手动切换视为关闭自动循环与定时器
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
    if(!(/** @type {any} */ (window)).__aqReady || document.hidden || editor.active || photo.on || ambience.turbidity>0){ scheduleThumb(); return; }
    const shot=captureThumb();
    if(shot) store.setThumb(id, shot); else scheduleThumb();
  }, 3200);
}

/* ---------- 场景切换（淡出 → 重建 → 淡入） ---------- */
const hudScene=$('hudScene'), fadeEl=$('sceneFade');
const syncHud=()=>{ hudScene.textContent=`「${runtime.doc.name}」`; };
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
      if(then) then(); else { toast(`欢迎来到「${runtime.doc.name}」`); scheduleThumb(); }
    };
    // 黑场期间预编译新场景用到的着色器（并行编译扩展可用时不阻塞主线程），揭幕后第一帧不再卡顿；
    // 最多等 MAX_PRECOMPILE_MS，超时照常揭幕（剩下的由首帧同步编译兜底）
    Promise.race([renderer.compileAsync(scene, camera), new Promise(r=>setTimeout(r, MAX_PRECOMPILE_MS))])
      .catch(err=>console.warn('[scene] 预编译着色器失败', err))
      .finally(reveal);
  }, 420);
}

/* ---------- 造景编辑器 / 水景选择 ---------- */
editor=createSceneEditor({ canvas:renderer.domElement, camera, controls, runtime, store, tweenCam, toast, captureThumb,
  onEnter:()=>{ fishCard.hide(); settingsPanel.close(); feeder.clear(); runtime.setBatching(false); applyWaterMode(); },   // 俯视时水面挡造景；拆批+关水恢复逐件拾取
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
const openGuide=()=>{ guideEl.hidden=false; guideEl.setAttribute('aria-hidden','false'); syncBondHud(); syncEncyclopediaCounts(runtime.doc.fish); requestAnimationFrame(renderEncyclopediaPreviews); };
const closeGuide=()=>{ guideEl.hidden=true; guideEl.setAttribute('aria-hidden','true'); };
$('bGuide').addEventListener('click',openGuide);
$('guideClose').addEventListener('click',closeGuide);
guideEl.addEventListener('click',e=>{ if(e.target===guideEl) closeGuide(); });

/* ---------- 设置弹层 ---------- */
let qualityBloom=true;                           // 当前画质档是否开泛光（最低档连光柱一起停）
const settingsPanel=createSettingsPanel({ settings, onChange:(/** @type {string} */ key,/** @type {any} */ value)=>{
  settings[key]=value;
  if(key==='sound'){ sound.setEnabled(value); if(value){ sound.ensure(); sound.blip(); } }
  if(key==='snow') snow.pts.visible=value;
  if(key==='caustics') setCausticsEnabled(value);
  if(key==='absorb' || key==='haze') applyAbsorb();   // 雾化总开关或浓度变了都重算吸收
  if(key==='shafts') waterPass.setShafts(qualityBloom ? value : 0);
  if(key==='dof') lens.setDof(!!value && qualityBloom);   // 画质最低档时与光柱一致：保持关闭
  if(key==='lamp') dayNight.setLamp(value);
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
renderer.info.autoReset=false;                    // 整帧统计（含阴影/后期）由主循环手动重置（__aqDebug.perf 用）

/* ---------- 自动画质：阶梯降级（像素预算+像素比上限 → 1.25/1 + 低配玻璃 → 关泛光），帧率回升逐级恢复 ---------- */
const coarsePointer=matchMedia?.('(pointer:coarse)').matches ?? false;   // 触屏上限 1.5（与 setup.js 一致）
let shadowHz=30, shadowAcc=1/30;                // 阴影贴图刷新率（随画质档变化）与累计器；首帧就画一次
const quality=createQuality({
  baseRatio:Math.min(devicePixelRatio, coarsePointer?1.5:2),
  onLevel(q){
    // 像素预算：大窗口（4K 全屏等）按 sqrt(预算/窗口像素) 立即缩，不等帧率阶梯；小窗口仍用基准 dpr
    const ratio=budgetRatio(q.pixels, innerWidth, innerHeight, q.ratio);
    renderer.setPixelRatio(ratio);
    composer.setPixelRatio(ratio);
    composer.setSize(innerWidth,innerHeight);
    for(const g of /** @type {any[]} */ (tankGroup.children)){
      const gm=/** @type {any} */ (g);
      if(gm.material===glassHigh || gm.material===glassLow) gm.material=q.glass==='low'?glassLow:glassHigh;
    }
    bloom.enabled=q.bloom; lens.setDof(q.bloom && settings.dof!==false);   // 最低一档连景深一起关（用户也关了才算数）
    qualityBloom=q.bloom;
    waterPass.setShafts(q.bloom ? settings.shafts : 0);   // 光柱 march 是最贵的逐像素步进：最低档停，其余按用户强度
    setMSAA(ratio>=1.75 ? 0 : q.bloom ? 4 : 2);   // 高 DPI 屏不需要；最低一档降到 2x
    shadowHz=q.shadowHz; shadowAcc=Math.max(shadowAcc, 1/q.shadowHz);   // 变档立即按新频率走
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
    if(k>=1) camTween=null;
  }
  controls.update();
  lens.focusOn(fishCard.focusPoint(focusPt) ?? controls.target, dt);   // 识鱼时拉焦到那条鱼

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
  feeder.flow=flow; snow.flow=flow; U.flow.value=flow;
  feeder.wafers=schools.some(s=>s.spec.hug!=null && s.spec.count>0) ? 3 : 0;   // 有底栖鱼才投沉底片
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

  // 阴影贴图限频：鱼游得慢，降频更新肉眼看不出，省下大半帧的投影 pass（它要把全部投影物再画一遍）；
  // 频率随画质档走（高清 30 Hz → 极速 10 Hz，学自 aquarium-editor 的分级阴影）
  shadowAcc+=rawDt;
  if(shadowAcc>=1/shadowHz){ renderer.shadowMap.needsUpdate=true; shadowAcc%=1/shadowHz; }

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
  quality.reapply();                              // 像素预算依赖窗口尺寸，resize 后重算当前档的实际像素比
});

installDebug({ schools, obstacles, air, feeder, dayNight, ambience, settings, input, fishCard, runtime, store, editor, camera, controls, waterPass,
  bloom, lens, scene, hoodSpot, waterMesh, glassHigh, modelPreviewStats, updateCareHud, switchScene, randomFeedPoint,
  stopCamTween:()=>{ camTween=null; }, renderer, loopFrame:frame, quality,
  setCycle:(/** @type {boolean} */ on)=>{ settings.cycle=on; },   // 只改本次运行，不落盘
  setWaterOn:(/** @type {boolean} */ on)=>{ waterOn=on; applyWaterMode(); },   // __aqDebug.water：关=回退网格水面
  glbLoaded:()=>Object.keys(glbMap).filter(k=>/** @type {any} */ (glbMap)[k]),
  // 隐藏页面里 rAF 停摆（three 的动画循环已被启动占位）时重启主循环；
  // 配合先把 window.requestAnimationFrame 换成 setTimeout 垫片使用
  restartLoop(){ renderer.setAnimationLoop(null); renderer.setAnimationLoop(frame); } });
