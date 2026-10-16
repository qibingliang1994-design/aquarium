import * as THREE from 'three';
import { rand, lerp, sstep } from './utils.js';
import { U } from './uniforms.js';
import { TANK, sandHeight, createTank } from './scene/tank.js';
import { createWorld } from './scene/setup.js';
import { createScenery } from './entities/scenery.js';
import { createEffects } from './systems/effects.js';
import { Feeder } from './systems/feeder.js';
import { SPECIES } from './entities/fish/species.js';
import { School } from './entities/fish/school.js';
import { renderEncyclopediaPreviews, modelPreviewStats } from './ui/encyclopedia.js';
import { createFishCard } from './ui/fish-card.js';
import { createSettingsPanel } from './ui/settings-panel.js';
import { SoundEngine } from './systems/sound.js';
import { createCare } from './systems/care.js';

import { loadSpeciesModels } from './entities/fish/species-models.js';
import { fishRim } from './fish/glb-style.js';
import { setCausticsEnabled } from './scene/caustics.js';

/* ================================================================
 * 渲染器 / 场景 / 相机 / 灯光 / 后期
 * ================================================================ */
const { renderer, scene, camera, controls, hemi, hoodSpot, fillLight, waterGlow, composer, bloom, rim } = createWorld();

/* ================================================================
 * 水族箱本体：玻璃 / 边框 / 灯罩 / 水面 / 沙底（src/scene/tank.js 创建）
 * ================================================================ */
const { tankGroup, waterUniforms, glassHigh, glassLow, sandMat, waterMesh, stripMat, floorGlowMat } = createTank(scene);

/* ================================================================
 * 水景：岩石 / 沉木 / 水草 / 气石（src/entities/scenery.js 创建）
 * ================================================================ */
const { obstacles, AIR } = createScenery({ tankGroup, sandHeight });

/* ================================================================
 * 特效：气泡 / 光柱 / 悬浮物 / 涟漪（src/systems/effects.js 创建）
 * ================================================================ */
const { bubbles, rays, snow, ripples } = createEffects({ tankGroup, air:AIR, sandHeight, waterY:TANK.waterY });

/* ================================================================
 * 喂食系统
 * ================================================================ */
const feeder=new Feeder({ tankGroup, sandHeight, waterY:TANK.waterY, ripples });

/* ================================================================
 * 组装鱼群
 * ================================================================ */
// 预加载骨骼动画模型（失败物种自动回退程序化鱼）
const glbMap=await loadSpeciesModels(SPECIES);
console.log('[fish] GLB loaded:', SPECIES.filter(s=>glbMap[s.id]).map(s=>s.id).join(', ')||'none (procedural fallback)');
const care=createCare(SPECIES);      // 饱食度 + 个体成长（持久化）
const schools=SPECIES.map(s=>new School(s, obstacles, glbMap[s.id], { growth:care.growthArray(s.id) }));
for(const s of schools) tankGroup.add(s.group);
const FISH_TOTAL=schools.reduce((a,s)=>a+s.spec.count,0);

/* ================================================================
 * 设置与持久化（localStorage：音效 / 自动昼夜 / 昼晚状态）
 * ================================================================ */
const settings={ sound:true, cycle:false, night:0, rays:true, bubbles:true, snow:true, caustics:true };
try{ Object.assign(settings, JSON.parse(localStorage.getItem('aquarium.settings')||'{}')); }catch(err){ console.warn('[settings] 读取设置失败，使用默认值', err); }
const saveSettings=()=>{ try{ localStorage.setItem('aquarium.settings', JSON.stringify(settings)); }catch(err){ console.warn('[settings] 保存设置失败', err); } };
const sound=new SoundEngine(); sound.setEnabled(settings.sound);
// 特效可见性按已存设置应用
bubbles.mesh.visible=settings.bubbles; rays.group.visible=settings.rays;
snow.pts.visible=settings.snow; setCausticsEnabled(settings.caustics);

/* ================================================================
 * 交互：点击喂食 / 相机预设 / 昼夜切换
 * ================================================================ */
const raycaster=new THREE.Raycaster();
const fishCard=createFishCard({ camera, schools, care });
const hideFishCard=()=>fishCard.hide();
const feedAt=p=>{ sound.ensure(); sound.plop(); hideFishCard(); feeder.spawn(p); };

