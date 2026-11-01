// @ts-check
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

/* ================================================================
 * 骨骼动画 → 位姿贴图（纯 three，不碰 DOM / WebGL，可在 Node 单测）
 * 把游动/冲刺/咬食三个片段按固定帧数离线采样成「骨骼 4×3 矩阵 × 帧」的小贴图；
 * 矩阵 = 骨骼世界矩阵 × 逆绑定 × bindMatrix，把网格局部的绑定姿态顶点直接变到"物种包裹节点之内"的蒙皮后位置。
 * 渲染端见 fish-vat.js（实例化蒙皮）。
 * ================================================================ */

const SWIM_FRAMES = 96, FAST_FRAMES = 96, BITE_FRAMES = 64;   // 采样密度：线性插值后肉眼无量化
const MAX_VERTS = 100000;                                     // 位姿贴图只存骨骼矩阵（与顶点数无关），锦鲤 3.2 万顶点也能走本路径

/** @typedef {{ row:number, frames:number, dur:number, loop:boolean }} ClipSlot */
/** @typedef {{ parts:{ name:string, geometry:THREE.BufferGeometry, material:any, pose:THREE.DataTexture }[],
 *   slots:{ swim:ClipSlot, fast:ClipSlot|null, bite:ClipSlot|null }, baseScale:number, sharedPose:boolean }} FishBake */

/** @type {WeakMap<object, FishBake|null>} */
const bakeCache = new WeakMap();

/**
 * 烘焙一个物种的骨骼位姿贴图（同一模板只做一次）。不适用时返回 null（无骨骼/无游动片段/网格过大）。
 * @param {THREE.Object3D} template @param {{ swim:any, fast:any, bite:any }} clips
 * @returns {FishBake|null}
 */
export function bakeFishPose(template, { swim, fast, bite }){
  if(bakeCache.has(template)) return bakeCache.get(template) ?? null;
  const res = doBake(template, { swim, fast, bite });
  bakeCache.set(template, res);
  return res;
}

/** @param {THREE.Object3D} template @param {{ swim:any, fast:any, bite:any }} clips @returns {FishBake|null} */
function doBake(template, { swim, fast, bite }){
  if(!swim) return null;
  const clone = SkeletonUtils.clone(template);
  clone.position.set(0, 0, 0); clone.quaternion.identity(); clone.scale.setScalar(1);   // 烘到"物种包裹节点之内"的坐标系
  /** @type {any[]} */ const meshes = [];
  clone.traverse((/** @type {any} */ o)=>{ if(o.isMesh) meshes.push(o); });
  if(!meshes.length || meshes.some(m=>!m.isSkinnedMesh || m.geometry.attributes.position.count>MAX_VERTS || Array.isArray(m.material))) return null;

  /** @type {ClipSlot} */ const sSwim = { row:0, frames:SWIM_FRAMES, dur:swim.duration, loop:true };
  let row = SWIM_FRAMES;
  /** @type {ClipSlot|null} */ const sFast = fast ? { row, frames:FAST_FRAMES, dur:fast.duration, loop:true } : null;
  if(sFast) row += FAST_FRAMES;
  /** @type {ClipSlot|null} */ const sBite = bite ? { row, frames:BITE_FRAMES, dur:bite.duration, loop:false } : null;
  if(sBite) row += BITE_FRAMES + 1;                     // 单次片段：末帧也要采样（不回绕）
  const rows = row;

  const mixer = new THREE.AnimationMixer(clone);
  const data = meshes.map(m=>new Float32Array(m.skeleton.bones.length * 4 * rows * 4));
  const _m = new THREE.Matrix4();
  /** @param {ClipSlot} slot @param {any} clip @param {number} n @param {boolean} inclusive */
  const sample = (slot, clip, n, inclusive)=>{
    mixer.stopAllAction();
    const act = mixer.clipAction(clip); act.play();
    for(let i=0;i<n+(inclusive?1:0);i++){
      mixer.setTime(i/n*slot.dur);
      clone.updateMatrixWorld(true);
      meshes.forEach((m, mi)=>{
        const sk = m.skeleton, nb = sk.bones.length, buf = data[mi], r = slot.row + i;
        for(let b=0;b<nb;b++){
          // 骨骼世界矩阵 × 逆绑定 × bindMatrix：把绑定姿态下的网格局部顶点直接变到"包裹节点内"的蒙皮后位置
          _m.multiplyMatrices(sk.bones[b].matrixWorld, sk.boneInverses[b]).multiply(m.bindMatrix);
          const e = _m.elements, o = (r*nb*4 + b*4) * 4;
          buf[o]=e[0];  buf[o+1]=e[1];  buf[o+2]=e[2];  buf[o+3]=0;
          buf[o+4]=e[4]; buf[o+5]=e[5]; buf[o+6]=e[6];  buf[o+7]=0;
          buf[o+8]=e[8]; buf[o+9]=e[9]; buf[o+10]=e[10]; buf[o+11]=0;
          buf[o+12]=e[12]; buf[o+13]=e[13]; buf[o+14]=e[14]; buf[o+15]=1;
        }
      });
    }
  };
  sample(sSwim, swim, SWIM_FRAMES, false);
  if(sFast) sample(sFast, fast, FAST_FRAMES, false);
  if(sBite) sample(sBite, bite, BITE_FRAMES, true);
  mixer.stopAllAction();

  // 同一物种的子网格通常共用骨骼与 bindMatrix → 位姿贴图逐元素相同：合成一张（省显存，也让阴影代理能合并成一次绘制）
  const same = data.every(d=>d.length===data[0].length && d.every((v, i)=>Math.abs(v-data[0][i])<1e-6));
  /** @param {Float32Array} d @param {number} nb */
  const tex = (d, nb)=>{
    const pose = new THREE.DataTexture(d, nb*4, rows, THREE.RGBAFormat, THREE.FloatType);
    pose.minFilter = pose.magFilter = THREE.NearestFilter; pose.generateMipmaps = false; pose.needsUpdate = true;
    return pose;
  };
  const shared = same ? tex(data[0], meshes[0].skeleton.bones.length) : null;
  const parts = meshes.map((m, mi)=>({ name:m.name, geometry:m.geometry, material:m.material,
    pose: shared ?? tex(data[mi], m.skeleton.bones.length) }));
  return { parts, slots:{ swim:sSwim, fast:sFast, bite:sBite }, baseScale:template.scale.x, sharedPose:same };
}


