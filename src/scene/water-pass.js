// @ts-check
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/* ================================================================
 * 水体合成 pass（整体移植自学习项目 SkentSun/aquarium-editor 的 post.js WATER_FS，MIT）：
 * 水面不再是场景网格，而是紧跟场景渲染的全屏光线合成——
 *   俯视：波面折射偏移采样场景色 + 菲涅尔混入灯带/房间环境反射
 *   水中：按路径长 exp(-σL) 吸收；沿视线 14 步 march 阴影图 + 解析焦散网纹的灯内散射（光柱被造景剪影切开）
 *   仰视水面：全内反射显示缸内镜像（水面平面镜像 RT，仅在相机入水时渲染）
 *   侧玻璃：掠射角变平面镜（左右两块镜像 RT，仅在相机位于缸内时渲染）
 *   水面贴玻璃处：弯月线
 * 玻璃缸专用；自然水域（池塘/溪流/小河）保留场景网格水面（岸线/浅滩/白沫依赖水深贴图，盒体模型做不了）。
 *
 * 通道结构（避免深度反馈环，这是本项目后期的硬红线）：
 *   RenderPass(场景+深度 → composer A) → 本 pass 读 A 的颜色+深度、写进自己的 rtWater（needsSwap=false）
 *   → lens pass 的颜色源切到 rtWater、深度仍读 A（场景深度）→ 泛光 → 输出
 * 本 pass 从不写任何被自己采样的目标；镜像 RT 渲染期间冻结阴影更新（阴影复用主相机的）。
 * ================================================================ */

/** WAVE_GLSL 的解析梯度（与 water-wave.js 的 waterWave 完全一致，浮叶也贴在同一波面上） */
const GRAD_GLSL = `
vec2 waterGrad(vec2 xz, float t, float flow){
  float qx=xz.x-flow*t*0.9, y=xz.y;
  return vec2( 0.006*( 7.0*cos(qx*7.0+t*1.3) + 5.0*cos((qx+y)*5.0+t*0.9) ),
               0.006*( 9.0*cos(y*9.0+t*1.7) + 5.0*cos((qx+y)*5.0+t*0.9) ) );
}`;

/** 学习项目的焦散网纹（解析式，2 次调用作光柱调制；MIT） */
const CAU_NET_GLSL = `
float aqCauNet(vec2 p, float t){
  vec2 i=p; float c=1.0; const float inten=0.005;
  for(int n=0;n<4;n++){
    float tt=t*(1.0-(3.5/float(n+1)));
    i=p+vec2(cos(tt-i.x)+sin(tt+i.y), sin(tt-i.y)+cos(tt+i.x));
    c+=1.0/length(vec2(p.x/(sin(i.x+tt)/inten), p.y/(cos(i.y+tt)/inten)));
  }
  c/=4.0; c=1.17-pow(c,1.4);
  return pow(abs(c),7.0);
}`;

/** 玻璃缸内水体盒由构造参数传入（box.min/max，玻璃内侧）；水面高度 waterY */

/**
 * @param {{ camera:THREE.PerspectiveCamera, scene:THREE.Scene, light:THREE.SpotLight,
 *   waterY:number, box:{min:THREE.Vector3, max:THREE.Vector3},
 *   waterUniforms:any, turbUniform:any }} opts
 *   waterUniforms：tank.js 的水面 uniforms（uTime/uFlow/uSky/uDeep/uLamp* 直接共享引用，昼夜/款式更新自动流入）
 *   turbUniform：lens 的 uTurb uniform 对象（开缸浊度共享）
 */