/* ---------- 敲玻璃：快速双击 → 全缸惊散（惊吓度 2 秒衰减） ---------- */
const TAP_GAP_MS=300, TAP_SLOP_PX=30, FEAR_SECS=2, SHAKE_SECS=0.18;
const TANK_BOX=new THREE.Box3(
  new THREE.Vector3(-TANK.W/2+TANK.glass, sandHeight(0,0), -TANK.D/2+TANK.glass),
  new THREE.Vector3( TANK.W/2-TANK.glass, TANK.waterY,      TANK.D/2-TANK.glass));
let fear=0, shake=0;
function tapGlass(cx,cy){
  raycaster.setFromCamera(new THREE.Vector2((cx/innerWidth)*2-1, -(cy/innerHeight)*2+1), camera);
  const point=raycaster.ray.intersectBox(TANK_BOX,new THREE.Vector3())   // 视线进入缸体处
    ?? TANK_BOX.getCenter(new THREE.Vector3());
  sound.ensure(); sound.knock(); hideFishCard();
  fear=1; shake=SHAKE_SECS;
  for(const s of schools) s.startle(point);
}
function feedPointFromScreen(cx,cy){
  const ndc=new THREE.Vector2((cx/innerWidth)*2-1, -(cy/innerHeight)*2+1);
  raycaster.setFromCamera(ndc,camera);
  const o=raycaster.ray.origin, d=raycaster.ray.direction;
  const inXZ=(x,z)=>Math.abs(x)<2.15 && Math.abs(z)<0.78;
  if(Math.abs(d.y)>1e-4){
    const t=(TANK.waterY-o.y)/d.y;
    if(t>0){ const x=o.x+d.x*t, z=o.z+d.z*t;
      if(inXZ(x,z)) return new THREE.Vector3(x,TANK.waterY,z); }
    const t2=(0.5-o.y)/d.y;                       // 兜底：沙面上方
    if(t2>0){ const x=o.x+d.x*t2, z=o.z+d.z*t2;
      if(inXZ(x,z)) return new THREE.Vector3(x,TANK.waterY,z); }
  }
  return new THREE.Vector3(rand(-1.1,1.1),TANK.waterY,rand(-0.38,0.38));
}
{
  let downX=0,downY=0,downT=0, lastTapT=-1e9, lastTapX=0, lastTapY=0;
  renderer.domElement.addEventListener('pointerdown',e=>{ downX=e.clientX; downY=e.clientY; downT=performance.now(); });
  renderer.domElement.addEventListener('pointerup',e=>{
    const now=performance.now();
    if(Math.hypot(e.clientX-downX,e.clientY-downY)>=7 || now-downT>=450) return;   // 拖拽不算点击
    // 第二下紧跟第一下 → 敲玻璃（第一下照常喂食/识鱼，保证单击零延迟）
    if(now-lastTapT<TAP_GAP_MS && Math.hypot(e.clientX-lastTapX,e.clientY-lastTapY)<TAP_SLOP_PX){
      lastTapT=-1e9; tapGlass(e.clientX,e.clientY); return;
    }
    lastTapT=now; lastTapX=e.clientX; lastTapY=e.clientY;
    const hit=fishCard.pick(e.clientX,e.clientY);
    if(hit) fishCard.show(hit,e.clientX,e.clientY);      // 点到鱼 → 识别
    else feedAt(feedPointFromScreen(e.clientX,e.clientY)); // 点到水 → 喂食
  });
}
document.getElementById('bFeed').addEventListener('click',()=>
  feedAt(new THREE.Vector3(rand(-1.1,1.1),TANK.waterY,rand(-0.38,0.38))));

/* ---------- 相机预设 ---------- */
const CAM_PRESETS=[
  { pos:[0,1.55,6.1],  tgt:[0,1.05,0]  },
  { pos:[5.6,1.4,2.1],tgt:[0,1.0,0]   },
  { pos:[0.0,4.7,3.2], tgt:[0,0.8,0]   },
  { pos:[1.3,1.0,3.0], tgt:[0.3,0.95,0] },
];
let camTween=null, camIdx=0;
function tweenCam(preset, dur=1.4){
  camTween={ from:camera.position.clone(), fromT:controls.target.clone(),
    to:new THREE.Vector3(...preset.pos), toT:new THREE.Vector3(...preset.tgt),
    t:0, dur };
}
controls.addEventListener('start',()=>{ camTween=null; });
document.getElementById('bCam').addEventListener('click',()=>{
  camIdx=(camIdx+1)%CAM_PRESETS.length;
  tweenCam(CAM_PRESETS[camIdx]);
});
tweenCam(CAM_PRESETS[0], 2.6);   // 开场运镜

