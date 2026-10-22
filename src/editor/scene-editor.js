// @ts-check
import * as THREE from 'three';
import { clamp } from '../utils.js';
import { sandHeight } from '../scene/tank.js';
import { ITEM_META, placeLimits, MAX_ITEMS } from '../scenes/item-meta.js';
import { FISH_MAX, FISH_TOTAL_MAX, fishTotal, newId, cloneDoc } from '../scenes/scene-doc.js';
import { createHistory } from './history.js';
import { createEditorPanel } from './editor-panel.js';

/* ================================================================
 * 造景编辑器：在当前场景上直接编辑（所见即所得），保存才写入存档
 * - 点选物件 → 检视器；拖动物件在沙面平移（拖动空白处仍是转视角）
 * - 所有改动走 commit()：先记快照再改文档，再交给 runtime 差量应用
 * - 拖动/滑块这类连续操作只在开始时记一次快照，过程中走 runtime.moveItem 轻量更新
 * ================================================================ */

const PANEL_W=300, EDIT_PITCH=0.66;   // 左侧面板占位（px）、编辑俯角（弧度）
const FACING=new Set(['wood','coralFan']);
const ROT_STEP=Math.PI/12, SCALE_STEP=1.1, NUDGE=0.05, TAU=Math.PI*2;

