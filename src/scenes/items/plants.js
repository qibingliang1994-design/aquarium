// @ts-check
import * as THREE from 'three';
import { makeRng, rrange } from '../../utils.js';
import { shared, injectSway, UP } from './common.js';
import { rosette, ribbons, stemPlant, carpetClump } from './leaf-shapes.js';

/* ================================================================
 * 水草丛：一丛 = 一个 InstancedMesh，实例 = 一株（植株单元几何见 leaf-shapes.js）
 * 植株单元按类型生成几个变体（固定种子，跨物件共享模板），每丛克隆一个变体再挂 aPhase
 * 局部坐标：原点在丛心沙面，根部略埋入沙
 * ================================================================ */

// unit：植株单元生成器；n 株数；spread 丛半宽/半深；s 单株缩放区间；sway 摆幅
/** @type {Record<string, any>} */
const PLANTS = {
  // 苦草：细长扭转的缎带叶，后景高草
  kelp:     { n:7, spread:[0.2,0.13], s:[0.8,1.25], unit:(/** @type {any} */ rng)=>ribbons(rng, { n:7, len:[0.85,1.25], width:0.034, twist:1.2,
              colors:[[0x173f1c,0x5fa83f],[0x1d4720,0x73b648],[0x163a1a,0x4f9436]] }) },
  // 椒草：叶柄 + 波浪卵形叶，褐绿色调，中景矮丛
  bush:     { n:6, spread:[0.2,0.13], s:[0.8,1.2], unit:(/** @type {any} */ rng)=>rosette(rng, { n:9, len:[0.34,0.46], width:0.11, petiole:0.32,
              tilt:[0.25,0.85], bend:0.55, colors:[[0x203b17,0x4f7a2c],[0x3a3018,0x6f6a2c],[0x1d3a1a,0x55813a]], vein:0x8fae58 }) },
  // 皇冠草：宽大剑形叶的大型莲座，后景主角
  crown:    { n:3, spread:[0.12,0.08], s:[0.85,1.15], unit:(/** @type {any} */ rng)=>rosette(rng, { n:13, len:[0.62,0.82], width:0.15, petiole:0.3,
              tilt:[0.12,0.75], bend:0.75, colors:[[0x16401f,0x5aa846],[0x1a4a22,0x6cb852]], vein:0x9bd06a }) },
  // 红宫廷：茎生对叶，顶端转红
  red:      { n:7, spread:[0.09,0.09], s:[0.75,1.2], unit:(/** @type {any} */ rng)=>stemPlant(rng, { height:0.42, nodes:11, leafLen:0.07, leafW:0.022,
              cStem:0x6b3a24, cLow:0x3f6a2a, cHigh:0xd0503a }) },
  // 迷你矮珍珠：圆叶小草簇，铺成前景地毯
  carpet:   { n:9, spread:[0.28,0.12], s:[0.9,1.3], unit:(/** @type {any} */ rng)=>carpetClump(rng, { n:56, radius:0.1,
              colors:[[0x2c6a2a,0x6ec34c],[0x2f7430,0x82d05a]] }) },
  // 细叶草：极细的缎带叶，轻柔飘动
  seagrass: { n:8, spread:[0.15,0.1], s:[0.75,1.2], unit:(/** @type {any} */ rng)=>ribbons(rng, { n:9, len:[0.55,0.9], width:0.016, twist:0.6,
              colors:[[0x234a2a,0x86b250],[0x2a5530,0x9cc25e]], spread:0.02 }) },
};
export const PLANT_TYPES = Object.keys(PLANTS);
const VARIANTS=3;

// 植株模板：每种 3 个变体，按固定种子生成后缓存（物件之间共享，不释放）
const unitGeo=(/** @type {string} */ type, /** @type {number} */ v)=>shared(`geo:${type}:${v}`, ()=>/** @type {any} */ (PLANTS)[type].unit(makeRng(9173+v*131+type.length*17)));
export const bladeMat = () => shared('mat:blade', ()=>{
  const m=new THREE.MeshPhysicalMaterial({vertexColors:true, roughness:0.5, metalness:0, side:THREE.DoubleSide,
    sheen:0.5, sheenRoughness:0.45, sheenColor:new THREE.Color(0xb8f08a), specularIntensity:0.45});
  injectSway(m, 0.1, 2.1, 'blade', true);
  return m;
});
export const bladeDepth = () => shared('mat:blade_d', ()=>{
  const m=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking, side:THREE.DoubleSide});
  injectSway(m, 0.1, 2.1, 'blade_d');
  return m;
});

/** @param {string} type @param {()=>number} rng */
export function buildPlant(type, rng){
  const spec=/** @type {any} */ (PLANTS)[type], n=spec.n;
  const geo=unitGeo(type, Math.floor(rng()*VARIANTS)).clone();
  const mesh=new THREE.InstancedMesh(geo, bladeMat(), n);
  mesh.customDepthMaterial=bladeDepth();
  mesh.castShadow=true; mesh.receiveShadow=true;
  mesh.frustumCulled=false;          // 摆动会超出包围盒
  const phases=new Float32Array(n);
  const m=new THREE.Matrix4(), q=new THREE.Quaternion(), s=new THREE.Vector3(), pv=new THREE.Vector3(), col=new THREE.Color();
  for(let i=0;i<n;i++){
    // 丛内分布：中心密、边缘疏（两次随机取均值）；中心株略高
    const x=(rng()+rng()-1)*spec.spread[0], z=(rng()+rng()-1)*spec.spread[1];
    const centre=1-Math.min(1,Math.hypot(x/spec.spread[0], z/spec.spread[1]))*0.25;
    phases[i]=rng()*6.283;
    q.setFromAxisAngle(UP, rng()*6.283);
    const k=rrange(rng,spec.s[0],spec.s[1]);
    s.set(k, k*centre*rrange(rng,0.9,1.1), k);
    pv.set(x, -0.025, z);
    mesh.setMatrixAt(i, m.compose(pv,q,s));
    const tint=rrange(rng,0.86,1.1);
    col.setRGB(tint*rrange(rng,0.95,1.05), tint, tint*rrange(rng,0.92,1.04));
    mesh.setColorAt(i,col);
  }
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases,1));
  if(mesh.instanceColor) mesh.instanceColor.needsUpdate=true;
  return { object:mesh, obstacles:[] };
}
