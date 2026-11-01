// @ts-check
import * as THREE from 'three';
import { ITEM_META } from './item-meta.js';

/* ================================================================
 * 物件接地暗斑（contact shadow）：阴影贴图只管正上方灯被挡住的部分，环境光/半球光在物件根部
 * 完全不受遮挡，岩石、沉木、水草看起来像"摆在沙上"。每个物件脚下贴一片径向渐变暗斑，
 * 网格按 sandHeight 起伏（自然水域的河床同一高度场），随物件移动/缩放重建顶点。
 * ================================================================ */

/** 不需要暗斑的类型：浮在水面 / 本身就是贴地的一层 */
const SKIP=new Set(['lily', 'carpet', 'pebbles', 'bankGrass']);
/** 暗斑半径 = 占地半径 × 缩放 × SPREAD；浓度按类型（实心岩石最深，细叶水草最浅） */
const SPREAD=1.35;
const STRENGTH={ stone:0.55, coral:0.42, plant:0.32, wet:0.3, gear:0.3, cn:0.5, shore:0.4 };
const SEG=12;                         // 网格细分：半径 1 左右时足够贴合沙面

let _tex=/** @type {THREE.Texture|null} */ (null);
function shadowTex(){
  if(_tex) return _tex;
  const s=128, cv=document.createElement('canvas'); cv.width=cv.height=s;
  const ctx=/** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
  // alphaMap 读的是绿色通道：黑底上画白色径向渐变（画成黑色+alpha 会整片透明）
  ctx.fillStyle='#000'; ctx.fillRect(0,0,s,s);
  const g=ctx.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);
  g.addColorStop(0,'#fff'); g.addColorStop(0.35,'rgb(190,190,190)');
  g.addColorStop(0.7,'rgb(64,64,64)'); g.addColorStop(1,'#000');
  ctx.fillStyle=g; ctx.fillRect(0,0,s,s);
  _tex=new THREE.CanvasTexture(cv);
  return _tex;
}
/** 全部暗斑共用一张网格 + 一个材质（浓度走顶点 alpha）：原来每个物件一次绘制，经典缸 ~25 次 → 1 次 */
const MAT=()=>new THREE.MeshBasicMaterial({ color:0x000000, vertexColors:true, alphaMap:shadowTex(), transparent:true, depthWrite:false,
  polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2 });
const NV=(SEG+1)*(SEG+1), NT=SEG*SEG*2;
/** 单个暗斑的 UV 与索引模板（所有槽位相同，索引按槽位平移） */
const TEMPLATE=(()=>{ const g=new THREE.PlaneGeometry(2,2,SEG,SEG); return { uv:g.attributes.uv.array, index:/** @type {any} */ (g.index).array }; })();

/** @typedef {{ slot:number, k:number, shown:boolean, visible:boolean }} ContactHandle */

/** @param {THREE.Object3D} parent @param {(x:number,z:number)=>number} sandHeight */
export function createContactShadows(parent, sandHeight){
  const group=new THREE.Group();
  group.name='contact-shadows';
  group.renderOrder=-1;               // 先于水草等透明物画，避免把它们压暗
  parent.add(group);
  const mat=MAT();
  /** @type {THREE.Mesh|null} */ let mesh=null;
  let cap=0, top=0;                   // 容量（槽位数）/ 已用最高槽位 + 1
  /** @type {number[]} */ const free=[];
  /** @type {ContactHandle[]} */ const slots=[];

  function grow(/** @type {number} */ n){          // 扩容：新建更大的几何，把旧数据拷过去
    const old=mesh?.geometry;
    const pos=new Float32Array(n*NV*3), uv=new Float32Array(n*NV*2), col=new Float32Array(n*NV*4), idx=new Uint32Array(n*NT*3);
    if(old){ pos.set(old.attributes.position.array); col.set(old.attributes.color.array); }
    for(let s=0;s<n;s++){
      uv.set(TEMPLATE.uv, s*NV*2);
      for(let j=0;j<NT*3;j++) idx[s*NT*3+j]=TEMPLATE.index[j]+s*NV;
    }
    const g=new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos,3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(uv,2));
    g.setAttribute('color', new THREE.BufferAttribute(col,4).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(new THREE.BufferAttribute(idx,1));
    g.boundingSphere=new THREE.Sphere(new THREE.Vector3(), 1e4);   // 世界坐标顶点：不做视锥裁剪
    if(mesh){ mesh.geometry.dispose(); mesh.geometry=g; }
    else { mesh=new THREE.Mesh(g, mat); mesh.frustumCulled=false; mesh.matrixAutoUpdate=false; group.add(mesh); }
    cap=n;
    mesh.geometry.setDrawRange(0, top*NT*3);
  }
  function setAlpha(/** @type {ContactHandle} */ h){
    const a=/** @type {THREE.BufferAttribute} */ (/** @type {THREE.Mesh} */ (mesh).geometry.attributes.color);
    const v=h.shown && h.visible ? h.k : 0;
    for(let i=0;i<NV;i++) a.setXYZW(h.slot*NV+i, 0, 0, 0, v);
    a.needsUpdate=true;
  }

  /** 物件放置/移动后调用；返回句柄（带 visible 开关）。不需要暗斑的类型返回 null @param {{ type:string, x:number, z:number, s:number }} it @param {ContactHandle|null} h */
  function fit(it, h){
    const meta=ITEM_META[it.type];
    if(!meta || SKIP.has(it.type)){ if(h) remove(h); return null; }
    if(!h){
      const slot=free.pop() ?? top++;
      if(slot>=cap) grow(Math.max(32, cap*2));
      h=/** @type {ContactHandle} */ ({ slot, k:0, shown:true, visible:true });
      slots[slot]=h;
      /** @type {THREE.Mesh} */ (mesh).geometry.setDrawRange(0, top*NT*3);
    }
    h.k=STRENGTH[/** @type {keyof typeof STRENGTH} */ (meta.group)] ?? 0.35;
    h.shown=true;
    const g=/** @type {THREE.Mesh} */ (mesh).geometry, p=g.attributes.position, uvA=g.attributes.uv;
    const R=meta.radius*it.s*SPREAD, base=h.slot*NV;
    for(let i=0;i<NV;i++){
      const x=it.x+(uvA.getX(base+i)*2-1)*R, z=it.z-(uvA.getY(base+i)*2-1)*R;
      p.setXYZ(base+i, x, sandHeight(x,z)+0.004, z);   // 世界坐标：贴着沙面起伏
    }
    p.needsUpdate=true;
    setAlpha(h);
    return h;
  }
  function remove(/** @type {ContactHandle} */ h){
    if(!mesh || slots[h.slot]!==h) return;
    h.shown=false; setAlpha(h);
    slots[h.slot]=/** @type {any} */ (undefined);
    free.push(h.slot);
  }
  /** 调试/岸边开关：句柄的 visible 改完后调用刷新 @param {ContactHandle} h @param {boolean} on */
  function setVisible(h, on){ h.visible=on; setAlpha(h); }
  return { group, fit, remove, setVisible };
}