/* ---------- 昼夜 ---------- */
const DAY={ spot:16, spotCol:new THREE.Color(0xfff2dc), hemi:0.35, fill:0.5, env:0.45,
  glow:new THREE.Color(0x2e8fb0), glowI:0.9, strip:2.8, bg:new THREE.Color(0x070b10),
  fog:new THREE.Color(0x0a2430), sky:new THREE.Color(0.45,0.62,0.72), deep:new THREE.Color(0.02,0.09,0.13) };
const NIGHT={ spot:3, spotCol:new THREE.Color(0x9fc4ff), hemi:0.07, fill:0.12, env:0.12,
  glow:new THREE.Color(0x3a6fa8), glowI:0.45, strip:0.5, bg:new THREE.Color(0x030509),
  fog:new THREE.Color(0x061420), sky:new THREE.Color(0.1,0.16,0.28), deep:new THREE.Color(0.005,0.03,0.06) };
let nightK=settings.night||0, nightTarget=settings.night||0;
applyNight(nightK);   // 启动即应用已保存的昼晚状态
const bLight=document.getElementById('bLight');
function syncLightButton(){              // 按钮显示"点击后会切到"的状态
  const night=nightTarget>0.5;
  bLight.classList.toggle('is-night',night);
  bLight.querySelector('span').textContent=night?'日间':'夜间';
  bLight.title=night?'切换到日光':'切换到月光';
}
syncLightButton();
bLight.addEventListener('click',()=>{
  settings.cycle=false; settingsPanel.set('cycle',false);   // 手动切换视为关闭自动循环
  nightTarget=nightTarget?0:1;
  settings.night=nightTarget; saveSettings();
  syncLightButton();
});

/* ---------- 帮助 ---------- */
const helpEl=document.getElementById('help');
document.getElementById('bHelp').addEventListener('click',()=>helpEl.hidden=false);
document.getElementById('helpClose').addEventListener('click',()=>helpEl.hidden=true);
helpEl.addEventListener('click',e=>{ if(e.target===helpEl) helpEl.hidden=true; });

/* ---------- 鱼类图鉴交互 ---------- */
const guideEl=document.getElementById('encyclopedia');
const openGuide=()=>{ guideEl.hidden=false; guideEl.setAttribute('aria-hidden','false'); requestAnimationFrame(renderEncyclopediaPreviews); };
const closeGuide=()=>{ guideEl.hidden=true; guideEl.setAttribute('aria-hidden','true'); };
document.getElementById('bGuide').addEventListener('click',openGuide);
document.getElementById('guideClose').addEventListener('click',closeGuide);
guideEl.addEventListener('click',e=>{ if(e.target===guideEl) closeGuide(); });
addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    if(!guideEl.hidden) closeGuide();
    hideFishCard();
    settingsPanel.close();
    if(photoMode) setPhotoMode(false);
  }
  if((e.key==='h'||e.key==='H') && !e.repeat && !(e.target instanceof HTMLInputElement)){
    if(!photoMode) setPhotoMode(true);
    else takePhoto();
  }
});

/* ---------- 设置弹层 ---------- */
const settingsPanel=createSettingsPanel({ settings, onChange:(key,on)=>{
  settings[key]=on;
  if(key==='sound'){ sound.setEnabled(on); if(on){ sound.ensure(); sound.blip(); } }
  if(key==='rays') rays.group.visible=on;
  if(key==='bubbles') bubbles.mesh.visible=on;
  if(key==='snow') snow.pts.visible=on;
  if(key==='caustics') setCausticsEnabled(on);
  saveSettings();
}});
addEventListener('pointerdown',()=>sound.ensure(),{ once:true });

/* ---------- 拍照模式（H 隐藏 UI · 再按 H 拍摄保存 · Esc 退出） ---------- */
let photoMode=false;
const photoTargets=['hud','dock','care','stats','hint'].map(id=>document.getElementById(id));
const photoTip=document.createElement('div');
photoTip.id='photoTip';
photoTip.textContent='拍照模式 · H 拍摄保存 · Esc 退出';
document.body.appendChild(photoTip);
function setPhotoMode(on){
  photoMode=on;
  photoTargets.forEach(el=>el.style.visibility=on?'hidden':'visible');
  photoTip.classList.toggle('on',on);
  if(on){ hideFishCard(); settingsPanel.close(); }
}
function takePhoto(){
  const w=innerWidth,h=innerHeight;
  const prevPR=renderer.getPixelRatio();
  const hi=Math.min(3,prevPR*2);
  renderer.setPixelRatio(hi); renderer.setSize(w,h,false);
  composer.setPixelRatio(hi); composer.setSize(w,h);
  composer.render();
  renderer.domElement.toBlob(blob=>{
    if(blob){
      const a=document.createElement('a');
      a.href=URL.createObjectURL(blob);
      a.download='aquarium-'+Date.now()+'.png';
      a.click();
      setTimeout(()=>URL.revokeObjectURL(a.href),3000);
    }
    renderer.setPixelRatio(prevPR); renderer.setSize(w,h,false);
    composer.setPixelRatio(prevPR); composer.setSize(w,h);
  });
}
/* ================================================================
 * 主循环
 * ================================================================ */