export function createWaterPass({ camera, scene, light, waterY, box, waterUniforms, turbUniform }){
  const u = {
    tScene:{value:/** @type {THREE.Texture|null} */ (null)}, tDepth:{value:/** @type {THREE.Texture|null} */ (null)},
    uProjInv:{value:new THREE.Matrix4()}, uViewInv:{value:new THREE.Matrix4()},
    uRes:{value:new THREE.Vector2(1,1)}, uCam:{value:new THREE.Vector3()}, uFrame:{value:0},
    // —— 与场景水面共享的 uniform 对象（daynight / setShell / ambience 更新即生效）——
    uTime:waterUniforms.uTime, uFlow:waterUniforms.uFlow,
    uSky:waterUniforms.uSky, uDeep:waterUniforms.uDeep,
    uLampY:waterUniforms.uLampY, uLampHalf:waterUniforms.uLampHalf,
    uLampXZ:waterUniforms.uLampXZ, uLampXZ2:waterUniforms.uLampXZ2,
    uLampCol:waterUniforms.uLampCol, uLampK:waterUniforms.uLampK,
    uTurb:turbUniform,
    // —— 本 pass 自己的 ——
    uWaterY:{value:waterY},
    uMin:{value:box.min.clone()}, uMax:{value:box.max.clone()},
    uSigma:{value:new THREE.Vector3(0.5,0.18,0.24)}, uSigmaK:{value:0.4},
    uShafts:{value:0.1}, uShaftCol:{value:new THREE.Vector3(1,0.95,0.85)},
    uShadowOn:{value:0}, tShadow:{value:/** @type {THREE.Texture|null} */ (null)}, uShadowM:{value:new THREE.Matrix4()},
    uLightDir:{value:new THREE.Vector3(0.05,-1,0.1)},
    uMirrorOn:{value:0}, tMirror:{value:/** @type {THREE.Texture|null} */ (null)}, uMirrorVP:{value:new THREE.Matrix4()},
    uSideOn:{value:0}, tMirrorL:{value:/** @type {THREE.Texture|null} */ (null)}, tMirrorR:{value:/** @type {THREE.Texture|null} */ (null)},
    uMirrorLVP:{value:new THREE.Matrix4()}, uMirrorRVP:{value:new THREE.Matrix4()},
  };

  const mat=new THREE.ShaderMaterial({
    uniforms:u, depthTest:false, depthWrite:false,
    vertexShader:`varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }`,
    fragmentShader:`
      uniform sampler2D tScene, tDepth;
      uniform mat4 uProjInv, uViewInv;
      uniform vec2 uRes, uLampHalf, uLampXZ, uLampXZ2;
      uniform vec3 uCam, uSky, uDeep, uLampCol, uSigma, uShaftCol, uLightDir, uMin, uMax;
      uniform float uFrame, uTime, uFlow, uWaterY, uLampY, uLampK, uSigmaK, uShafts, uShadowOn, uTurb,
                    uMirrorOn, uSideOn;
      uniform mat4 uShadowM, uMirrorVP, uMirrorLVP, uMirrorRVP;
      uniform sampler2D tShadow, tMirror, tMirrorL, tMirrorR;
      varying vec2 vUv;
      ${GRAD_GLSL}
      ${CAU_NET_GLSL}
      float ign(vec2 p){ return fract(52.9829189*fract(dot(p, vec2(0.06711056,0.00583715)))); }
      // 光柱用的 2 次网纹（比材质焦散便宜；灯射线穿过水面处取样）
      float cauLite(vec3 w){
        float depth=max(uWaterY-w.y, 0.0);
        vec2 s=w.xz-uLightDir.xz/max(-uLightDir.y,0.2)*depth;
        vec2 p=s*6.2831853/0.35;
        float c=aqCauNet(p, uTime*0.55)+0.6*aqCauNet(p*0.47+3.1, uTime*0.385+1.3);
        return mix(1.0, 0.35+1.1*clamp(c,0.0,2.5), min(uShafts,1.0));
      }
      // 主相机阴影图上的可见性（光柱被石头/沉木/鱼剪影切开）
      float shadowVis(vec3 p){
        if(uShadowOn<0.5) return 1.0;
        vec4 sc=uShadowM*vec4(p,1.0);
        sc.xyz/=sc.w;
        if(sc.x<0.0||sc.x>1.0||sc.y<0.0||sc.y>1.0) return 1.0;
        float d=texture2D(tShadow, sc.xy).x;
        return step(sc.z-0.0035, d);
      }
      // 房间 + 灯带：俯视水面反射的环境（灯带查 A/B 两块矩形，跟随昼夜调光）
      vec3 roomEnv(vec3 o, vec3 r){
        vec3 c=mix(vec3(0.012), vec3(0.04), smoothstep(-0.2,0.7,r.y));
        if(r.y>0.01){
          float t=(uLampY-o.y)/r.y;
          vec2 q=o.xz+r.xz*t;
          vec2 e1=abs(q-uLampXZ)-uLampHalf, e2=abs(q-uLampXZ2)-uLampHalf;
          float hit=max(1.0-smoothstep(0.0,0.05,max(e1.x,e1.y)), 1.0-smoothstep(0.0,0.05,max(e2.x,e2.y)));
          c+=uLampCol*uLampK*0.55*hit*exp(-t*0.08);
        }
        return c;
      }
      vec2 boxHit(vec3 o, vec3 d, out int f0, out int f1){
        vec3 inv=1.0/d;
        vec3 ta=(uMin-o)*inv, tb=(uMax-o)*inv;
        vec3 tmin=min(ta,tb), tmax=max(ta,tb);
        float t0=max(max(tmin.x,tmin.y),tmin.z), t1=min(min(tmax.x,tmax.y),tmax.z);
        f0=tmin.x>=tmin.y&&tmin.x>=tmin.z?0:(tmin.y>=tmin.z?1:2);
        f1=tmax.x<=tmax.y&&tmax.x<=tmax.z?0:(tmax.y<=tmax.z?1:2);
        return vec2(t0,t1);
      }
      void main(){
        vec3 col=texture2D(tScene, vUv).rgb;
        float z=texture2D(tDepth, vUv).x;
        if(z>=1.0){ gl_FragColor=vec4(col,1.0); return; }
        vec4 vp=uProjInv*vec4(vec3(vUv,z)*2.0-1.0,1.0);
        vec3 P=(uViewInv*vec4(vp.xyz/vp.w,1.0)).xyz;
        vec3 o=uCam, d=normalize(P-o);
        float tSc=distance(P,o);
        int f0, f1;
        vec2 th=boxHit(o,d,f0,f1);
        float tIn=max(th.x,0.0), tOut=min(th.y,tSc);
        if(th.y<=th.x || tIn>=tSc){ gl_FragColor=vec4(col,1.0); return; }
        vec3 pIn=o+d*tIn;
        bool fromTop=th.x>0.0 && f0==1 && d.y<0.0;
        bool outTop=f1==1 && d.y>0.0 && th.y<tSc;
        // ---- 俯视水面：折射偏移 + 灯带/房间反射（菲涅尔）----
        if(fromTop){
          vec2 gr=waterGrad(pIn.xz, uTime, uFlow);
          vec3 n=normalize(vec3(-gr.x,1.0,-gr.y));
          vec2 off=gr*0.55*clamp((tOut-tIn)*4.0,0.0,1.0);
          col=texture2D(tScene, clamp(vUv+off*vec2(uRes.y/uRes.x,1.0), vec2(0.001), vec2(0.999))).rgb;
          float cosI=max(dot(-d,n),0.0);
          float F=0.02+0.98*pow(1.0-cosI,5.0);
          col=col*(1.0-F)+roomEnv(pIn, reflect(d,n))*F;
        }
        float L=max(tOut-tIn,0.0);
        // ---- 仰视水面：全内反射显示缸内镜像（镜像 RT 只在相机入水时渲染）----
        if(outTop){
          vec3 h=o+d*th.y;
          vec2 gr=waterGrad(h.xz, uTime, uFlow);
          vec3 n=normalize(vec3(-gr.x,-1.0,-gr.y));
          float cosI=clamp(dot(-d,n),0.0,1.0);
          float sinT=1.333*sqrt(max(1.0-cosI*cosI,0.0));
          float R=1.0;
          if(sinT<1.0){
            float r0=0.02;
            R=r0+(1.0-r0)*pow(1.0-sqrt(max(1.0-sinT*sinT,0.0)),5.0);
            R=mix(R,1.0,smoothstep(0.85,1.0,sinT));
          }
          vec3 refl=col*0.15;
          if(uMirrorOn>0.5){
            vec4 mc=uMirrorVP*vec4(h+vec3(gr.x,0.0,gr.y)*0.06,1.0);
            vec2 muv=clamp(mc.xy/mc.w*0.5+0.5, vec2(0.001), vec2(0.999));
            refl=texture2D(tMirror, muv).rgb;
          }
          refl*=exp(-uSigma*uSigmaK*L*0.9);
          col=mix(col,refl,R);
        }
        // ---- 侧玻璃：缸内看掠射角是平面镜（左右镜像 RT 只在相机入缸时渲染）----
        bool outSide=f1==0 && th.y<tSc;
        if(outSide && uSideOn>0.5){
          vec3 h=o+d*th.y;
          float cosI=abs(d.x);
          float R=1.0-smoothstep(0.6,0.72,cosI);
          if(R>0.0){
            vec4 mc=d.x>0.0 ? uMirrorRVP*vec4(h,1.0) : uMirrorLVP*vec4(h,1.0);
            vec2 muv=clamp(mc.xy/mc.w*0.5+0.5, vec2(0.001), vec2(0.999));
            vec3 refl=d.x>0.0 ? texture2D(tMirrorR,muv).rgb : texture2D(tMirrorL,muv).rgb;
            refl*=exp(-uSigma*uSigmaK*(L+(uMax.x-uMin.x)*0.5));
            col=mix(col,refl,R*0.92);
          }
        }
        // ---- 吸收 + 灯内散射（光柱）：14 步 march，阴影可见性 × 焦散调制，HG 相函数 ----
        vec3 sig=uSigma*uSigmaK*(1.0+3.0*clamp(uTurb,0.0,1.0));
        vec3 T=exp(-sig*L);
        vec3 S=vec3(0.0);
        // 散射色要亮（青白打底，掺主题水色）——用深水色会把光柱吃掉；夜间光柱由 uShaftCol 跟随主灯变暗
        vec3 scat=mix(vec3(0.75,0.95,1.0), uSky, 0.45)*1.6;
        if(L>0.02 && uShafts>0.01){
          const int N=14;
          float j=fract(ign(gl_FragCoord.xy)+uFrame*0.618034);
          float dt=L/float(N);
          float cosP=dot(uLightDir,-d);
          float ph=0.55;
          float hg=(1.0-ph*ph)/pow(1.0+ph*ph-2.0*ph*cosP,1.5)/12.566;
          float phase=0.35/12.566+hg*0.65;
          for(int i=0;i<N;i++){
            float t=(float(i)+j)*dt;
            vec3 p=pIn+d*t;
            float down=max(uWaterY-p.y,0.0);
            S+=uShaftCol*exp(-sig*(down+t))*shadowVis(p)*cauLite(p)*dt;
          }
          S*=phase*uShafts*3.4*scat;
          S+=scat*(1.0-T.g)*0.05*uShafts;   // 深水微弱悬浮纱
        }
        col=col*T+S;
        // ---- 弯月线：水面贴玻璃处一条银线 ----
        if(th.x>0.0 && f0!=1){
          float dy=pIn.y-uWaterY;
          col+=(uLampCol*uLampK*0.8+vec3(0.2))*vec3(0.5,0.55,0.56)
              *(1.0-smoothstep(0.0,0.008,abs(dy+0.004)));
        }
        gl_FragColor=vec4(col,1.0);
      }`,
  });
  const quad=new FullScreenQuad(mat);

  /* ---------- 私有目标：合成结果（全分辨率）与三块镜像（减分辨率，条件渲染） ---------- */
  const hdr=(/** @type {number} */ w,/** @type {number} */ h)=>
    new THREE.WebGLRenderTarget(Math.max(1,Math.round(w)),Math.max(1,Math.round(h)),{type:THREE.HalfFloatType,depthBuffer:false});
  const rtWater=hdr(1,1), rtMirror=hdr(1,1), rtSide=[hdr(1,1), hdr(1,1)];   // 先占位，首帧按绘制缓冲 setSize
  const _db=new THREE.Vector2();
  /** @param {any} renderer */
  function alloc(renderer){
    renderer.getDrawingBufferSize(_db);
    // 原地 setSize（不重建纹理对象）：lens 在模式切换时捕获过 output 引用，重建会让引用失效变黑屏
    rtWater.setSize(_db.x,_db.y);
    rtMirror.setSize(Math.max(1,Math.round(_db.x/2)), Math.max(1,Math.round(_db.y/2)));
    rtSide[0].setSize(Math.max(1,Math.round(_db.x*0.55)), Math.max(1,Math.round(_db.y*0.55)));
    rtSide[1].setSize(Math.max(1,Math.round(_db.x*0.55)), Math.max(1,Math.round(_db.y*0.55)));
    u.uRes.value.set(_db.x,_db.y);
  }

  /* ---------- 平面镜像渲染（学自 aquarium-editor renderMirror）：冻结阴影，复用主相机投影 ---------- */
  const mirrorCam=new THREE.PerspectiveCamera();
  const _v=new THREE.Vector3(), _t=new THREE.Vector3();
  /** @param {any} renderer @param {'x'|'y'} axis @param {number} k @param {any} target @param {THREE.Matrix4} vpOut */
  function renderMirror(renderer, axis, k, target, vpOut){
    mirrorCam.copy(camera);
    camera.getWorldPosition(_v);
    camera.getWorldDirection(_t).add(_v);
    _v[axis]=2*k-_v[axis]; _t[axis]=2*k-_t[axis];
    mirrorCam.position.copy(_v);
    mirrorCam.up.set(0, axis==='y'?-1:1, 0);
    mirrorCam.lookAt(_t);
    mirrorCam.updateMatrixWorld(true);
    const bg=scene.background; scene.background=null;
    const oc=renderer.getClearColor(new THREE.Color()), oa=renderer.getClearAlpha();
    const su=renderer.shadowMap.autoUpdate, sn=renderer.shadowMap.needsUpdate;
    renderer.shadowMap.autoUpdate=false; renderer.shadowMap.needsUpdate=false;   // 镜像复用主相机的阴影
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000,1); renderer.clear();
    renderer.render(scene, mirrorCam);
    renderer.shadowMap.autoUpdate=su; renderer.shadowMap.needsUpdate=sn;
    renderer.setClearColor(oc,oa);
    scene.background=bg;
    vpOut.multiplyMatrices(mirrorCam.projectionMatrix, mirrorCam.matrixWorldInverse);
  }

  let frame=0;
  class WaterPass extends Pass {
    constructor(){ super(); this.needsSwap=false; }
    /** @param {any} renderer @param {any} _writeBuffer @param {any} readBuffer */
    render(renderer, _writeBuffer, readBuffer){
      if(rtWater.width!==renderer.domElement.width || rtWater.height!==renderer.domElement.height) alloc(renderer);
      u.tScene.value=readBuffer.texture;
      u.tDepth.value=readBuffer.depthTexture;
      u.uProjInv.value.copy(camera.projectionMatrixInverse);
      u.uViewInv.value.copy(camera.matrixWorld);
      u.uCam.value.setFromMatrixPosition(camera.matrixWorld);
      u.uFrame.value=frame++%64;
      // 主灯：光柱颜色/方向、阴影图（首次阴影渲染前 map 为空 → 光柱退化为无遮挡）
      u.uShaftCol.value.set(light.color.r, light.color.g, light.color.b).multiplyScalar(light.intensity/16);
      u.uLightDir.value.copy(light.target.position).sub(light.position).normalize();
      const sm=/** @type {any} */ (light).shadow;
      if(sm?.map){ u.uShadowOn.value=light.castShadow?1:0; u.tShadow.value=sm.map.texture; u.uShadowM.value.copy(sm.matrix); }
      else u.uShadowOn.value=0;
      // 条件镜像：相机入水 → 水面镜像；相机在缸内 → 侧玻璃镜像
      const below=camera.position.y<waterY+0.02;
      u.uMirrorOn.value=below?1:0;
      if(below) renderMirror(renderer,'y',waterY,rtMirror,u.uMirrorVP.value);
      u.tMirror.value=rtMirror.texture;
      const inX=camera.position.x>box.min.x && camera.position.x<box.max.x;
      const sideL=inX, sideR=inX;
      u.uSideOn.value=(sideL||sideR)?1:0;
      if(sideL) renderMirror(renderer,'x',box.min.x,rtSide[0],u.uMirrorLVP.value);
      if(sideR) renderMirror(renderer,'x',box.max.x,rtSide[1],u.uMirrorRVP.value);
      u.tMirrorL.value=rtSide[0].texture; u.tMirrorR.value=rtSide[1].texture;
      renderer.setRenderTarget(rtWater);
      quad.render(renderer);
    }
    dispose(){ rtWater.dispose(); rtMirror.dispose(); rtSide[0].dispose(); rtSide[1].dispose(); mat.dispose(); quad.dispose(); }
  }
  const pass=new WaterPass();

  return Object.assign(pass, {
    uniforms:u,
    /** 合成输出（lens 的颜色源；禁用时 lens 自动回退 readBuffer） */
    get output(){ return rtWater.texture; },
    /** 光柱强度（画质最低档关） @param {number} k */
    setShafts(k){ u.uShafts.value=k; },
  });
}
