// @ts-check
import * as THREE from 'three';
import { U } from '../uniforms.js';

/* ================================================================
 * 焦散纹理（Voronoi 网纹，程序生成）
 * ================================================================ */
function makeCausticsTexture(size=256, pts=26){
  const P = [];
  for(let i=0;i<pts;i++) P.push([Math.random()*size, Math.random()*size, 0.65+Math.random()*0.6]);
  const cv = document.createElement('canvas'); cv.width=cv.height=size;
  const ctx = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
  const img = ctx.createImageData(size,size);
  const data = img.data;
  const W = size*0.05;   // 网线半宽
  for(let y=0;y<size;y++) for(let x=0;x<size;x++){
    let d1=1e9,d2=1e9,b=1;
    for(let k=0;k<pts;k++){
      let dx=Math.abs(x-P[k][0]); dx=Math.min(dx,size-dx);
      let dy=Math.abs(y-P[k][1]); dy=Math.min(dy,size-dy);
      const d=Math.sqrt(dx*dx+dy*dy);
      if(d<d1){ d2=d1; d1=d; b=P[k][2]; } else if(d<d2) d2=d;
    }
    const edge = Math.max(0, 1-(d2-d1)/W);
    const v = Math.pow(edge,2.2)*255*b;
    const i=(y*size+x)*4;
    data[i]=data[i+1]=data[i+2]=v; data[i+3]=255;
  }
  ctx.putImageData(img,0,0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
export const causticsTex = makeCausticsTexture();
export const causticsOn = { value: 1 };   // 全局开关（设置面板控制）
export function setCausticsEnabled(/** @type {boolean} */ on){ causticsOn.value = on ? 1 : 0; }

/** 焦散按表面朝向衰减：光从水面往下打，朝上的面最亮，竖直面只剩一点（此前所有朝向一样亮，
 * 竖直的岩壁、鱼身两侧被 xz 投影拉成竖条纹）。GLSL 表达式，需在 normal 算好之后求值 */
export const CAUSTIC_FACING = 'mix( 0.22, 1.0, smoothstep( -0.1, 0.85, inverseTransformDirection( normal, viewMatrix ).y ) )';

// 把焦散注入任意 MeshStandardMaterial（按世界坐标采样，仅投在水下物体上）
/** @param {any} mat @param {number} strength @param {string} key */
export function injectCaustics(mat, strength, key){
  mat.customProgramCacheKey = ()=> 'caustic_'+key;
  mat.onBeforeCompile = (/** @type {any} */ sh)=>{
    sh.uniforms.uCausticMap = { value: causticsTex };
    sh.uniforms.uCausticK   = { value: strength };
    sh.uniforms.uOn        = causticsOn;
    sh.uniforms.uTimeF      = U.time;
    mat.userData.causticK   = sh.uniforms.uCausticK;
    sh.vertexShader = 'varying vec3 vWPos;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vWPos = ( modelMatrix * instanceMatrix * vec4( transformed, 1.0 ) ).xyz;
      #else
        vWPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
      #endif`);
    sh.fragmentShader =
      'uniform sampler2D uCausticMap;\nuniform float uCausticK;\nuniform float uOn;\nuniform float uTimeF;\nvarying vec3 vWPos;\n'
      + sh.fragmentShader.replace('#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      {
        vec2 cuv = vWPos.xz;
        float c1 = texture2D( uCausticMap, cuv*0.55 + vec2( uTimeF*0.021,  uTimeF*0.017 ) ).r;
        float c2 = texture2D( uCausticMap, cuv*0.92 - vec2( uTimeF*0.013, -uTimeF*0.019 ) ).r;
        float ca = pow( min( c1, c2 ), 1.4 ) * smoothstep( 1.75, 1.0, vWPos.y ) * ${CAUSTIC_FACING};
        // 按表面本色提亮（光透过水打在上面），而不是叠一层白——白色网纹会盖住沙粒、像画上去的，显得不通透
        diffuseColor.rgb += diffuseColor.rgb * vec3( 0.78, 0.94, 1.0 ) * ca * uCausticK * 1.8 * uOn;
      }`);
  };
}