const clock=new THREE.Clock();
const statsEl=document.getElementById('stats');
let fpsFrames=0, fpsTime=0, totalFrames=0, qualityChecked=false, lowQuality=false;

function applyNight(k){
  hoodSpot.intensity=lerp(DAY.spot,NIGHT.spot,k);
  hoodSpot.color.lerpColors(DAY.spotCol,NIGHT.spotCol,k);
  hemi.intensity=lerp(DAY.hemi,NIGHT.hemi,k);
  fillLight.intensity=lerp(DAY.fill,NIGHT.fill,k);
  scene.environmentIntensity=lerp(DAY.env,NIGHT.env,k);
  waterGlow.color.lerpColors(DAY.glow,NIGHT.glow,k);
  waterGlow.intensity=lerp(DAY.glowI,NIGHT.glowI,k);
  scene.background.lerpColors(DAY.bg,NIGHT.bg,k);
  scene.fog.color.lerpColors(DAY.fog,NIGHT.fog,k);
  waterUniforms.uSky.value.lerpColors(DAY.sky,NIGHT.sky,k);
  waterUniforms.uDeep.value.lerpColors(DAY.deep,NIGHT.deep,k);
  rays.setNight(k);
  if(sandMat.userData.causticK) sandMat.userData.causticK.value=lerp(0.7,0.12,k);
  for(const s of schools){ if(s.causticK) s.causticK.value=lerp(0.22,0.06,k); }
  fishRim.k.value=lerp(0.42,0.22,k);                          // 鱼体逆光轮廓夜间减弱
  rim.intensity=lerp(0.35,0.15,k);
  stripMat.emissiveIntensity=lerp(DAY.strip,NIGHT.strip,k);   // 灯条夜间变暗
  floorGlowMat.opacity=lerp(1,0.45,k);                        // 地面漏光随缸内亮度变化
}

const onEat=(school,i)=>{ school.setGrowth(i, care.eat(school.spec.id,i)); sound.crunch(); };
const careFill=document.getElementById('careFill'), careText=document.getElementById('careText');
function updateCareHud(){                // 圆环 pathLength=100：dashoffset = 100 - 百分比
  careFill.style.strokeDashoffset=`${100-Math.round(care.satiety*100)}`;
  careText.textContent=care.status();
}

renderer.setAnimationLoop(()=>{
  const dt=Math.min(clock.getDelta(),0.05);
  U.time.value+=dt;
  const t=U.time.value;

  // 自动昼夜循环（180 秒完整周期）
  if(settings.cycle) nightTarget=(1-Math.cos(t*Math.PI*2/180))/2;

  // 昼夜过渡
  if(Math.abs(nightK-nightTarget)>1e-3){
    nightK+=(nightTarget-nightK)*Math.min(1,dt*1.6);
    applyNight(nightK);
  }

  // 相机运镜
  if(camTween){
    camTween.t+=dt;
    const k=Math.min(1,camTween.t/camTween.dur), e=1-Math.pow(1-k,3);
    camera.position.lerpVectors(camTween.from,camTween.to,e);
    controls.target.lerpVectors(camTween.fromT,camTween.toT,e);
    if(k>=1) camTween=null;
  }
  controls.update();

  // 兴奋度：有饲料 → 升到食欲上限（饿 → 疯抢，饱 → 懒散）
  care.update(dt);
  const appetite=care.appetite();
  const active=feeder.pellets;
  U.excite.value+=((active.length?appetite:0)-U.excite.value)*Math.min(1,dt*1.4);
  fear=Math.max(0,fear-dt/FEAR_SECS);
  // 夜间睡眠：喂食与惊吓都会把鱼叫醒
  const sleep=sstep(0.55,0.9,nightK)*(1-U.excite.value)*(1-fear);

  const ctx={ obstacles, pellets:active, feeder, excite:U.excite.value, time:t, schools,
    appetite, fear, sleep, onEat };
  for(const s of schools) s.update(dt,ctx);

  feeder.update(dt,t);
  bubbles.update(dt,t);
  sound.update(dt);
  snow.update(dt,t);
  ripples.update(dt);

  if(shake>0){                                  // 敲玻璃：镜头轻震（只影响本帧渲染）
    shake=Math.max(0,shake-dt);
    const a=0.012*shake/SHAKE_SECS;
    const ox=Math.sin(t*95)*a, oy=Math.cos(t*77)*a*0.6;
    camera.position.x+=ox; camera.position.y+=oy;
    composer.render();
    camera.position.x-=ox; camera.position.y-=oy;
  } else composer.render();

  // 首帧：隐藏加载层
  if(!window.__aqReady){
    window.__aqReady=true;
    const l=document.getElementById('loading');
    l.classList.add('done');
    setTimeout(()=>l.remove(),900);
  }

  // FPS / 自动降质
  fpsFrames++; fpsTime+=dt; totalFrames++;
  if(fpsTime>=0.5){
    const fps=Math.round(fpsFrames/fpsTime);
    statsEl.textContent=`${fps} FPS · ${FISH_TOTAL} 条鱼 · ${lowQuality?'流畅模式':'高清模式'} · v1.7`;
    fpsFrames=0; fpsTime=0;
    updateCareHud();
  }
  if(!qualityChecked && t>6){
    qualityChecked=true;
    if(totalFrames/t < 30){
      lowQuality=true;
      renderer.setPixelRatio(1);
      composer.setSize(innerWidth,innerHeight);
      const glass=[...tankGroup.children].filter(c=>c.material===glassHigh);
      for(const g of glass) g.material=glassLow;
      bloom.enabled=false;
    }
  }
});

