// @ts-check
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/* ================================================================
 * 边缘抗锯齿（FXAA 3.11 质量档精简版）：场景 RT 不开 MSAA 后，水草/叶片这类细长几何的边缘出现阶梯锯齿。
 * 多采样深度纹理的逐帧 resolve 太贵（实测 +52%），所以改在场景颜色上做一遍后处理——
 * 只读颜色、只写颜色，深度仍由场景 RT 提供；非边缘像素 9 次采样后直接返回。
 * 亮度用"柔化后的感知亮度"（HDR 值先 l/(1+l) 再开方），避免高光/泡沫把边缘检测带偏。
 * ================================================================ */

const FRAG=/* glsl */`
uniform sampler2D tSrc, tAO; uniform vec2 uPx; uniform float uAO;
varying vec2 vUv;
float lum(vec2 uv){
  vec3 c=max(texture2D(tSrc,uv).rgb,vec3(0.));
  float l=dot(c,vec3(0.299,0.587,0.114));
  return sqrt(l/(1.+l));
}
vec3 fxaa(){
  vec3 cM=texture2D(tSrc,vUv).rgb;
  float lM=lum(vUv);
  float lS=lum(vUv-vec2(0.,uPx.y)), lN=lum(vUv+vec2(0.,uPx.y)), lW=lum(vUv-vec2(uPx.x,0.)), lE=lum(vUv+vec2(uPx.x,0.));
  float lMax=max(lM,max(max(lN,lS),max(lE,lW))), lMin=min(lM,min(min(lN,lS),min(lE,lW)));
  float range=lMax-lMin;
  if(range<max(0.0312,lMax*0.125)) return cM;
  float lSW=lum(vUv-uPx), lNE=lum(vUv+uPx), lNW=lum(vUv+vec2(-uPx.x,uPx.y)), lSE=lum(vUv+vec2(uPx.x,-uPx.y));
  float lNS=lN+lS, lWE=lW+lE;
  float edgeH=abs(-2.*lW+lNW+lSW)+abs(-2.*lM+lNS)*2.+abs(-2.*lE+lNE+lSE);
  float edgeV=abs(-2.*lN+lNW+lNE)+abs(-2.*lM+lWE)*2.+abs(-2.*lS+lSW+lSE);
  bool horz=edgeH>=edgeV;
  float l1=horz?lS:lW, l2=horz?lN:lE;
  float g1=l1-lM, g2=l2-lM;
  bool neg=abs(g1)>=abs(g2);
  float grad=max(abs(g1),abs(g2))*0.25;
  float stepLen=horz?uPx.y:uPx.x;
  float lAvg;
  if(neg){ stepLen=-stepLen; lAvg=0.5*(l1+lM); } else lAvg=0.5*(l2+lM);
  vec2 cuv=vUv;
  if(horz) cuv.y+=stepLen*0.5; else cuv.x+=stepLen*0.5;
  vec2 off=horz?vec2(uPx.x,0.):vec2(0.,uPx.y);
  vec2 uv1=cuv-off, uv2=cuv+off;
  float e1=lum(uv1)-lAvg, e2=lum(uv2)-lAvg;
  bool r1=abs(e1)>=grad, r2=abs(e2)>=grad;
  if(!r1) uv1-=off;
  if(!r2) uv2+=off;
  for(int i=0;i<10;i++){
    if(r1&&r2) break;
    float q=i<4?1.:(i<6?1.5:(i<8?2.:4.));
    if(!r1){ e1=lum(uv1)-lAvg; r1=abs(e1)>=grad; if(!r1) uv1-=off*q; }
    if(!r2){ e2=lum(uv2)-lAvg; r2=abs(e2)>=grad; if(!r2) uv2+=off*q; }
  }
  float d1=horz?vUv.x-uv1.x:vUv.y-uv1.y;
  float d2=horz?uv2.x-vUv.x:uv2.y-vUv.y;
  bool dir1=d1<d2;
  float dMin=min(d1,d2), len=max(d1+d2,1e-6);
  float pix=-dMin/len+0.5;
  bool mSmall=lM<lAvg;
  bool ok=((dir1?e1:e2)<0.)!=mSmall;
  float fin=ok?pix:0.;
  float lAvg12=(1./12.)*(2.*(lNS+lWE)+(lSW+lSE)+(lNW+lNE));
  float sub=clamp(abs(lAvg12-lM)/range,0.,1.);
  sub=(-2.*sub+3.)*sub*sub;
  fin=max(fin,sub*sub*0.75);
  vec2 fuv=vUv;
  if(horz) fuv.y+=stepLen*fin; else fuv.x+=stepLen*fin;
  return texture2D(tSrc,fuv).rgb;
}
void main(){
  vec3 c=fxaa();
  // 环境光遮蔽（gtao.js，半分辨率已去噪）收尾乘上：AO 是低频项，放在抗锯齿之后无可见差别，省一遍全屏 pass
  if(uAO>0.) c*=mix(1.,texture2D(tAO,vUv).r,uAO);
  gl_FragColor=vec4(c,1.);
}`;

/** 全屏 FXAA：src 纹理 → dst 渲染目标（同尺寸，仅颜色） */
export function createEdgeAA(){
  const mat=new THREE.ShaderMaterial({
    uniforms:{ tSrc:{ value:null }, uPx:{ value:new THREE.Vector2(1,1) }, tAO:{ value:null }, uAO:{ value:0 } },
    vertexShader:'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }',
    fragmentShader:FRAG, depthTest:false, depthWrite:false });
  const quad=new FullScreenQuad(mat);
  return {
    /** ao：环境光遮蔽贴图（r = 可见度）与强度 0..1；不传 = 不乘
     * @param {THREE.WebGLRenderer} renderer @param {THREE.Texture} src @param {THREE.WebGLRenderTarget} dst
     * @param {{ texture:THREE.Texture, k:number }|null} [ao] */
    render(renderer, src, dst, ao=null){
      mat.uniforms.tSrc.value=src;
      mat.uniforms.tAO.value=ao?.texture ?? null;
      mat.uniforms.uAO.value=ao ? ao.k : 0;
      mat.uniforms.uPx.value.set(1/dst.width, 1/dst.height);
      renderer.setRenderTarget(dst);
      quad.render(renderer);
    },
    dispose(){ mat.dispose(); quad.dispose(); },
  };
}