/** 逐实例动画属性的槽位：与 CPU 侧 School 约定一致 */
export const ANIM_T = 'aAnimT', ANIM_W = 'aAnimW';

/**
 * 自检（__aqDebug.vatCheck）：同一时刻/片段下，位姿贴图 CPU 重建的顶点位置 vs three 自带蒙皮的位置，返回最大误差（包裹节点坐标，除以体长）
 * @param {FishBake} bake @param {THREE.Object3D} template @param {any} clip @param {number} phase 0..1 @param {'swim'|'fast'|'bite'} [slotName]
 */
export function vatSelfCheck(bake, template, clip, phase, slotName='swim'){
  const clone = SkeletonUtils.clone(template);
  clone.position.set(0, 0, 0); clone.quaternion.identity(); clone.scale.setScalar(1);
  const mixer = new THREE.AnimationMixer(clone); mixer.clipAction(clip).play(); mixer.setTime(phase*clip.duration);
  clone.updateMatrixWorld(true);
  /** @type {any[]} */ const meshes = []; clone.traverse((/** @type {any} */ o)=>{ if(o.isSkinnedMesh) meshes.push(o); });
  const slot = /** @type {ClipSlot} */ (bake.slots[slotName]), v = new THREE.Vector3(), r = new THREE.Vector3(), m = new THREE.Matrix4();
  let worst = 0, extent = 1e-6;
  meshes.forEach((mesh, mi)=>{
    const part = bake.parts[mi], nb = mesh.skeleton.bones.length, data = /** @type {Float32Array} */ (part.pose.image.data);
    const f = phase*slot.frames, f0 = Math.floor(f), fr = f-f0, f1 = slot.loop ? (f0+1)%slot.frames : Math.min(f0+1, slot.frames);
    const pos = mesh.geometry.attributes.position, si = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight;
    for(let i=0;i<pos.count;i+=5){
      mesh.getVertexPosition(i, v); v.applyMatrix4(mesh.matrixWorld);            // three 蒙皮 → 包裹节点内
      r.set(0,0,0);
      for(let j=0;j<4;j++){
        const w = sw.getComponent(i,j); if(w<=0) continue;
        const b = si.getComponent(i,j);
        for(const [row, k] of [[slot.row+f0, 1-fr],[slot.row+f1, fr]]){
          const o = (row*nb*4 + b*4) * 4, e = m.elements;
          e[0]=data[o];e[1]=data[o+1];e[2]=data[o+2];e[3]=0;e[4]=data[o+4];e[5]=data[o+5];e[6]=data[o+6];e[7]=0;
          e[8]=data[o+8];e[9]=data[o+9];e[10]=data[o+10];e[11]=0;e[12]=data[o+12];e[13]=data[o+13];e[14]=data[o+14];e[15]=1;
          r.addScaledVector(_p.fromBufferAttribute(pos,i).applyMatrix4(m), w*k);
        }
      }
      worst = Math.max(worst, r.distanceTo(v)); extent = Math.max(extent, v.length());
    }
  });
  return { maxErr:worst, extent, rel:worst/extent };
}
const _p = new THREE.Vector3();