addEventListener('resize',()=>{
  camera.aspect=innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight);
  composer.setSize(innerWidth,innerHeight);
});

// 调试钩子（供自动化测试使用）
window.__aqDebug={
  time:()=>U.time.value,
  pelletCount:()=>feeder.items.filter(it=>it&&!(it.eaten>0)).length,
  excite:()=>U.excite.value,
  night:()=>nightK,
  modelStatus:()=>modelPreviewStats(),
  pickAt:(x,y)=>{ const h=fishCard.pick(x,y); return h?{ id:h.school.spec.id, n:h.fid, glb:h.school.glbMode }:null; },
  satiety:()=>+care.satiety.toFixed(3),
  setSatiety:v=>{ care.satiety=v; updateCareHud(); },
  appetite:()=>+care.appetite().toFixed(3),
  fear:()=>fear,
  sleep:()=>+(sstep(0.55,0.9,nightK)*(1-U.excite.value)*(1-fear)).toFixed(3),
  tapGlass:(x,y)=>tapGlass(x,y),
  growthOf:(si,ii)=>({ target:+schools[si].growthTarget[ii].toFixed(3), now:+schools[si].growth[ii].toFixed(3) }),
  feed:()=>feedAt(new THREE.Vector3(rand(-1.1,1.1),TANK.waterY,rand(-0.38,0.38))),
  tpFish:(si,ii,x,y,z)=>{ const s=schools[si]; s.pos[ii].set(x,y,z); s.vel[ii].set(0.15,0,0);
    if(s.glbMode && s.fishes[ii]){ s.fishes[ii].position.copy(s.pos[ii]); } },
  posOf:(si,ii)=>schools[si].pos[ii].toArray(),
  restState:(si,ii)=>{ const r=schools[si].rest; return r?{on:r[ii].on,t:+r[ii].t.toFixed(1),dur:+r[ii].dur.toFixed(1)}:null; },
  velOf:(si,ii)=>schools[si].vel[ii].toArray().map(v=>+v.toFixed(3)),
  bloom:on=>{ bloom.enabled=on; },
  scene:()=>scene,
  hide:(what,on)=>{ if(what==="light") hoodSpot.visible=!on; if(what==="water") waterMesh.visible=!on; if(what==="glass") glassHigh.visible=!on; },
  restP:(si,ii)=>schools[si].rest?schools[si].rest[ii].p.toArray().map(v=>+v.toFixed(2)):null,
  snapTo:(si,ii)=>{ const p=schools[si].pos[ii];
    camera.position.set(p.x+0.55, p.y+0.14, p.z+0.75);
    controls.target.copy(p); camTween=null; },
  projectFish:(si,ii)=>{ const p=schools[si].pos[ii].clone(); p.project(camera);
    return { x:Math.round((p.x+1)/2*innerWidth), y:Math.round((1-p.y)/2*innerHeight) }; },
};
