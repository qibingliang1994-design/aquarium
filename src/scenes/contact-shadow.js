// @ts-check
import * as THREE from 'three';
import { ITEM_META } from './item-meta.js';

/* ================================================================
 * 物件接地暗斑（contact shadow）：阴影贴图只管正上方灯被挡住的部分，环境光/半球光在物件根部
 * 完全不受遮挡，岩石、沉木、水草看起来像"摆在沙上"。每个物件脚下贴一片径向渐变暗斑，
 * 网格按 sandHeight 起伏（自然水域的河床同一高度场），随物件移动/缩放重建顶点。
 * ================================================================ */

/** 不需要暗斑的类型：浮在水面 / 本身就是贴地的一层 */
const SKIP=new Set(['lily', 'carpet', 'pebbles']);
/** 暗斑半径 = 占地半径 × 缩放 × SPREAD；浓度按类型（实心岩石最深，细叶水草最浅） */
const SPREAD=1.35;
const STRENGTH={ stone:0.55, coral:0.42, plant:0.32, wet:0.3, gear:0.3 };
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
/** @type {Map<string, THREE.MeshBasicMaterial>} */
const MATS=new Map();
function matFor(/** @type {number} */ k){
  const key=k.toFixed(2);
  let m=MATS.get(key);
  if(!m){
    m=new THREE.MeshBasicMaterial({ color:0x000000, alphaMap:shadowTex(), transparent:true, opacity:k, depthWrite:false,
      polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2 });
    MATS.set(key, m);                 // 按浓度共享、永不释放（与物件材质同约定）
  }
  return m;
}

/** @param {THREE.Object3D} parent @param {(x:number,z:number)=>number} sandHeight */
export function createContactShadows(parent, sandHeight){
  const group=new THREE.Group();
  group.name='contact-shadows';
  group.renderOrder=-1;               // 先于水草等透明物画，避免把它们压暗
  parent.add(group);

  /** 物件放置/移动后调用 @param {{ type:string, x:number, z:number, s:number }} it @param {THREE.Mesh|null} mesh */
  function fit(it, mesh){
    const meta=ITEM_META[it.type];
    if(!meta || SKIP.has(it.type)){ if(mesh) remove(mesh); return null; }
    if(!mesh){
      const g=new THREE.PlaneGeometry(2,2,SEG,SEG).rotateX(-Math.PI/2);
      mesh=new THREE.Mesh(g, matFor(STRENGTH[/** @type {keyof typeof STRENGTH} */ (meta.group)] ?? 0.35));
      mesh.matrixAutoUpdate=false;
      group.add(mesh);
    }
    const R=meta.radius*it.s*SPREAD, p=mesh.geometry.attributes.position, uv=mesh.geometry.attributes.uv;
    for(let i=0;i<p.count;i++){
      const x=it.x+(uv.getX(i)*2-1)*R, z=it.z-(uv.getY(i)*2-1)*R;
      p.setXYZ(i, x, sandHeight(x,z)+0.004, z);   // 世界坐标：贴着沙面起伏
    }
    p.needsUpdate=true;
    mesh.geometry.computeBoundingSphere();
    return mesh;
  }
  function remove(/** @type {THREE.Mesh} */ mesh){ mesh.removeFromParent(); mesh.geometry.dispose(); }
  return { group, fit, remove };
}
