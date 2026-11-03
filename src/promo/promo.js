// @ts-check
/* ================================================================
 * 宣传片导演模式（?promo=1 才激活，正常启动零开销）
 * 原理（"代码即视频"）：
 *  1) 把 clock.getDelta() 钉成固定步长 —— 模拟时间与墙钟解耦，每帧可复现；
 *  2) 停掉 three 的动画循环，由这里逐帧调 frame()（主循环原函数）；
 *  3) 每帧把 WebGL 画面 + 2D 文字层合成到离屏画布，写一张 PNG；
 *  4) 分镜同时记下声音事件（落石/长草/放鱼…），录完推 events.json，
 *     scripts/promo-audio.mjs 按同一张节拍表合成配乐 + 音效，promo-encode.mjs 混流出 mp4。
 * 分镜在 story.js（第 1 天 → 第 30 天 造缸延时），文字层在 overlay.js，节拍表在 timeline.js。
 * window.__promo：start(n?) 录制 / stop() / seek(t) 预览某时刻 / snap(t) 取合成帧 dataURL
 * ================================================================ */
import { FPS, BEAT, SEC } from './timeline.js';
import { createStory } from './story.js';
import { createOverlay } from './overlay.js';

const DT=1/FPS;
const W=1080, H=1920;                   // 竖屏成片分辨率（画布即此尺寸，网页里等比缩放显示）
const SCENE='iwagumi';                  // 造的是 ADA 岩组缸
const PNG=('showDirectoryPicker' in window);
const PUSH=new URLSearchParams(location.search).get('push');   // ?push=http://127.0.0.1:8124：帧推本地服务，全自动出片

