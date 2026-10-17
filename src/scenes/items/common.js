import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { vnoise } from '../../utils.js';
import { U } from '../../uniforms.js';
import { causticsTex, causticsOn } from '../../scene/caustics.js';

/* ================================================================
 * 造景物件公共件：共享材质缓存、摆动着色、叶片/岩石几何
 * 约定：材质按类型共享、永不释放；几何每个物件独有，物件移除时释放
 * ================================================================ */

const MATS = new Map();
/** 按 key 懒创建并缓存的共享材质 */
export function shared(key, make){
  if(!MATS.has(key)) MATS.set(key, make());
  return MATS.get(key);
}

export const UP = new THREE.Vector3(0,1,0);

// 摆动 + 叶片透光 + 焦散；深度材质只做摆动。hNorm = 摆动满幅所在的局部高度
export function injectSway(mat, amp, freq, key, shade=false, hNorm=1.1){
  mat.customProgramCacheKey=()=> `sway_${key}${shade?'_s':''}`;
  mat.onBeforeCompile=(sh)=>{
    sh.uniforms.uTimeS=U.time;
    sh.uniforms.uAmp={value:amp};
    sh.uniforms.uFreq={value:freq};
    sh.uniforms.uHN={value:hNorm};
    sh.vertexShader='uniform float uTimeS, uAmp, uFreq, uHN;\nattribute float aPhase;\nvarying vec3 vSwW;\n'
      + sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
      {
        float hh = clamp( transformed.y / uHN, 0.0, 1.0 );
        float ss = pow( hh, 1.45 );
        transformed.x += sin( uTimeS*1.15 + aPhase + transformed.y*uFreq ) * ss * uAmp;
        transformed.z += cos( uTimeS*0.93 + aPhase*1.31 + transformed.y*uFreq*0.9 ) * ss * uAmp * 0.6;
      }
      #ifdef USE_INSTANCING
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
export function setPhase(geo, phase){
  geo.setAttribute('aPhase', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count).fill(phase),1));
}

// 叶片：两端收尖的柳叶轮廓 + 中脉 V 折（宽 2 段，中线顶点前凸），中脉颜色稍亮
export function makeBlade(width, height, cBase, cTip, bend){
  const g=new THREE.PlaneGeometry(width,height,2,12).translate(0,height/2,0);
  const p=g.attributes.position, col=new Float32Array(p.count*3);
  const cb=new THREE.Color(cBase), ct=new THREE.Color(cTip), tmp=new THREE.Color();
  for(let i=0;i<p.count;i++){
    // 夹紧：translate 后底边 y 可能是 -1e-17，负数开小数次幂会得到 NaN（NaN 像素经泛光扩散成大片黑块）
    const t=Math.min(1,Math.max(0,p.getY(i)/height));
    const side=p.getX(i)/(width/2);                       // -1 / 0 / 1
    const w=Math.pow(Math.max(0,Math.sin(Math.PI*Math.min(1,0.14+0.86*t))),0.7); // 叶基略窄、中部最宽、叶尖收尖
    p.setX(i, side*width/2*w);
    p.setZ(i, t*t*bend + (1-Math.abs(side))*width*0.18*w); // 弯曲 + 中脉前凸
    tmp.copy(cb).lerp(ct,Math.pow(t,0.8));
    if(side===0) tmp.multiplyScalar(1.18);
    col[i*3]=tmp.r; col[i*3+1]=tmp.g; col[i*3+2]=tmp.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col,3));
  g.computeVertexNormals();
  return g;
}
export function makeBladeX(width, height, cBase, cTip, bend){
  const a=makeBlade(width,height,cBase,cTip,bend);
  const b=makeBlade(width,height,cBase,cTip,bend); b.rotateY(Math.PI/2);
  return mergeGeometries([a,b]);
}

// 岩石：噪声起伏的二十面体 + 顶面苔藓色（法线朝上处）
export function makeRockGeo(r, seed){
  const g=new THREE.IcosahedronGeometry(r,3);
  const p=g.attributes.position, v=new THREE.Vector3(), o=(seed%997)*0.37;
  for(let i=0;i<p.count;i++){
    v.set(p.getX(i),p.getY(i),p.getZ(i));
    const n=vnoise(v.x*2.2/r*0.2+o, (v.y*2.2+v.z*1.7)/r*0.2+o*2.1);
    v.multiplyScalar(1+(n-0.5)*0.5);
    v.y*=0.8;
    p.setXYZ(i,v.x,v.y,v.z);
  }
  g.computeVertexNormals();
  const nrm=g.attributes.normal, col=new Float32Array(p.count*3);
  const c1=new THREE.Color(0x71695c), c2=new THREE.Color(0x45413a), cm=new THREE.Color(0x51633c), tmp=new THREE.Color();
  for(let i=0;i<p.count;i++){
    tmp.copy(c1).lerp(c2, vnoise(p.getX(i)*3+o, p.getZ(i)*3));
    if(nrm.getY(i)>0.45) tmp.lerp(cm, Math.min(1,(nrm.getY(i)-0.45)*1.6)*(0.4+0.6*vnoise(p.getX(i)*5+o*3, p.getZ(i)*5)));
    col[i*3]=tmp.r; col[i*3+1]=tmp.g; col[i*3+2]=tmp.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col,3));
  return g;
}

/** 给几何体整体刷一层"自下而上"的渐变顶点色 */
export function paintGradient(geo, cBase, cTip, y0, y1){
  const p=geo.attributes.position, col=new Float32Array(p.count*3);
  const a=new THREE.Color(cBase), b=new THREE.Color(cTip), tmp=new THREE.Color();
  for(let i=0;i<p.count;i++){
    tmp.copy(a).lerp(b, Math.min(1,Math.max(0,(p.getY(i)-y0)/(y1-y0))));
    col[i*3]=tmp.r; col[i*3+1]=tmp.g; col[i*3+2]=tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col,3));
  return geo;
}

export function castAll(obj){
  obj.traverse(o=>{ if(o.isMesh){ o.castShadow=true; o.receiveShadow=true; } });
  return obj;
}
