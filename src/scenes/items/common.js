// @ts-check
import * as THREE from 'three';
import { U } from '../../uniforms.js';
import { causticsTex, causticsOn } from '../../scene/caustics.js';
import { TANK } from '../../scene/tank.js';   // 循环依赖安全：TANK 只在着色器编译时（onBeforeCompile）读取

/* ================================================================
 * 造景物件公共件：共享材质缓存、摆动着色、渐变顶点色
 * 约定：材质按类型共享、永不释放；几何每个物件独有，物件移除时释放
 * ================================================================ */

const MATS = new Map();
/** 按 key 懒创建并缓存的共享材质 */
export function shared(/** @type {string} */ key, /** @type {()=>any} */ make){
  if(!MATS.has(key)) MATS.set(key, make());
  return MATS.get(key);
}

export const UP = new THREE.Vector3(0,1,0);

// 摆动 + 叶片透光 + 焦散；深度材质只做摆动。hNorm = 摆动满幅所在的局部高度
export function injectSway(/** @type {any} */ mat, /** @type {number} */ amp, /** @type {number} */ freq, /** @type {string} */ key, /** @type {boolean} */ shade=false, /** @type {number} */ hNorm=1.1){
  mat.customProgramCacheKey=()=> `sway_${key}${shade?'_s':''}`;
  mat.onBeforeCompile=(/** @type {any} */ sh)=>{
    sh.uniforms.uTimeS=U.time;
    sh.uniforms.uAmp={value:amp};
    sh.uniforms.uFreq={value:freq};
    sh.uniforms.uHN={value:hNorm};
    sh.uniforms.uFlowS=U.flow;
    sh.vertexShader='uniform float uTimeS, uAmp, uFreq, uHN, uFlowS;\nattribute float aPhase;\nvarying vec3 vSwW;\n'
      + sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
      {
        float hh = clamp( transformed.y / uHN, 0.0, 1.0 );
        float ss = pow( hh, 1.45 );
        // 水流：水下的草顺流（世界 +x）倒伏、摆得更急；实例和物件各自随机转过，倒伏方向要换到局部空间
        mat3 toW = mat3( modelMatrix );
        vec4 base = modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
        #ifdef USE_BATCHING
          toW = toW * mat3( batchingMatrix );
          base = modelMatrix * batchingMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
        #endif
        #ifdef USE_INSTANCING
          toW = toW * mat3( instanceMatrix );
          base = modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
        #endif
        float fl = uFlowS * step( base.y, ${TANK.waterY.toFixed(2)} );   // 岸上的草不受水流影响
        float gust = 1.0 + fl * 3.0 * ( 0.75 + 0.25*sin( uTimeS*0.6 + aPhase ) );
        transformed.x += sin( uTimeS*1.15*( 1.0 + fl*2.0 ) + aPhase + transformed.y*uFreq ) * ss * uAmp * gust;
        transformed.z += cos( uTimeS*0.93 + aPhase*1.31 + transformed.y*uFreq*0.9 ) * ss * uAmp * 0.6;
        vec3 lean = inverse( toW ) * vec3( 1.0, 0.0, 0.0 );
        transformed += normalize( lean ) * ss * uHN * fl * 1.6 * ( 0.85 + 0.15*sin( uTimeS*0.8 + aPhase ) );
      }
      #ifdef USE_BATCHING
        vSwW = ( modelMatrix * batchingMatrix * vec4( transformed, 1.0 ) ).xyz;
      #elif defined( USE_INSTANCING )
        vSwW = ( modelMatrix * instanceMatrix * vec4( transformed, 1.0 ) ).xyz;
      #else
        vSwW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
      #endif`);
    if(!shade) return;
    Object.assign(sh.uniforms, { uCMap:{value:causticsTex}, uCOn:causticsOn });
    sh.fragmentShader='uniform sampler2D uCMap; uniform float uTimeS, uCOn;\nvarying vec3 vSwW;\n'
      + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float c1=texture2D(uCMap, vSwW.xz*0.55+vec2(uTimeS*0.021, uTimeS*0.017)).r;
          float c2=texture2D(uCMap, vSwW.xz*0.92-vec2(uTimeS*0.013,-uTimeS*0.019)).r;
          diffuseColor.rgb += diffuseColor.rgb*pow(min(c1,c2),1.4)*smoothstep(1.75,1.0,vSwW.y)*1.6*uCOn;
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * 0.1;`);
  };
}

/** 非实例网格的 aPhase（整件同相位） */
export function setPhase(/** @type {any} */ geo, /** @type {number} */ phase){
  geo.setAttribute('aPhase', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count).fill(phase),1));
}

/** 给几何体整体刷一层"自下而上"的渐变顶点色 */
export function paintGradient(/** @type {any} */ geo, /** @type {any} */ cBase, /** @type {any} */ cTip, /** @type {number} */ y0, /** @type {number} */ y1){
  const p=geo.attributes.position, col=new Float32Array(p.count*3);
  const a=new THREE.Color(cBase), b=new THREE.Color(cTip), tmp=new THREE.Color();
  for(let i=0;i<p.count;i++){
    tmp.copy(a).lerp(b, Math.min(1,Math.max(0,(p.getY(i)-y0)/(y1-y0))));
    col[i*3]=tmp.r; col[i*3+1]=tmp.g; col[i*3+2]=tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col,3));
  return geo;
}

export function castAll(/** @type {any} */ obj){
  obj.traverse((/** @type {any} */ o)=>{ if(o.isMesh){ o.castShadow=true; o.receiveShadow=true; } });
  return obj;
}

/** 表面细节（在已注入焦散的材质上叠加）：按世界坐标的 3D 分形噪声扰动法线并压暗凹处，
 *  无需 UV —— 岩石/沉木近看不再像塑料。freq：每单位长度的噪声频率；k：起伏强度 */
/** @param {any} mat @param {any} [opts] */
export function injectSurfaceDetail(mat, { freq=16, k=0.35, ao=0.3, stretch=[1,1,1], key='detail' }={}){
  const prev=mat.onBeforeCompile, prevKey=mat.customProgramCacheKey?.() ?? '';
  mat.customProgramCacheKey=()=>`${prevKey}_${key}`;
  mat.onBeforeCompile=(/** @type {any} */ sh)=>{
    prev?.(sh);
    sh.uniforms.uDetF={ value:freq }; sh.uniforms.uDetK={ value:k }; sh.uniforms.uDetAO={ value:ao };
    sh.uniforms.uDetS={ value:new THREE.Vector3(...stretch) };
    sh.fragmentShader='uniform float uDetF, uDetK, uDetAO; uniform vec3 uDetS;\n'
      +`float dH3(vec3 p){ p=fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float dN3(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(dH3(i),dH3(i+vec3(1,0,0)),f.x), mix(dH3(i+vec3(0,1,0)),dH3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(dH3(i+vec3(0,0,1)),dH3(i+vec3(1,0,1)),f.x), mix(dH3(i+vec3(0,1,1)),dH3(i+vec3(1,1,1)),f.x),f.y), f.z); }
float dF3(vec3 p){ return dN3(p)*0.5+dN3(p*2.13)*0.3+dN3(p*4.37)*0.2; }\n`
      +sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      {
        vec3 P=vWPos*uDetF*uDetS; float e=0.05, h0=dF3(P);
        vec3 g=vec3(dF3(P+vec3(e,0,0))-h0, dF3(P+vec3(0,e,0))-h0, dF3(P+vec3(0,0,e))-h0)/e;
        vec3 gv=(viewMatrix*vec4(g*uDetS,0.0)).xyz;
        normal=normalize(normal-(gv-dot(gv,normal)*normal)*uDetK);
        diffuseColor.rgb*=1.0-uDetAO+uDetAO*1.6*smoothstep(0.2,0.75,h0);
      }`);
  };
}
