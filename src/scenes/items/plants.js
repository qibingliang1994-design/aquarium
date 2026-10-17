import * as THREE from 'three';
import { rrange } from '../../utils.js';
import { shared, injectSway, makeBladeX, UP } from './common.js';

/* ================================================================
 * 水草丛：一丛 = 一个 InstancedMesh（几何每丛克隆一份以挂 aPhase）
 * 局部坐标：原点在丛心沙面，叶片根部略埋入沙
 * ================================================================ */

// blade: [宽, 高, 根色, 梢色, 弯曲]；n 株数；spread 丛的半宽/半深；h 株高倍率区间
const PLANTS = {
  kelp:     { blade:[0.08,1.15,0x123c1c,0x4f9c3a,0.16], n:14, spread:[0.22,0.15], h:[0.8,1.45] },
  bush:     { blade:[0.17,0.6,0x0f3016,0x3b7a2c,0.22],  n:10, spread:[0.22,0.14], h:[0.58,1.0], tint:[0.95,1.05,0.9] },
  crown:    { blade:[0.15,1.4,0x0e3520,0x59a845,0.1],   n:7,  spread:[0.14,0.1],  h:[0.33,0.75] },
  red:      { blade:[0.035,0.55,0x4a1a14,0xc4503a,0.09],n:6,  spread:[0.1,0.12],  h:[0.12,0.45] },
  carpet:   { blade:[0.022,0.14,0x1c4a24,0x5da23e,0.04],n:7,  spread:[0.3,0.12],  h:[0.4,0.78] },
  seagrass: { blade:[0.022,0.9,0x1d4a2a,0x7fae4a,0.2],  n:16, spread:[0.16,0.1],  h:[0.5,1.0], tint:[1,1.02,0.92] },
};
export const PLANT_TYPES = Object.keys(PLANTS);

const baseGeo = type => shared(`geo:${type}`, ()=>makeBladeX(...PLANTS[type].blade));
const bladeMat = () => shared('mat:blade', ()=>{
  const m=new THREE.MeshPhysicalMaterial({vertexColors:true, roughness:0.55, metalness:0, side:THREE.DoubleSide,
    sheen:0.6, sheenRoughness:0.45, sheenColor:new THREE.Color(0xb8f08a), specularIntensity:0.5});
  injectSway(m, 0.1, 2.1, 'blade', true);
  return m;
});
const bladeDepth = () => shared('mat:blade_d', ()=>{
  const m=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking});
  injectSway(m, 0.1, 2.1, 'blade_d');
  return m;
});

/** @param {string} type @param {()=>number} rng */
export function buildPlant(type, rng){
  const spec=PLANTS[type], n=spec.n, tint=spec.tint ?? [1,1,1];
  const geo=baseGeo(type).clone();
  const mesh=new THREE.InstancedMesh(geo, bladeMat(), n);
  mesh.customDepthMaterial=bladeDepth();
  mesh.castShadow=true;
  mesh.frustumCulled=false;          // 摆动会超出包围盒
  const phases=new Float32Array(n);
  const m=new THREE.Matrix4(), q=new THREE.Quaternion(), s=new THREE.Vector3(), pv=new THREE.Vector3(), col=new THREE.Color();
  for(let i=0;i<n;i++){
    // 丛内分布：中心密、边缘疏（两次随机取均值）
    const x=(rng()+rng()-1)*spec.spread[0], z=(rng()+rng()-1)*spec.spread[1];
    phases[i]=rng()*6.283;
    q.setFromAxisAngle(UP, rng()*6.283);
    s.set(rrange(rng,0.75,1.2), rrange(rng,spec.h[0],spec.h[1]), 1);
    pv.set(x, -0.03, z);
    mesh.setMatrixAt(i, m.compose(pv,q,s));
    col.setRGB(tint[0]*rrange(rng,0.85,1.12), tint[1]*rrange(rng,0.85,1.12), tint[2]*rrange(rng,0.85,1.12));
    mesh.setColorAt(i,col);
  }
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases,1));
  if(mesh.instanceColor) mesh.instanceColor.needsUpdate=true;
  return { object:mesh, obstacles:[] };
}
