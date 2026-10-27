// @ts-check
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { TANK } from './tank.js';

/* ================================================================
 * 镜头后期（紧跟 RenderPass、在泛光之前，线性 HDR）：景深 + 水体纵深，合在一个 pass 里。
 * 两者都要读场景深度；分成两个 pass 时，第二个会写进挂着这张深度纹理的目标（WebGL 反馈环，整屏黑）。
 *
 * 景深：模拟微距镜头的浅景深。弥散圆按"屈光度差" |1/对焦距离 - 1/深度| 计算——远景机位（对焦 5~9 m，
 *   缸深不到 2 m）几乎全清晰；拉近看鱼时背景自然化开。对焦点由 main 每帧给（默认 OrbitControls 的 target；
 *   点鱼识鱼时对到那条鱼，平滑拉焦）。黄金角螺旋 24 点聚集，样本只有自己的弥散圆够大才计入——
 *   清晰的鱼不会被晕到背景上，背景也不糊进鱼的轮廓。
 * 水体纵深：按视线在缸内水体里穿行的长度往水色里拉——前排清晰饱满，后排水草与背光幕渐渐沉进蓝绿。
 *   深度重建世界坐标，与水体盒（玻璃内侧、水面以下）求交得到水中路径长度；先模糊再按中心像素的深度上雾。
 *   玻璃必须不写深度（tank.js），否则只"看得到"前玻璃。自然水域关闭（水面着色器已按水深处理通透度）。
 * 开缸浊度 uTurb：雾化系数 ×(1+3·浊度)、上限 +0.3（封顶 0.8），雾色偏一点泥沙色。
 * 透明物（气泡、水面）不写深度，取的是其后不透明物的深度——误差很小，可接受。
 * ================================================================ */

const TAPS=24;
/** 弥散圆强度（像素 / 屈光度，按 1000 px 画面高归一）与最大半径（像素） */
const DOF_K=26, DOF_MAX=11;
/** 水中每单位路径的雾化系数与上限（上限防止背景整片糊成单色） */
const HAZE_K=0.24, HAZE_MAX=0.42;