/** @param {{ canvas:any, camera:any, controls:any, runtime:any, store:any, tweenCam:any, toast:any, captureThumb:any, onEnter:any, onExit:any }} opts */
export function createSceneEditor({ canvas, camera, controls, runtime, store, tweenCam, toast, captureThumb, onEnter, onExit }){
  /** @type {any} */ let doc=null;
  /** @type {string|null} */ let selId=null;
  /** @type {any} */ let prevCam=null;
  /** @type {boolean} */ let active=false;
  let savedJson='';
  /** @type {any} */ let drag=null;
  /** @type {any} */ let pendingTap=null;
  /** @type {string|null} */ let liveBefore=null;
  const hist=createHistory(60);
  const raycaster=new THREE.Raycaster(), ndc=new THREE.Vector2(), plane=new THREE.Plane(), hitP=new THREE.Vector3();

  /* ---------- 选中圈 ---------- */
  // 外圈描边 + 淡色底盘，不做深度测试（被物件挡住也看得见）
  const ringMat=new THREE.MeshBasicMaterial({ color:0x7fe6f5, transparent:true, opacity:0.9, depthTest:false, depthWrite:false, fog:false, toneMapped:false });
  const ring=new THREE.Mesh(new THREE.RingGeometry(0.86,1,64).rotateX(-Math.PI/2), ringMat);
  ring.add(new THREE.Mesh(new THREE.CircleGeometry(0.86,64).rotateX(-Math.PI/2),
    new THREE.MeshBasicMaterial({ color:0x5fd4e8, transparent:true, opacity:0.14, depthTest:false, depthWrite:false, fog:false })));
  ring.renderOrder=999; ring.children[0].renderOrder=998; ring.visible=false;
  runtime.itemsGroup.parent.add(ring);

  const snap=()=>JSON.stringify(doc);
  const selItem=()=>doc?.items.find((/** @type {any} */ it)=>it.id===selId) ?? null;

  function refresh(){
    panel.render(doc);
    panel.inspect(selItem());
    panel.setHistory(hist.canUndo, hist.canRedo);
    panel.setDirty(snap()!==savedJson);
    placeRing();
  }
  function placeRing(){
    const it=selItem();
    ring.visible=!!it;
    if(!it) return;
    const r=Math.max(0.12, ITEM_META[it.type].radius*it.s+0.05);
    ring.position.set(it.x, sandHeight(it.x,it.z)+0.012, it.z);
    ring.scale.setScalar(r);
  }
  /** 一次离散改动：记快照 → 改文档 → 应用 */
  function commit(/** @type {(d:any)=>void} */ mutate){
    const before=snap();
    mutate(doc);
    if(snap()===before) return;
    hist.push(before);
    runtime.apply(doc);
    refresh();
  }
  function select(/** @type {string|null} */ id){ selId=id; refresh(); }

  /* ---------- 连续改动（拖动 / 滑块） ---------- */
  function liveChange(/** @type {any} */ patch){
    const it=selItem();
    if(!it) return;
    liveBefore??=snap();
    Object.assign(it, patch);
    runtime.moveItem(it);                       // 先让运行时按新 rot/s 算出真实包络的钳制范围
    const lim=runtime.limitsOf(it.id);          // 再用同一套范围回钳文档：选中圈与视觉永远一致
    it.x=clamp(it.x,-lim.x,lim.x); it.z=clamp(it.z,-lim.z,lim.z);
    panel.inspect(it);
    placeRing();
  }
  function liveEnd(){
    if(liveBefore===null) return;
    if(liveBefore!==snap()) hist.push(liveBefore);
    liveBefore=null;
    refresh();
  }

  /* ---------- 物件操作 ---------- */
  function spawnPoint(/** @type {number} */ radius){
    // 在前中景找一个离现有物件最远的位置（12 次随机取最优）
    let best={ x:0, z:0.1 }, bestD=-1;
    for(let i=0;i<12;i++){
      const x=(Math.random()*2-1)*1.3, z=Math.random()*0.7-0.3;
      const d=Math.min(9, ...doc.items.map((/** @type {any} */ o)=>Math.hypot(o.x-x,o.z-z)-ITEM_META[o.type].radius*o.s-radius));
      if(d>bestD){ bestD=d; best={ x, z }; }
    }
    return best;
  }
  function addItem(/** @type {string} */ type){
    if(doc.items.length>=MAX_ITEMS){ toast(`物件最多 ${MAX_ITEMS} 件`); return; }
    const m=ITEM_META[type], p=spawnPoint(m.radius);
    // 沉木拱、海扇是"正面朝前"的片状物件：新放时只小幅偏转，避免侧对镜头像根棍子
    const facing=FACING.has(type), jitter=(Math.random()*2-1)*0.4;
    const rot=type==='airstone' ? 0 : facing ? (jitter+TAU)%TAU : Math.random()*TAU;
    const s=clamp(1,m.scale[0],m.scale[1]);
    const lim=placeLimits(type, s);   // 建形前先按占地半径钳；出厂后 place() 会按真实包络再收
    const it={ id:newId('it'), type, x:clamp(p.x,-lim.x,lim.x), z:clamp(p.z,-lim.z,lim.z), rot,
      s, seed:Math.floor(Math.random()*1e9) };
    commit(d=>d.items.push(it));
    select(it.id);
  }
  function duplicate(){
    const it=selItem();
    if(!it) return;
    if(doc.items.length>=MAX_ITEMS){ toast(`物件最多 ${MAX_ITEMS} 件`); return; }
    const lim=runtime.limitsOf(it.id);
    const copy={ ...it, id:newId('it'), seed:Math.floor(Math.random()*1e9),
      x:clamp(it.x+0.25,-lim.x,lim.x), z:clamp(it.z+0.08,-lim.z,lim.z) };
    commit(d=>d.items.push(copy));
    select(copy.id);
  }
  function remove(){
    if(!selId) return;
    const id=selId;
    selId=null;
    commit(d=>{ d.items=d.items.filter((/** @type {any} */ o)=>o.id!==id); });
  }
  const edit=(/** @type {(it:any)=>void} */ fn)=>{ if(selItem()) commit(()=>fn(selItem())); };
  const rotate=(/** @type {number} */ dir)=>edit(it=>{ it.rot=((it.rot+dir*ROT_STEP)%TAU+TAU)%TAU; });
  const rescale=(/** @type {number} */ k)=>edit(it=>{
    const r=ITEM_META[it.type].scale; it.s=+clamp(it.s*k,r[0],r[1]).toFixed(3);
    const lim=placeLimits(it.type, it.s);       // 放大后按占地半径回钳，别让包络探出玻璃
    it.x=clamp(it.x,-lim.x,lim.x); it.z=clamp(it.z,-lim.z,lim.z);
  });
  const nudge=(/** @type {number} */ dx,/** @type {number} */ dz)=>edit(it=>{
    const lim=runtime.limitsOf(it.id);
    it.x=clamp(it.x+dx,-lim.x,lim.x); it.z=clamp(it.z+dz,-lim.z,lim.z);
  });
  const reseed=()=>edit(it=>{ it.seed=Math.floor(Math.random()*1e9); });

  function setFish(/** @type {string} */ id, /** @type {number} */ delta){
    commit(d=>{
      const n=d.fish[id] ?? 0, room=FISH_TOTAL_MAX-fishTotal(d);
      d.fish[id]=clamp(n+Math.min(delta,room), 0, FISH_MAX[id]);
    });
  }
  function undoRedo(/** @type {boolean} */ redo){
    const s=redo ? hist.redo(snap()) : hist.undo(snap());
    if(s===null) return;
    doc=JSON.parse(s);
    if(!selItem()) selId=null;
    runtime.apply(doc);
    refresh();
  }

  const panel=createEditorPanel({
    onAdd:addItem,
    onName:(/** @type {string} */ v)=>commit(d=>{ d.name=v.trim().slice(0,16)||d.name; }),
    onUndo:()=>undoRedo(false), onRedo:()=>undoRedo(true),
    onSave:()=>exit(true), onCancel:()=>exit(false),
    onFish:setFish,
    onTheme:(/** @type {string} */ id)=>commit(d=>{ d.theme=id; }),
    onTank:(/** @type {string} */ id)=>commit(d=>{ d.tank=id; }),
    onTransform:liveChange, onTransformEnd:liveEnd,
    onSeed:reseed, onDup:duplicate, onDel:remove,
  });

  /* ---------- 指针：点选 / 拖动 ---------- */
  function rayFrom(/** @type {any} */ e){
    ndc.set((e.clientX/innerWidth)*2-1, -(e.clientY/innerHeight)*2+1);
    raycaster.setFromCamera(ndc, camera);
  }
  function pickItem(/** @type {any} */ e){
    rayFrom(e);
    const hit=raycaster.intersectObjects(runtime.itemsGroup.children, true)[0];
    for(let o=/** @type {any} */ (hit?.object); o; o=o.parent) if(o.userData.itemId) return o.userData.itemId;
    return null;
  }
  // 捕获阶段注册：先于 OrbitControls 处理，点中物件时禁用视角拖拽
  canvas.addEventListener('pointerdown',(/** @type {any} */ e)=>{
    if(!active || e.button!==0) return;
    const id=pickItem(e);
    pendingTap={ x:e.clientX, y:e.clientY, id };
    if(!id) return;
    select(id);
    const it=selItem();
    plane.set(new THREE.Vector3(0,1,0), -sandHeight(it.x,it.z));
    if(!raycaster.ray.intersectPlane(plane, hitP)) return;
    drag={ dx:it.x-hitP.x, dz:it.z-hitP.z, pointer:e.pointerId };
    controls.enabled=false;
    canvas.setPointerCapture(e.pointerId);
    e.stopImmediatePropagation();
  }, { capture:true });
  canvas.addEventListener('pointermove',(/** @type {any} */ e)=>{
    if(!active) return;
    if(!drag){ canvas.style.cursor=pickItem(e) ? 'pointer' : ''; return; }
    rayFrom(e);
    if(!raycaster.ray.intersectPlane(plane, hitP)) return;
    const it=selItem();
    if(!it) return;
    const lim=runtime.limitsOf(it.id);   // 拖不出玻璃：按真实包络钳住中心点
    liveChange({ x:clamp(hitP.x+drag.dx,-lim.x,lim.x), z:clamp(hitP.z+drag.dz,-lim.z,lim.z) });
    canvas.style.cursor='grabbing';
  });
  const endPointer=(/** @type {any} */ e)=>{
    if(!active) return;
    if(drag){
      canvas.releasePointerCapture?.(drag.pointer);
      drag=null; controls.enabled=true; canvas.style.cursor='';
      liveEnd();
    } else if(pendingTap && Math.hypot(e.clientX-pendingTap.x, e.clientY-pendingTap.y)<6 && !pendingTap.id){
      select(null);                              // 点空白处 → 取消选中
    }
    pendingTap=null;
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  /* ---------- 键盘 ---------- */
  addEventListener('keydown',e=>{
    if(!active) return;
    const typing=e.target instanceof HTMLInputElement && e.target.type!=='range';
    const mod=e.ctrlKey||e.metaKey, k=e.key.toLowerCase();
    if(mod && k==='z'){ e.preventDefault(); undoRedo(e.shiftKey); return; }
    if(mod && k==='y'){ e.preventDefault(); undoRedo(true); return; }
    if(mod && k==='s'){ e.preventDefault(); exit(true); return; }
    if(typing || mod) return;
    /** @type {Record<string, ()=>void>} */
    const acts={
      delete:remove, backspace:remove, q:()=>rotate(-1), e:()=>rotate(1),
      '-':()=>rescale(1/SCALE_STEP), '_':()=>rescale(1/SCALE_STEP), '=':()=>rescale(SCALE_STEP), '+':()=>rescale(SCALE_STEP),
      d:duplicate, r:reseed,
      arrowleft:()=>nudge(-NUDGE,0), arrowright:()=>nudge(NUDGE,0), arrowup:()=>nudge(0,-NUDGE), arrowdown:()=>nudge(0,NUDGE),
      escape:()=>{ if(selId) select(null); },
    };
    if(acts[k]){ e.preventDefault(); acts[k](); }
  });

  // 有未保存的造景（含拖动中）时刷新/关页先确认：造景动辄十几分钟，误关就全丢了
  addEventListener('beforeunload',e=>{
    if(!active || (liveBefore===null && snap()===savedJson)) return;
    e.preventDefault();
    e.returnValue='';
  });

  /* ---------- 进入 / 退出 ---------- */
  // 俯视机位：让整缸落在面板右侧的可视区内（窄屏面板在底部，不偏移）
  function editCam(){
    const side=innerWidth>760, free=side ? (innerWidth-PANEL_W)/innerWidth : 1;
    const tanH=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
    const dist=Math.max(4.4, 3.05/(tanH*camera.aspect*free), 1.5/tanH);   // 前缘离相机更近、透视下更宽，留足余量
    const shift=side ? (PANEL_W/innerWidth)*dist*tanH*camera.aspect : 0;
    return { pos:[-shift, 0.5+dist*Math.sin(EDIT_PITCH), dist*Math.cos(EDIT_PITCH)], tgt:[-shift, 0.5, 0] };
  }
  function enter(){
    if(active) return;
    active=true;
    doc=cloneDoc(runtime.doc);
    savedJson=snap();
    hist.clear(); selId=null; liveBefore=null;
    prevCam={ pos:camera.position.toArray(), tgt:controls.target.toArray() };
    tweenCam(editCam(), 1.1);
    document.body.classList.add('is-editing');
    panel.show(true);
    refresh();
    onEnter?.();
  }
  function exit(/** @type {boolean} */ save){
    if(!active) return;
    let saved=null;
    if(save){
      try{
        saved=store.save(doc);
        runtime.apply(saved);
      }catch(err){
        console.warn('[editor] 保存失败', err);
        toast(err instanceof Error ? err.message : '保存失败');
        return;
      }
    } else runtime.apply(store.get(doc.id) ?? doc);
    active=false; selId=null; drag=null; controls.enabled=true;
    ring.visible=false;
    panel.show(false);
    document.body.classList.remove('is-editing');
    onExit?.(saved);                             // 先恢复观赏状态（水面等），缩略图才是正常样子
    if(saved){
      const shot=captureThumb(); if(shot) store.setThumb(saved.id, shot);
      toast(store.readOnly ? `已应用「${saved.name}」（此窗口只读，不会保存）` : `已保存「${saved.name}」`);
    }
    if(prevCam) tweenCam(prevCam, 1.1);
  }

  return {
    get active(){ return active; },
    enter, exit,
    /** 选中圈呼吸 */
    update(/** @type {number} */ t){ if(ring.visible) ringMat.opacity=0.72+0.25*Math.sin(t*4); },
    // 自动化测试用
    debug:{ get doc(){ return doc; }, select, addItem, remove, rotate, rescale, nudge, setFish, undo:()=>undoRedo(false), redo:()=>undoRedo(true),
      get selected(){ return selId; } },
  };
}
