// @ts-check
import * as THREE from 'three';

/* ================================================================
 * 物件的真实俯视轮廓与摆放范围（纯几何，Node 可测）
 * 原来按局部包围盒 × 转角的绝对值估外沿（偏大），再给石头乘 0.85 往回找补（偏小），
 * 两头都不准：长条沉木的侧枝、苔团的凸角会探出玻璃。现在：
 *  - build 时把物件所有顶点（含 InstancedMesh 每个实例）投到 xz，取 K 个方向上的最远点
 *    （支撑点），相当于俯视凸包的 K 边近似，之后任意转角的外沿都从这几十个点里取
 *  - 中心点范围按四个方向分别算（物件往一侧伸得多，就只在那一侧让开），不再对称
 * ================================================================ */

const K=48;                                       // 支撑方向数：两方向间最多低估 r·(1−cos(π/K)) ≈ 0.2%
const DIRS=Array.from({ length:K }, (_, i)=>[Math.cos(i/K*Math.PI*2), Math.sin(i/K*Math.PI*2)]);
const _m=new THREE.Matrix4(), _v=new THREE.Vector3();

/** 物件局部（未变换的根）下所有顶点的俯视支撑点 @param {THREE.Object3D} object @returns {number[]} 交错的 x,z */
export function footprintOf(object){
  const best=new Float64Array(K).fill(-Infinity), pts=new Float64Array(K*2);
  const take=(/** @type {number} */ x, /** @type {number} */ z)=>{
    for(let k=0;k<K;k++){
      const d=x*DIRS[k][0]+z*DIRS[k][1];
      if(d>best[k]){ best[k]=d; pts[k*2]=x; pts[k*2+1]=z; }
    }
  };
  object.updateMatrixWorld(true);
  object.traverse((/** @type {any} */ o)=>{
    const p=o.geometry?.attributes?.position;
    if(!p || o.isBatchedMesh) return;
    const n=o.isInstancedMesh ? o.count : 1;
    for(let i=0;i<n;i++){
      if(o.isInstancedMesh){ o.getMatrixAt(i, _m); _m.premultiply(o.matrixWorld); }
      else _m.copy(o.matrixWorld);
      for(let j=0;j<p.count;j++){ _v.fromBufferAttribute(p, j).applyMatrix4(_m); take(_v.x, _v.z); }
    }
  });
  const out=[];
  for(let k=0;k<K;k++) if(best[k]>-Infinity) out.push(pts[k*2], pts[k*2+1]);
  return out.length ? out : [0, 0];
}

/** 转角 rot、缩放 s 后，轮廓相对中心点在世界 x / z 上伸出的范围（与 scene-runtime 的根变换一致：先缩放再绕 y 转）
 * @param {number[]} fp footprintOf 的结果 @param {number} rot @param {number} s */
export function reachOf(fp, rot, s){
  const c=Math.cos(rot), sn=Math.sin(rot);
  let x0=Infinity, x1=-Infinity, z0=Infinity, z1=-Infinity;
  for(let i=0;i<fp.length;i+=2){
    const x=(fp[i]*c+fp[i+1]*sn)*s, z=(-fp[i]*sn+fp[i+1]*c)*s;
    if(x<x0) x0=x; if(x>x1) x1=x; if(z<z0) z0=z; if(z>z1) z1=z;
  }
  return { x0, x1, z0, z1 };
}

/** @typedef {{ x0:number, x1:number, z0:number, z1:number }} Range 中心点允许的 x / z 区间 */

/**
 * 中心点允许范围：轮廓贴着玻璃内壁（留 margin），再夹进摆放框；物件比缸还宽时放在正中
 * @param {{x0:number,x1:number,z0:number,z1:number}} reach @param {{x:number,z:number}} glass @param {{x:number,z:number}} place
 * @param {number} [margin] @returns {Range}
 */
export function rangeIn(reach, glass, place, margin=0.01){
  const axis=(/** @type {number} */ lo, /** @type {number} */ hi, /** @type {number} */ g, /** @type {number} */ p)=>{
    let a=Math.max(-p, -g+margin-lo), b=Math.min(p, g-margin-hi);
    if(a>b){ const m=Math.max(-p, Math.min(p, (-g-lo+g-hi)/2)); a=m; b=m; }   // 放不下：两侧探出一样多
    return [a, b];
  };
  const [x0, x1]=axis(reach.x0, reach.x1, glass.x, place.x), [z0, z1]=axis(reach.z0, reach.z1, glass.z, place.z);
  return { x0, x1, z0, z1 };
}

/** 对称半宽 → 区间（水草、岸边物件仍按旧的对称估算） @param {{x:number,z:number}} h @returns {Range} */
export const symRange=h=>({ x0:-h.x, x1:h.x, z0:-h.z, z1:h.z });

/** 把点钳进区间 @param {Range} r @param {number} x @param {number} z */
export const clampTo=(r, x, z)=>({ x:Math.max(r.x0, Math.min(r.x1, x)), z:Math.max(r.z0, Math.min(r.z1, z)) });