/** @param {THREE.PerspectiveCamera} camera @param {THREE.Scene} scene */
export function createLensPass(camera, scene){
  const g=TANK.glass;
  const mat=new THREE.ShaderMaterial({
    uniforms:{
      tDiffuse:{ value:null }, tDepth:{ value:null },
      uNear:{ value:0.05 }, uFar:{ value:60 },
      uProjInv:{ value:new THREE.Matrix4() }, uViewInv:{ value:new THREE.Matrix4() },
      uTexel:{ value:new THREE.Vector2() }, uScale:{ value:1 },
      uDofOn:{ value:1 }, uFocus:{ value:5 }, uK:{ value:DOF_K }, uMaxR:{ value:DOF_MAX },
      uTaps:{ value:TAPS },   // 采样点数（画质档缩放：低档 10，上限 24）
      uHazeOn:{ value:1 }, uCam:{ value:new THREE.Vector3() }, uColor:{ value:new THREE.Color() },
      uMin:{ value:new THREE.Vector3(-TANK.W/2+g, g, -TANK.D/2+g) },
      uMax:{ value:new THREE.Vector3(TANK.W/2-g, TANK.waterY, TANK.D/2-g) },
      uDensity:{ value:HAZE_K }, uMaxMix:{ value:HAZE_MAX },
      uTurb:{ value:0 },                       // 开缸浊度 0..1（systems/ambience.js 每帧写）：雾化加浓、上限抬高、偏一点泥沙色
    },
    vertexShader:`varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }`,
    fragmentShader:`
      uniform sampler2D tDiffuse, tDepth;
      uniform float uNear, uFar, uScale, uDofOn, uFocus, uK, uMaxR, uHazeOn, uDensity, uMaxMix, uTurb, uTaps;
      uniform mat4 uProjInv, uViewInv;
      uniform vec2 uTexel;
      uniform vec3 uCam, uColor, uMin, uMax;
      varying vec2 vUv;
      float viewZ(float d){ d=d*2.0-1.0; return 2.0*uNear*uFar/(uFar+uNear-d*(uFar-uNear)); }
      float coc(vec2 uv){ return min(abs(1.0/uFocus-1.0/viewZ(texture2D(tDepth, uv).r))*uK*uScale, uMaxR*uScale); }
      void main(){
        vec4 src=texture2D(tDiffuse, vUv);
        vec3 col=src.rgb;
        // 两个效果全关：本 pass 只剩"水体合成上链"的拷贝职责，直出颜色（提前退，省深度采样与采样环）
        if(uDofOn<=0.5 && uHazeOn<=0.5){ gl_FragColor=vec4(col, src.a); return; }
        float d=texture2D(tDepth, vUv).r;
        // ---- 景深 ----
        float c0=uDofOn>0.5 ? coc(vUv) : 0.0;
        if(c0>=0.5){
          vec3 acc=col; float wsum=1.0;
          float taps=max(uTaps, 8.0);
          for(int i=0;i<24;i++){                 // 上限 24（高清档满配），低档提前 break
            if(float(i)>=taps) break;
            float fi=float(i)+0.5;
            float r=sqrt(fi/taps)*c0;            // 螺旋半径按实际点数归一，散点覆盖不变
            float a=fi*2.39996323;
            vec2 uv=vUv+vec2(cos(a),sin(a))*r*uTexel;
            float w=smoothstep(r-1.0, r+0.5, coc(uv));   // 样本自己的弥散圆覆盖到这里才计入
            acc+=texture2D(tDiffuse, uv).rgb*w; wsum+=w;
          }
          col=acc/wsum;
        }
        // ---- 水体纵深：线段 uCam→P 与水体盒求交（slab），得到水中长度 ----
        if(uHazeOn>0.5){
          vec4 vp=uProjInv*vec4(vec3(vUv, d)*2.0-1.0, 1.0);
          vec3 P=(uViewInv*vec4(vp.xyz/vp.w, 1.0)).xyz;
          vec3 dir=P-uCam;
          vec3 inv=vec3(dir.x<0.0?-1.0:1.0, dir.y<0.0?-1.0:1.0, dir.z<0.0?-1.0:1.0)/max(abs(dir), vec3(1e-6));
          vec3 t0=(uMin-uCam)*inv, t1=(uMax-uCam)*inv;
          vec3 tn=min(t0,t1), tf=max(t0,t1);
          float a=clamp(max(max(tn.x,tn.y),tn.z), 0.0, 1.0);
          float b=clamp(min(min(tf.x,tf.y),tf.z), 0.0, 1.0);
          float L=max(b-a, 0.0)*length(dir);
          float tb=clamp(uTurb, 0.0, 1.0);
          vec3 hc=mix(uColor, uColor*vec3(1.08,1.04,0.82)+0.03, tb*0.6);
          col=mix(col, hc, min(1.0-exp(-L*uDensity*(1.0+3.0*tb)), min(uMaxMix+0.3*tb, 0.8)));
        }
        gl_FragColor=vec4(col, src.a);
      }`,
    depthTest:false, depthWrite:false,
  });
  const quad=new FullScreenQuad(mat);
  const u=mat.uniforms;

  class LensPass extends Pass {
    /** @param {number} w @param {number} h */
    setSize(w, h){ u.uTexel.value.set(1/w, 1/h); u.uScale.value=h/1000; }
    /** 水体合成 pass（water-pass.js）开启时，颜色源切到它的输出；深度永远读场景目标（水面网格不写深度，
     *  合成也不写深度，场景深度始终有效）。null = 直接读 readBuffer。切换后重算 enabled：
     *  背着颜色源时即使景深/雾化全关也必须保持启用（见 sync）
     * @param {THREE.Texture|null} tex */
    setSource(tex){ this.sourceTexture=tex; sync(); }
    /** @param {THREE.WebGLRenderer} renderer @param {THREE.WebGLRenderTarget} writeBuffer @param {THREE.WebGLRenderTarget} readBuffer */
    render(renderer, writeBuffer, readBuffer){
      u.tDiffuse.value=this.sourceTexture ?? readBuffer.texture;
      u.tDepth.value=readBuffer.depthTexture;
      u.uNear.value=camera.near; u.uFar.value=camera.far;
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
  const pass=new LensPass();
  let dofOn=true, hazeOn=true, focus=-1;
  const v=new THREE.Vector3();
  // 本 pass 还是水体合成（water-pass.js）进后期链的拷贝段：合成开着时水面网格是藏掉的，
  // 停掉 pass 就等于整个水面消失——所以只要颜色源还接着（rtWater），景深/雾化全关也不能停
  const sync=()=>{ u.uDofOn.value=+dofOn; u.uHazeOn.value=+hazeOn; pass.enabled=dofOn || hazeOn || !!pass.sourceTexture; };
  return Object.assign(pass, {
    uniforms:u,
    /** 景深采样点数（画质档驱动：高清 24 → 低档 10..12） @param {number} n */
    setTaps(n){ u.uTaps.value=Math.max(8, Math.min(24, Math.round(n))); },
    /** @param {boolean} on */
    setDof(on){ dofOn=on; sync(); },
    /** @param {boolean} on */
    setHaze(on){ hazeOn=on; sync(); },
    /** 每帧调用：对焦距离平滑拉向目标点（相机到该点的视向距离） @param {THREE.Vector3} target @param {number} dt */
    focusOn(target, dt){
      const want=Math.max(0.2, -v.copy(target).applyMatrix4(camera.matrixWorldInverse).z);
      focus = focus<0 ? want : focus+(want-focus)*(1-Math.exp(-dt*4));
      u.uFocus.value=focus;
    },
  });
}

/** composer 的两块离屏目标都挂深度纹理（RenderPass 画进哪块由交换顺序决定；镜头 pass 紧跟其后，读的就是本帧深度）
 * @param {any} composer */
export function attachDepth(composer){
  for(const rt of [composer.renderTarget1, composer.renderTarget2]){
    if(rt.depthTexture) continue;
    rt.depthTexture=new THREE.DepthTexture(rt.width, rt.height);
  }
}
