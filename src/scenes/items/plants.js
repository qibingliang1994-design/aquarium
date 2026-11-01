// @ts-check
import * as THREE from 'three';
import { makeRng, rrange } from '../../utils.js';
import { shared, injectSway, UP } from './common.js';
import { rosette, ribbons, stemPlant, carpetClump, bushMass, starStem } from './leaf-shapes.js';

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
  red:      { n:11, spread:[0.11,0.1], s:[0.75,1.2], unit:(/** @type {any} */ rng)=>stemPlant(rng, { height:0.42, nodes:11, leafLen:0.07, leafW:0.022,
              cStem:0x6b3a24, cLow:0x3f6a2a, cHigh:0xd0503a }) },
  // 绿宫廷：高大的绿色有茎草，顶梢转黄绿，成片种在后景能一直长到水面
  stemGreen:{ n:28, spread:[0.18,0.12], s:[0.75,1.15], unit:(/** @type {any} */ rng)=>stemPlant(rng, { height:0.98, nodes:20, leafLen:0.1, leafW:0.03,
              cStem:0x3f6a2a, cLow:0x2f6a2a, cHigh:0xa8cf52 }) },
  // 圆叶节节菜：几十根细茎挤成一团修剪过的圆顶，细碎小叶，顶梢转橙红（自然水景的红色焦点）
  // 圆顶灌丛与草毯不投影（noCast）：叶子都贴着自身表面，阴影图里只是一团，省掉阴影 pass 里几万个三角形
  rotala:   { n:2, spread:[0.06,0.05], s:[0.85,1.15], noCast:true, unit:(/** @type {any} */ rng)=>bushMass(rng, { rx:0.24, rz:0.17, h:0.8, stems:34, tips:3, nodes:4,
              tipLen:0.11, leafLen:0.034, leafW:0.022, whorl:2, round:true, cStem:0x5a3a22, cLow:0x6a6a2a, cHigh:0xe0603a }) },
  // 珍珠草：极细小叶密生的浅绿圆顶，填在沉木下、有茎草前面做过渡
  pearl:    { n:2, spread:[0.07,0.05], s:[0.85,1.15], noCast:true, unit:(/** @type {any} */ rng)=>bushMass(rng, { rx:0.22, rz:0.16, h:0.5, stems:34, tips:3, nodes:5,
              tipLen:0.1, leafLen:0.024, leafW:0.011, whorl:2, cStem:0x3c6a2a, cLow:0x2e6a2a, cHigh:0xa8de64 }) },
  // 星状刺蕊草：每节一轮细长针叶水平散开，茎顶叠成星芒，亮黄绿；后景右侧成片
  star:     { n:16, spread:[0.16,0.12], s:[0.8,1.2], unit:(/** @type {any} */ rng)=>starStem(rng, { height:0.78, nodes:12, leafLen:0.11, leafW:0.0065,
              cStem:0x4a7a2a, cLow:0x3a742c, cHigh:0xdcee6a }) },
  // 迷你矮珍珠：圆叶小草簇，铺成前景地毯
  carpet:   { n:9, spread:[0.28,0.12], s:[0.9,1.3], noCast:true, unit:(/** @type {any} */ rng)=>carpetClump(rng, { n:56, radius:0.1,
              colors:[[0x2c6a2a,0x6ec34c],[0x2f7430,0x82d05a]] }) },
  // 牛毛毡：极细的针状叶成簇直立，一片连成草原（ADA 岩组缸的标准前中景）；低面数，单丛株数多
  hairgrass:{ n:18, spread:[0.32,0.16], s:[0.8,1.3], unit:(/** @type {any} */ rng)=>ribbons(rng, { n:28, len:[0.12,0.3], width:0.0038, twist:0.3,
              colors:[[0x24501e,0x7fc04a],[0x2f6426,0x9ad45e],[0x264a1c,0x6aa83c],[0x30581e,0xa8c858]], spread:0.04, segs:5, cols:1 }) },
  // 铁皇冠 / 黑木蕨：深绿长披针叶从短根茎斜伸，常绑在沉木与石缝间
  fern:     { n:5, spread:[0.12,0.09], s:[0.8,1.2], unit:(/** @type {any} */ rng)=>rosette(rng, { n:11, len:[0.26,0.4], width:0.05, petiole:0.12,
              tilt:[0.35,1.0], bend:0.5, colors:[[0x173a19,0x3f7a2e],[0x1c4220,0x4c8a36],[0x14331a,0x376a2a]], vein:0x6f9a4a }) },
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
  injectLeafDetail(m);
  return m;
});

/**
 * 叶面细节（叶片 UV：u 横跨叶宽、v 沿叶长；茎没有 UV，读到 0 时整段跳过）：
 * 平行叶脉细线 + 中脉提亮 + 叶面斑驳（世界坐标噪声）+ 叶尖略黄、叶基略暗；叶脉同时轻微扰动法线，近看有起伏
 */
function injectLeafDetail(/** @type {any} */ mat){
  const prev=mat.onBeforeCompile, prevKey=mat.customProgramCacheKey?.() ?? '';
  mat.customProgramCacheKey=()=>`${prevKey}_leaf`;
  mat.onBeforeCompile=(/** @type {any} */ sh, /** @type {any} */ r)=>{
    prev?.(sh, r);
    sh.vertexShader='varying vec2 vLfUV;\n'+sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vLfUV = uv;`);
    sh.fragmentShader='varying vec2 vLfUV;\n'+sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
      if( vLfUV.y > 0.0 ){
        float u = vLfUV.x, v = vLfUV.y;
        float lines = pow( abs( sin( u*3.14159*9.0 ) ), 10.0 );                  // 平行叶脉
        float mid = 1.0 - smoothstep( 0.0, 0.05, abs( u-0.5 ) );                 // 中脉
        float mott = fract( sin( dot( floor( vSwW.xz*90.0 + vSwW.y*40.0 ), vec2( 12.9898, 78.233 ) ) )*43758.5 );
        diffuseColor.rgb *= 0.9 + 0.12*mott - 0.1*lines;
        diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb*vec3( 1.25, 1.22, 0.9 ), mid*0.5 );
        diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb*vec3( 1.18, 1.1, 0.72 ), smoothstep( 0.8, 1.0, v )*0.45 );   // 叶尖泛黄
        diffuseColor.rgb *= 0.78 + 0.22*smoothstep( 0.0, 0.25, v );                // 叶基压暗（丛内自遮挡）
      }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      if( vLfUV.y > 0.0 ){
        vec3 dpx = dFdx( vSwW ), dpy = dFdy( vSwW );
        float du = dFdx( vLfUV.x ), dv = dFdy( vLfUV.x );
        vec3 T = normalize( dpx*dv - dpy*du + 1e-6 );
        normal = normalize( normal + T * cos( vLfUV.x*3.14159*9.0 ) * 0.12 );    // 叶脉起伏
      }`);
  };
}
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
  mesh.castShadow=!spec.noCast; mesh.receiveShadow=true;
  mesh.frustumCulled=false;          // 摆动会超出包围盒
  mesh.userData.plant={ full:n };    // 画质档减株（scene-runtime applyShore / shore-lod plantKeep）
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
