// @ts-check
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { TANK } from './tank.js';

/* ================================================================
 * 水体纵深（后期）：按视线在缸内水体里穿行的长度，把画面往水色里拉——
 * 前排的鱼清晰饱满，后排的水草与背光幕渐渐沉进蓝绿里，缸看起来有"深度"。
 * 用场景深度重建世界坐标，与缸内水体盒（玻璃内侧、水面以下）求交得到水中路径长度；
 * 一个全屏 pass 就够，不用给几十种材质逐个打补丁。
 * 透明物（气泡、玻璃、水面）不写深度，取的是其后不透明物的路径——误差很小，可接受。
 * 自然水域不启用：水面着色器已按水深处理通透度，再叠一层会发闷。
 * ================================================================ */

/** 水中每单位路径的雾化系数与上限（上限防止背景整片糊成单色） */
const DENSITY=0.24, MAX_MIX=0.42;

/** @param {THREE.PerspectiveCamera} camera @param {THREE.Scene} scene */
export function createHazePass(camera, scene){
  const g=TANK.glass;
  const mat=new THREE.ShaderMaterial({
    uniforms:{
      tDiffuse:{ value:null }, tDepth:{ value:null },
      uProjInv:{ value:new THREE.Matrix4() }, uViewInv:{ value:new THREE.Matrix4() },
      uCam:{ value:new THREE.Vector3() },
      uMin:{ value:new THREE.Vector3(-TANK.W/2+g, g, -TANK.D/2+g) },
      uMax:{ value:new THREE.Vector3(TANK.W/2-g, TANK.waterY, TANK.D/2-g) },
      uColor:{ value:new THREE.Color() },
      uDensity:{ value:DENSITY }, uMaxMix:{ value:MAX_MIX },
    },
    vertexShader:`varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }`,
    fragmentShader:`
      uniform sampler2D tDiffuse, tDepth;
      uniform mat4 uProjInv, uViewInv;
      uniform vec3 uCam, uMin, uMax, uColor;
      uniform float uDensity, uMaxMix;
      varying vec2 vUv;
      void main(){
        vec4 src=texture2D(tDiffuse, vUv);
        float d=texture2D(tDepth, vUv).r;
        vec4 vp=uProjInv*vec4(vec3(vUv, d)*2.0-1.0, 1.0);
        vec3 P=(uViewInv*vec4(vp.xyz/vp.w, 1.0)).xyz;
        // 线段 uCam→P 与水体盒求交（slab），得到水中长度
        vec3 dir=P-uCam;
        vec3 inv=vec3(dir.x<0.0?-1.0:1.0, dir.y<0.0?-1.0:1.0, dir.z<0.0?-1.0:1.0)/max(abs(dir), vec3(1e-6));
        vec3 t0=(uMin-uCam)*inv, t1=(uMax-uCam)*inv;
        vec3 tn=min(t0,t1), tf=max(t0,t1);
        float a=clamp(max(max(tn.x,tn.y),tn.z), 0.0, 1.0);
        float b=clamp(min(min(tf.x,tf.y),tf.z), 0.0, 1.0);
        float L=max(b-a, 0.0)*length(dir);
        float k=min(1.0-exp(-L*uDensity), uMaxMix);
        gl_FragColor=vec4(mix(src.rgb, uColor, k), src.a);
      }`,
    depthTest:false, depthWrite:false,
  });
  const quad=new FullScreenQuad(mat);

  class HazePass extends Pass {
    /** @param {THREE.WebGLRenderer} renderer @param {THREE.WebGLRenderTarget} writeBuffer @param {THREE.WebGLRenderTarget} readBuffer */
    render(renderer, writeBuffer, readBuffer){
      const u=mat.uniforms;
      u.tDiffuse.value=readBuffer.texture;
      u.tDepth.value=readBuffer.depthTexture;
      u.uProjInv.value.copy(camera.projectionMatrixInverse);
      u.uViewInv.value.copy(camera.matrixWorld);
      u.uCam.value.setFromMatrixPosition(camera.matrixWorld);
      // 雾色就是当前水色（昼夜/主题都由 daynight 改 scene.fog.color），稍提亮免得后排发黑
      if(scene.fog) u.uColor.value.copy(scene.fog.color).multiplyScalar(1.35);
      renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
      quad.render(renderer);
    }
    dispose(){ mat.dispose(); quad.dispose(); }
  }
  const pass=new HazePass();
  return Object.assign(pass, { uniforms:mat.uniforms });
}

/** composer 的两块离屏目标都要带深度纹理（RenderPass 画进哪块由交换顺序决定） @param {any} composer */
export function attachDepth(composer){
  for(const rt of [composer.renderTarget1, composer.renderTarget2]){
    if(rt.depthTexture) continue;
    rt.depthTexture=new THREE.DepthTexture(rt.width, rt.height);
  }
}
