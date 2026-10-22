// @ts-check
import * as THREE from 'three';

/* ================================================================
 * 照片级 PBR 表面贴图（素材：SkentSun/aquarium-editor，MIT，public/tex/）
 * - 三平面映射（triplanar）按物件局部坐标采样 albedo+法线：程序化几何没有 UV 也能贴，
 *   纹理跟着物件走（拖动/旋转不游移），实例共享几何时同贴图
 * - 加载完成前用 1×1 占位（albedo 关闭、法线全平），材质保持原本的程序化外观；
 *   uniform 是共享引用，贴图到位后改 value 热替换，不触发重编译
 * - 组合式注入：与 injectCaustics / injectSurfaceDetail 叠加（各自重发
 *   `#include <…>` 锚点，顺序无关），customProgramCacheKey 串接防程序串味
 * ================================================================ */

const loader=new THREE.TextureLoader();
/** @type {Map<string, { map:THREE.Texture, nor:THREE.Texture, loaded:boolean, listeners:((p:any)=>void)[] }>} */
const cache=new Map();

const placeholder=(/** @type {number[]} */ rgba,/** @type {boolean} */ srgb)=>{
  const t=new THREE.DataTexture(new Uint8Array(rgba),1,1);
  t.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;
  t.needsUpdate=true;
  return t;
};

/** albedo+法线 对：tex/<name>.webp + tex/<name>_n.webp，立即可用（加载完成前是占位） */
export function surfacePair(/** @type {string} */ name){
  let p=cache.get(name);
  if(p) return p;
  /** @type {any} */
  p={ map:placeholder([255,255,255,255],true), nor:placeholder([128,128,255,255],false), loaded:false, listeners:[] };
  cache.set(name,p);
  let left=2;
  const done=()=>{ if(--left<=0){ p.loaded=true; for(const f of p.listeners) f(p); } };
  const load=(/** @type {boolean} */ srgb)=>{
    loader.load(`tex/${name}${srgb?'':'_n'}.webp`,(/** @type {any} */ t)=>{
      t.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;
      t.wrapS=t.wrapT=THREE.RepeatWrapping;
      t.anisotropy=8;
      if(srgb) p.map=t; else p.nor=t;
      done();
    },undefined,()=>done());                // 失败也放行：保持占位外观
  };
  load(true); load(false);
  return p;
}

/** 贴图到位回调（已加载则立即执行） */
export function onTexPair(/** @type {any} */ p,/** @type {(pair:any)=>void} */ f){
  if(p.loaded) f(p); else p.listeners.push(f);
}

/**
 * 三平面 PBR 表面：albedo 乘进漫反射（uTexGain 补偿贴图平均亮度），法线按主轴平面 UV 采样、
 * 屏幕导数重建切线系后扰动。scale：每单位长度的平铺次数；k：法线强度；gain：albedo 增益
 */
export function injectSurfaceTex(/** @type {any} */ mat,/** @type {{ name:string, scale?:number, k?:number, gain?:number, key?:string }} */
  { name, scale=2.6, k=1.1, gain=1.8, key='stex' }){
  const pair=surfacePair(name);
  // 共享 uniform 引用：贴图加载完成后只改 .value，所有已编译的程序立即生效
  const uni={ tMap:{ value:pair.map }, tNor:{ value:pair.nor }, uTexOn:{ value:pair.loaded?1:0 },
    uTexS:{ value:scale }, uTexK:{ value:k }, uTexGain:{ value:gain } };
  onTexPair(pair,(/** @type {any} */ t)=>{ uni.tMap.value=t.map; uni.tNor.value=t.nor; uni.uTexOn.value=1; });
  const prev=mat.onBeforeCompile, prevKey=mat.customProgramCacheKey?.() ?? '';
  mat.customProgramCacheKey=()=>`${prevKey}_${key}`;
  mat.onBeforeCompile=(/** @type {any} */ sh)=>{
    prev?.(sh);
    Object.assign(sh.uniforms, uni);
    sh.vertexShader='varying vec3 vOPos, vONrm;\n'
      +sh.vertexShader.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
      vOPos = position; vONrm = objectNormal;`);
    sh.fragmentShader=`uniform sampler2D tMap, tNor; uniform float uTexS, uTexK, uTexGain, uTexOn;
varying vec3 vOPos, vONrm;\n`
      +sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      {
        vec3 w3 = pow( abs( vONrm ), vec3( 4.0 ) ); w3 /= ( w3.x + w3.y + w3.z );
        vec2 uvx = vOPos.zy * uTexS, uvy = vOPos.xz * uTexS, uvz = vOPos.xy * uTexS;
        vec3 alb = texture2D( tMap, uvx ).rgb * w3.x + texture2D( tMap, uvy ).rgb * w3.y + texture2D( tMap, uvz ).rgb * w3.z;
        diffuseColor.rgb *= mix( vec3( 1.0 ), alb * uTexGain, uTexOn );
        vec2 uv = uvx * w3.x + uvy * w3.y + uvz * w3.z;
        vec3 tn = texture2D( tNor, uv ).xyz * 2.0 - 1.0;
        tn.xy *= uTexK;
        vec3 dp1 = dFdx( -vViewPosition ), dp2 = dFdy( -vViewPosition );
        vec2 duv1 = dFdx( uv ), duv2 = dFdy( uv );
        vec3 dp2perp = cross( dp2, normal ), dp1perp = cross( normal, dp1 );
        vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;
        vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;
        float invmax = inversesqrt( max( dot( T, T ), dot( B, B ) ) + 1e-6 );
        normal = normalize( ( T * tn.x + B * tn.y + normal * max( tn.z, 0.2 ) ) * invmax );
      }`);
  };
  return mat;
}