/** @param {{ clock:any, renderer:any, composer:any, camera:any, controls:any, photo:any, settings:any, quality:any }} d */
export function createPromo({ clock, renderer, composer, camera, controls, photo, settings, quality }){
  if(!new URLSearchParams(location.search).has('promo')) return {};
  const dbg=()=>/** @type {any} */ (window).__aqDebug;

  /** @type {any[]} */ let events=[];
  let nowT=0;
  const story=createStory({ ev:e=>events.push({ at:nowT, ...e }) });

  /* ---------- 状态 ---------- */
  let active=false, abort=false, prevAspect=0;
  /** @type {any} */ let prevGetDelta=null;
  /** @type {any} */ let prevQualityMode=null;
  /** @type {FileSystemDirectoryHandle|null} */ let outDir=null;

  /* ---------- 舞台：画布固定 1080×1920，网页里等比缩放居中 ---------- */
  function setStage(){
    renderer.setPixelRatio(1); renderer.setSize(W,H,false);
    composer.setPixelRatio(1); composer.setSize(W,H);
    camera.aspect=W/H; camera.updateProjectionMatrix();
    const c=renderer.domElement, s=Math.min(innerWidth/W, innerHeight/H);
    Object.assign(c.style,{ position:'fixed', left:'50%', top:'50%', width:W+'px', height:H+'px',
      transform:`translate(-50%,-50%) scale(${s})`, transformOrigin:'center', zIndex:5 });
  }
  addEventListener('resize', ()=>{ if(active) setStage(); });

  /* ---------- 离屏合成：WebGL 帧 + 文字层 ---------- */
  const comp=document.createElement('canvas'); comp.width=W; comp.height=H;
  const c2=/** @type {CanvasRenderingContext2D} */ (comp.getContext('2d'));
  const overlay=createOverlay(c2, W, H);
  function compose(/** @type {number} */ b){
    c2.drawImage(renderer.domElement, 0, 0, W, H);                       // 必须与渲染同一个 JS 任务里读，否则黑帧
    overlay.draw(b, story.day(b), story.label(b));
  }

  /* ---------- 逐帧导出 ---------- */
  const toBlob=(/** @type {HTMLCanvasElement} */ cv)=>new Promise((/** @type {any} */ res,/** @type {any} */ rej)=>
    cv.toBlob((/** @type {Blob|null} */ b)=>b?res(b):rej(new Error('toBlob 失败')), 'image/png'));
  async function post(/** @type {string} */ path, /** @type {Blob|string} */ body){
    for(let n=0;;n++){                                                   // 本地服务偶发断连：重试几次再认输
      try{
        const r=await fetch(PUSH+path, { method:'POST', body });
        if(r.ok) return;
        throw new Error('推送失败：'+r.status);
      } catch(err){ if(n>=4) throw err; await new Promise(res=>setTimeout(res, 400*(n+1))); }
    }
  }
  async function writeFile(/** @type {string} */ name, /** @type {Blob} */ blob){
    if(outDir){
      const fh=await outDir.getFileHandle(name, { create:true });
      const ws=await fh.createWritable(); await ws.write(blob); await ws.close();
    } else {
      const a=document.createElement('a');                               // 兜底：无目录授权时下载（整片别用，浏览器会拦批量下载）
      a.href=URL.createObjectURL(blob); a.download=name; a.click();
      setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
    }
  }
  async function writeFrame(/** @type {number} */ i, /** @type {Blob} */ blob){
    if(PUSH) return post('/frame?i='+i, blob);
    return writeFile(`f_${String(i).padStart(6,'0')}.png`, blob);
  }
  async function writeEvents(){
    const json=JSON.stringify({ fps:FPS, beat:BEAT, events }, null, 1);
    if(PUSH) return post('/events', json);
    return writeFile('events.json', new Blob([json], { type:'application/json' }));
  }

  /* ---------- 覆盖层（DOM，不进画面） ---------- */
  const ov=document.createElement('div');
  ov.style.cssText='position:fixed;left:12px;top:12px;z-index:60;background:rgba(8,20,26,.82);color:#dff3ee;'
    +'font:13px/1.6 system-ui,sans-serif;padding:10px 14px;border-radius:10px;max-width:320px;white-space:pre-wrap';
  const mkBtn=(/** @type {string} */ label)=>{ const b=document.createElement('button');
    b.textContent=label; b.style.cssText='margin-left:8px;padding:2px 10px;cursor:pointer'; return b; };
  const bRun=mkBtn('开始录制'), bStop=mkBtn('停止');
  bStop.style.display='none';
  ov.append('宣传片导演模式\n', bRun, bStop);
  document.body.appendChild(ov);
  const say=(/** @type {string} */ m)=>{ (/** @type {HTMLElement} */ (ov.firstChild)).textContent=m+'\n'; };

  /* ---------- 摄影机：关键帧缓动 + 手持呼吸 + 落石震动 + 可选跟拍 ---------- */
  const lerp=(/** @type {number} */ a,/** @type {number} */ b,/** @type {number} */ k)=>a+(b-a)*k;
  const followPos=new Float32Array(3); let followShot=-1;
  function followTarget(/** @type {string} */ id, /** @type {number} */ shotIndex){
    const d=dbg(), ids=d.schoolIds(), si=ids.findIndex((/** @type {string} */ x)=>x.startsWith(id+':'));
    if(si<0) return null;
    const n=Number(ids[si].split(':')[1]) || 1, p=[0,0,0];             // 跟鱼群的重心，不赌某一条鱼游到哪个角落
    for(let i=0;i<n;i++){ const q=d.posOf(si,i); p[0]+=q[0]/n; p[1]+=q[1]/n; p[2]+=q[2]/n; }
    p[0]=Math.max(-1.25, Math.min(1.25, p[0])); p[1]=Math.max(0.8, Math.min(1.55, p[1])); p[2]=Math.max(-0.35, Math.min(0.35, p[2]));
    const a=1-Math.exp(-DT*2.2);                                         // 指数平滑：镜头有"追"的惯性
    if(followShot!==shotIndex){ followPos.set(p); followShot=shotIndex; } else for(let i=0;i<3;i++) followPos[i]+=(p[i]-followPos[i])*a;
    return followPos;
  }
  function camAt(/** @type {number} */ t){
    const { cam, k, index }=story.shotAt(t/BEAT), f=cam.from, to=cam.to;
    const e=k*k*(3-2*k)*0.55+k*0.45;                                     // 起止都不死停
    const m=cam.sway ?? 1;
    const sx=(Math.sin(t*1.3)*0.6+Math.sin(t*2.9+1)*0.3+Math.sin(t*0.5)*0.8)*0.010*m;
    const sy=(Math.cos(t*1.1+2)*0.6+Math.sin(t*3.4)*0.25+Math.cos(t*0.6)*0.8)*0.008*m+story.shake(t);
    let px=lerp(f.pos[0],to.pos[0],e)+sx, py=lerp(f.pos[1],to.pos[1],e)+sy;
    const pz=lerp(f.pos[2],to.pos[2],e);
    let tx=lerp(f.tgt[0],to.tgt[0],e), ty=lerp(f.tgt[1],to.tgt[1],e), tz=lerp(f.tgt[2],to.tgt[2],e);
    if(cam.follow){ const p=followTarget(cam.follow, index), w=cam.hold ?? 0.7;
      if(p){ const dx=(p[0]-tx)*w, dy=(p[1]-ty)*w;                   // 注视点被鱼群牵走，机位也跟着平移（像摄影师端着机器追）
        tx+=dx; ty+=dy; tz=lerp(tz,p[2],w); px+=dx*0.8; py+=dy*0.6; } }
    camera.position.set(px, py, pz);
    controls.target.set(tx+sx*0.4, ty+sy*0.4, tz);
    const fov=lerp(f.fov ?? 47, to.fov ?? f.fov ?? 47, e);
    if(camera.fov!==fov){ camera.fov=fov; camera.updateProjectionMatrix(); }
  }

  /* ---------- 场景准备：切到岩组缸并跑几秒（水清、鱼散开、着色器编完） ---------- */
  const tick0=()=>new Promise((/** @type {any} */ r)=>setTimeout(r,0));
  async function ready(){
    const d=dbg();
    if(d.sceneId()!==SCENE){ d.switchScene(SCENE); for(let i=0;i<400 && d.sceneId()!==SCENE; i++) await tick0(); await tick0(); }
    d.setWeather?.('sunny', 0); d.setNight(0); d.play(false);
    for(let i=0;i<120;i++){ d.loopFrame(); await tick0(); }
  }

  /* ---------- 主流程 ---------- */
  async function run(/** @type {number} */ maxFrames=Infinity){
    if(active) return;
    const d=dbg(); if(!d){ say('主循环未就绪'); return; }
    active=true; abort=false; events=[]; followShot=-1;
    prevGetDelta=clock.getDelta.bind(clock);
    prevQualityMode=settings.qualityMode;
    prevAspect=camera.aspect;
    settings.qualityMode=6; quality.force(0);                            // 锁高清 + 关自动降档
    photo.set(true);                                                     // 藏 HUD
    controls.enabled=false;
    setStage();
    outDir=null;
    if(!PUSH && PNG){
      try{ outDir=await (/** @type {any} */ (window)).showDirectoryPicker({ mode:'readwrite' }); }
      catch{ say('未选目录：帧将分批下载到"下载"文件夹'); }
    }
    bRun.style.display='none'; bStop.style.display='';
    clock.getDelta=()=>DT;                                               // ★ 确定性时钟
    renderer.setAnimationLoop(null);
    try{
      say('准备岩组缸…');
      await ready();
      story.plan(d.docOf());
      const total=Math.round(SEC.end*BEAT*FPS);
      const t0=performance.now();
      let fi=0;
      for(; fi<total && fi<maxFrames && !abort; fi++){
        const t=fi/FPS; nowT=t;
        d.stopCamTween();                                                // 切景/应用文档可能触发开场运镜，每帧掐掉
        story.frame(t, d);
        camAt(t);
        d.loopFrame();                                                   // 一整帧：模拟 + 渲染（dt 恒为 1/30）
        compose(t/BEAT);
        await writeFrame(fi, await toBlob(comp));
        if(fi%30===0) say(`录制中 ${fi}/${total} 帧 · ${t.toFixed(1)}s · 用时 ${Math.round((performance.now()-t0)/1000)}s`);
      }
      await writeEvents();
      const where=PUSH ? '已推送到本地接收服务' : outDir ? '已写入所选目录' : '已尝试下载';
      say(abort ? `已在 ${fi} 帧停止` : `完成：${fi} 帧（${(fi/FPS).toFixed(1)}s）\n${where}\n下一步：node scripts/promo-audio.mjs → promo-encode.mjs`);
    } catch(err){ say('录制失败：'+((/** @type {any} */ (err))?.message ?? err)); console.error('[promo]', err); }
    restore();
  }
  function restore(){
    const d=dbg();
    clock.getDelta=prevGetDelta;
    settings.qualityMode=prevQualityMode;                                // 不落盘
    if(d){
      if(story.full) d.applyDoc(story.full);                              // 搭到一半停下也还原成品缸
      d.setBatching(true); d.setNight(0); d.restartLoop();
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.setSize(innerWidth,innerHeight,false);
    composer.setPixelRatio(Math.min(devicePixelRatio,2)); composer.setSize(innerWidth,innerHeight);
    camera.aspect=prevAspect || innerWidth/innerHeight; camera.updateProjectionMatrix();
    const c=renderer.domElement;
    Object.assign(c.style,{ position:'', left:'', top:'', width:'', height:'', transform:'', zIndex:'' });
    photo.set(false); controls.enabled=true;
    bRun.style.display=''; bStop.style.display='none';
    active=false;
  }

  /* ---------- 预览：seek(t) 从头确定性快进到第 t 秒（不写盘），造缸状态与导出一致 ---------- */
  async function seek(/** @type {number} */ tSec){
    const d=dbg(); if(!d || active) return;
    active=true;
    prevGetDelta=clock.getDelta.bind(clock); prevQualityMode=settings.qualityMode; prevAspect=camera.aspect;
    setStage(); photo.set(true); controls.enabled=false;
    clock.getDelta=()=>DT; renderer.setAnimationLoop(null);
    events=[]; followShot=-1;
    try{
      await ready();
      story.plan(d.docOf());
      const n=Math.round(tSec*FPS);
      for(let fi=0; fi<=n; fi++){
        const t=fi/FPS; nowT=t;
        d.stopCamTween(); story.frame(t, d); camAt(t);
        d.loopFrame();
        if(fi===n) compose(t/BEAT);
        else if(fi%20===0) await tick0();
      }
    } finally {
      clock.getDelta=prevGetDelta; settings.qualityMode=prevQualityMode;
      active=false;                                                      // 舞台保留，方便看 snap；restore() 才复原
    }
  }
  /** snap(t)：快进到第 t 秒并返回合成帧 dataURL（与导出同源） */
  async function snap(/** @type {number} */ tSec){ await seek(tSec); const u=comp.toDataURL('image/jpeg', 0.86); restore(); return u; }

  bRun.addEventListener('click', ()=>run());
  bStop.addEventListener('click', ()=>{ abort=true; });
  /** @type {any} */ (window).__promo={ start:(/** @type {number} */ n)=>run(n), stop:()=>{ abort=true; }, seek, snap, restore,
    events:()=>events, length:()=>SEC.end*BEAT };
  return {};
}
