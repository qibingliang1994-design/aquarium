// @ts-check
import * as THREE from 'three';
import { Pass } from 'three/addons/postprocessing/Pass.js';

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
 * @returns {Pass & { target:THREE.WebGLRenderTarget, setScale(k:number):void, setMSAA(n:number):void }}
 */
export function createScaledRenderPass({ scene, camera }){
  const rt=new THREE.WebGLRenderTarget(2,2,{type:THREE.HalfFloatType});
  rt.depthTexture=new THREE.DepthTexture(2,2);
  let scale=1, lastW=2, lastH=2;

  class ScaledRenderPass extends Pass {
    constructor(){ super(); this.needsSwap=false; this.clear=true; }
    /** @param {any} renderer */
    render(renderer){
      renderer.setRenderTarget(rt);
      if(this.clear) renderer.clear();
      renderer.render(scene, camera);
    }
    /** @param {number} w @param {number} h */
    setSize(w, h){
      lastW=w; lastH=h;
      rt.setSize(Math.max(2,Math.round(w*scale)), Math.max(2,Math.round(h*scale)));
    }
    /** 场景渲染尺度（1 = 与画布同分辨率） @param {number} k */
    setScale(k){ scale=Math.min(1,Math.max(0.5,k)); this.setSize(lastW,lastH); }
    /** 场景 RT 的 MSAA（后期链的四边形不需要 MSAA，场景几何边缘要） @param {number} n */
    setMSAA(n){ if(rt.samples!==n){ rt.samples=n; rt.dispose(); } }
    dispose(){ rt.dispose(); }
  }
  const pass=new ScaledRenderPass();
  return Object.assign(pass, { target: rt });
}
