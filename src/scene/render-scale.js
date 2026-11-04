// @ts-check
import * as THREE from 'three';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { createEdgeAA } from './edge-aa.js';
import { createGTAO } from './gtao.js';

/* ================================================================
 * 渲染尺度分离（render scale）：3D 场景渲进自己的降尺度 RT（画质档驱动 0.6~0.9），
 * 后期链（水体合成/景深/泛光/调色）仍在全画布分辨率跑。
 * 场景是每像素成本的大头（几何边缘在折射/景深/颗粒下本就不锐），降尺度省得最多；
 * 水面、光柱、散景、颗粒保持全分辨率不糊。
 * 尺度 1 时退化为普通 RenderPass（编辑器精细拾取等场景可切回）。
 * 替代 composer 里的 RenderPass；tank-lens pass 直接读本 RT 的颜色+深度。
 * ================================================================ */

/**
 * @param {{ scene:THREE.Scene, camera:THREE.PerspectiveCamera }} opts
 * @returns {Pass & { target:THREE.WebGLRenderTarget, source:{ readonly texture:THREE.Texture, readonly depthTexture:THREE.DepthTexture }, ao:ReturnType<typeof createGTAO>, setScale(k:number):void, setMSAA(n:number):void, setAA(on:boolean):void, setAO(k:number):void, readonly aoK:number }}
 */
export function createScaledRenderPass({ scene, camera }){
  const rt=new THREE.WebGLRenderTarget(2,2,{type:THREE.HalfFloatType});
  rt.depthTexture=new THREE.DepthTexture(2,2);
  // 边缘抗锯齿：场景 RT 不开 MSAA，改在颜色上跑一遍 FXAA（写进 aaRT）；深度仍取场景 RT
  const aaRT=new THREE.WebGLRenderTarget(2,2,{type:THREE.HalfFloatType, depthBuffer:false});
  const aa=createEdgeAA();
  // 环境光遮蔽：只读场景深度，结果在 FXAA 收尾时乘上（所以 AA 关的最低两档也没有 AO）
  const ao=createGTAO({ camera });
  let scale=1, lastW=2, lastH=2, aaOn=true, aoK=0.9;

  class ScaledRenderPass extends Pass {
    constructor(){ super(); this.needsSwap=false; this.clear=true; }
    /** @param {any} renderer */
    render(renderer){
      renderer.setRenderTarget(rt);
      if(this.clear) renderer.clear();
      renderer.render(scene, camera);
      if(!aaOn) return;
      const useAO=aoK>0;
      if(useAO) ao.render(renderer, /** @type {THREE.DepthTexture} */ (rt.depthTexture), rt.width, rt.height);
      aa.render(renderer, rt.texture, aaRT, useAO ? { texture:ao.texture, k:aoK } : null);
    }
    /** @param {number} w @param {number} h */
    setSize(w, h){
      lastW=w; lastH=h;
      const sw=Math.max(2,Math.round(w*scale)), sh=Math.max(2,Math.round(h*scale));
      rt.setSize(sw, sh); aaRT.setSize(sw, sh);
    }
    /** 场景渲染尺度（1 = 与画布同分辨率） @param {number} k */
    setScale(k){ scale=Math.min(1,Math.max(0.5,k)); this.setSize(lastW,lastH); }
    /** 场景 RT 的 MSAA（后期链的四边形不需要 MSAA，场景几何边缘要） @param {number} n */
    setMSAA(n){ if(rt.samples!==n){ rt.samples=n; rt.dispose(); } }
    /** 边缘抗锯齿开关（最低画质档关，省一遍全屏 pass） @param {boolean} on */
    setAA(on){ aaOn=on; }
    /** 环境光遮蔽强度（0 = 关；只在抗锯齿开着的档位生效） @param {number} k */
    setAO(k){ aoK=Math.max(0, Math.min(1, k)); }
    get aoK(){ return aoK; }
    dispose(){ rt.dispose(); aaRT.dispose(); aa.dispose(); ao.dispose(); }
  }
  const pass=new ScaledRenderPass();
  /** 后续 pass 读取的场景颜色（抗锯齿后或原样）+ 深度 */
  const source={ get texture(){ return aaOn ? aaRT.texture : rt.texture; }, get depthTexture(){ return /** @type {THREE.DepthTexture} */ (rt.depthTexture); } };
  return Object.assign(pass, { target: rt, source, ao });
}
