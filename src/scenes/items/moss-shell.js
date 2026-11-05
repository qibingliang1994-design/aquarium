// @ts-check
import * as THREE from 'three';
import { injectTranslucency } from './common.js';

/* ================================================================
 * 苔藓绒毛：壳层（shell texturing，毛发 / 苔藓 / 地毯的常规画法）
 *
 * 苔藓原来只是一团团低面数的实心团块，近看是硬棱角的多边形、贴着石面像绿色的石头。
 * 现在在实心团（核）外面叠 SHELLS 层"壳"：同一份几何、同一组实例矩阵（零额外 CPU 状态），
 * 顶点沿法线外推 h·len（h = 1/K … 1）；片元按物体空间的 3D 格点噪声把每层切成一根根"茎"的截面——
 * 越往外茎越细、越稀，根部暗、梢部亮且偏黄。轮廓处几层错开，硬棱角变成毛茸茸的绒边。
 * - 格点用推出前的 position：同一根茎在各层落在同一格，看上去是竖直的一簇簇
 * - 壳层不投影（核负责阴影），接收阴影；逆光时茎梢透光（injectTranslucency）
 * - 画质档减层（setMossShells），最低档只剩核
 * ================================================================ */

export const SHELLS = 4;
/** 画质档 → 壳层数 */
export const SHELL_TIERS = [4, 4, 3, 3, 2, 1, 0];

/** @type {Map<string, THREE.Material[]>} 按苔藓类型缓存的各层材质（共享、永不释放） */
const MATS = new Map();
let shown = SHELLS;

/** 第 i 层（1..K）的高度比例 h ∈ (0, 1] @param {number} i @param {number} k */
export const shellHeight = (i, k) => i / k;

/**
 * @param {string} key 苔藓类型（材质缓存键）
 * @param {() => THREE.Material} make 生成一份与核同款的底材质（焦散 / 照片贴图等注入都在里面）
 * @param {{ len:number, freq:number, tr?:number }} o len：壳层总厚度（物体空间）；freq：茎格点密度（物体空间每单位格数）
 */
function shellMats(key, make, { len, freq, tr = 0.6 }){
  let mats = MATS.get(key);
  if(mats) return mats;
  mats = [];
  for(let i = 1; i <= SHELLS; i++){
    const m = /** @type {any} */ (make());
    const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey?.() ?? '';
    m.customProgramCacheKey = () => `${prevKey}_mossshell`;   // 各层共用一个程序，层高走 uniform
    m.onBeforeCompile = (/** @type {any} */ sh, /** @type {any} */ r) => {
      prev?.(sh, r);
      Object.assign(sh.uniforms, { uShH: { value: shellHeight(i, SHELLS) }, uShLen: { value: len }, uShF: { value: freq } });
      sh.vertexShader = 'uniform float uShH, uShLen, uShF;\nvarying vec3 vShP;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vShP = position * uShF;
        transformed += normalize( objectNormal ) * ( uShLen * uShH );`);
      sh.fragmentShader = 'uniform float uShH;\nvarying vec3 vShP;\n'
        + 'float shHash( vec3 p ){ return fract( sin( dot( p, vec3( 127.1, 311.7, 74.7 ) ) ) * 43758.5453 ); }\n'
        + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        {
          // 茎的截面：格内抖动的圆，半径随层高收细；一部分茎较矮，到高层就没了
          vec3 ci = floor( vShP ), f = fract( vShP ) - 0.5;
          float r = shHash( ci );
          vec3 jit = vec3( shHash( ci + 1.7 ), shHash( ci + 4.3 ), shHash( ci + 9.1 ) ) - 0.5;
          float d = length( f - jit * 0.45 );
          if( d > ( 0.66 - 0.48 * uShH ) * ( 0.6 + 0.4 * r ) || r < uShH * 0.5 ) discard;
          diffuseColor.rgb *= mix( 0.62, 1.1, uShH );                                  // 根部被上层遮住，梢部受光
          diffuseColor.rgb *= mix( vec3( 1.0 ), vec3( 1.06, 1.1, 0.82 ), uShH );         // 新梢偏黄绿
        }`);
    };
    m.needsUpdate = true;
    injectTranslucency(m, { k: tr, tint: [1.0, 1.15, 0.55] });
    m.visible = i <= shown;
    mats.push(m);
  }
  MATS.set(key, mats);
  return mats;
}

/**
 * 给苔藓核加壳层：作为核的子节点，共享几何与（实例化时）实例矩阵 / 实例颜色。
 * 必须在核的实例矩阵写完之后调用（count 跟随核）；调用方若之后 castAll，要再把壳层的 castShadow 关掉——
 * 这里返回壳层数组方便处理。
 * @param {THREE.Mesh} core @param {string} key @param {() => THREE.Material} make
 * @param {{ len:number, freq:number, tr?:number }} o
 */
export function addMossShells(core, key, make, o){
  const mats = shellMats(key, make, o);
  /** @type {THREE.Mesh[]} */
  const out = [];
  for(const m of mats){
    /** @type {THREE.Mesh} */
    let s;
    if(/** @type {any} */ (core).isInstancedMesh){
      const ic = /** @type {THREE.InstancedMesh} */ (core);
      const im = new THREE.InstancedMesh(ic.geometry, m, ic.instanceMatrix.count);
      im.instanceMatrix = ic.instanceMatrix;
      im.instanceColor = ic.instanceColor;
      im.count = ic.count;
      im.frustumCulled = ic.frustumCulled;
      s = im;
    } else s = new THREE.Mesh(core.geometry, m);
    s.castShadow = false; s.receiveShadow = true;
    s.userData.mossShell = true;
    core.add(s);
    out.push(s);
  }
  return out;
}

/** 画质档 → 显示几层（材质 visible，隐藏的层整个不提交绘制） @param {number} level */
export function setMossShells(level){
  shown = SHELL_TIERS[Math.min(Math.max(level, 0), SHELL_TIERS.length - 1)];
  for(const mats of MATS.values()) mats.forEach((m, i) => { m.visible = i < shown; });
}
