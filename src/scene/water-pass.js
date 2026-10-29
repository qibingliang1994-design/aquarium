// @ts-check
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { causticsTex } from './caustics.js';

/* ================================================================
 * 水体合成 + 镜头 pass（v2.2.4 合并：原 water-pass 与 lens-pass 合为一体）
 * 水面不再是场景网格，而是紧跟场景渲染的全屏光线合成——
 *   俯视：波面折射偏移采样场景色 + 菲涅尔混入灯带/房间环境反射
 *   水中：按路径长 exp(-σL) 吸收；沿视线 march 阴影图 + 烘焙焦散网纹的灯内散射（光柱被造景剪影切开；步数随画质档 4..14）
 *   仰视水面：全内反射显示缸内镜像（水面平面镜像 RT，仅相机在水下且位于缸体 x/z 范围内时渲染）
 *   侧玻璃：掠射角变平面镜（左右两块镜像 RT，仅相机整个位于缸内时渲染）
 *   水面贴玻璃处：弯月线
 * 玻璃缸专用；自然水域（池塘/溪流/小河）保留场景网格水面（uWaterOn=0，本 pass 退化为纯镜头）。
 *
 * 合并动机：两个独立全屏 pass 意味着一次全分辨率中间 RT 的写+读（5M 像素下 ~86MB/帧带宽）。
 * 合并后单着色器顺序：折射偏移 → 景深螺旋（围绕偏移后的中心采样，散景与折射物理正确地复合）
 *   → 水体全合成 → 水体纵深雾化。景深螺旋读半分辨率副本（颜色+深度打包），见 lens 注释。
 *
 * 通道结构（避免深度反馈环，这是本项目后期的硬红线）：
 *   RenderPass(场景+深度 → composer A) → 本 pass 读 A 的颜色+深度 + 自己的半分辨率副本，
 *   写 writeBuffer（needsSwap=true）。从不写任何被自己采样的目标；
 *   镜像 RT 渲染期间冻结阴影更新（阴影复用主相机的）。
 * ================================================================ */

/** WAVE_GLSL 的解析梯度（与 water-wave.js 的 waterWave 完全一致，浮叶也贴在同一波面上） */
const GRAD_GLSL = `
vec2 waterGrad(vec2 xz, float t, float flow){
  float qx=xz.x-flow*t*0.9, y=xz.y, a=0.006*uChop;
  return vec2( a*( 7.0*cos(qx*7.0+t*1.3) + 5.0*cos((qx+y)*5.0+t*0.9) ),
               a*( 9.0*cos(y*9.0+t*1.7) + 5.0*cos((qx+y)*5.0+t*0.9) ) );
}`;

/** 景深的弥散圆与螺旋采样都读半分辨率副本（tHalf：rgb=场景色，a=原始深度）：
 *  散焦像素每点 2 次全分辨率随机采样在 4M 像素下带宽爆炸（实测 +29 FPS），
 *  半分辨率让采样量减半且缓存命中翻两番——散景本来就是模糊，视觉无损 */
/** 弥散圆强度（像素 / 屈光度，按 1000 px 画面高归一）与最大半径（像素） */
const DOF_K=26, DOF_MAX=11;
/** 水中每单位路径的雾化系数与上限（上限防止背景整片糊成单色） */
const HAZE_K=0.24, HAZE_MAX=0.42;

/**
 * @param {{ camera:THREE.PerspectiveCamera, scene:THREE.Scene, light:THREE.SpotLight,
 *   waterY:number, box:{min:THREE.Vector3, max:THREE.Vector3},
 *   waterUniforms:any }} opts
 *   waterUniforms：tank.js 的水面 uniforms（uTime/uFlow/uSky/uDeep/uLamp* 直接共享引用，昼夜/款式更新自动流入）
 */
export function createWaterPass({ camera, scene, light, waterY, box, waterUniforms }){
  const u = {
    tScene:{value:/** @type {THREE.Texture|null} */ (null)}, tDepth:{value:/** @type {THREE.Texture|null} */ (null)},
    tHalf:{value:/** @type {THREE.Texture|null} */ (null)},
    uProjInv:{value:new THREE.Matrix4()}, uViewInv:{value:new THREE.Matrix4()},
    uRes:{value:new THREE.Vector2(1,1)}, uCam:{value:new THREE.Vector3()}, uFrame:{value:0},
    // —— 与场景水面共享的 uniform 对象（daynight / setShell / ambience 更新即生效）——
    uTime:waterUniforms.uTime, uFlow:waterUniforms.uFlow, uChop:waterUniforms.uChop,
    uSky:waterUniforms.uSky, uDeep:waterUniforms.uDeep,
    uLampY:waterUniforms.uLampY, uLampHalf:waterUniforms.uLampHalf,
    uLampXZ:waterUniforms.uLampXZ, uLampXZ2:waterUniforms.uLampXZ2,
    uLampCol:waterUniforms.uLampCol, uLampK:waterUniforms.uLampK,
    // —— 水体自己的 ——
    uWaterOn:{value:1}, uTurb:{value:0},              // 开缸浊度 0..1（ambience 每帧写）
    uWaterY:{value:waterY},
    uMin:{value:box.min.clone()}, uMax:{value:box.max.clone()},
    uSigma:{value:new THREE.Vector3(0.5,0.18,0.24)}, uSigmaK:{value:0.4},
    uShafts:{value:0.1}, uShaftCol:{value:new THREE.Vector3(1,0.95,0.85)},
    uSteps:{value:14}, tCau:{value:causticsTex},   // march 步数随画质档缩放；焦散调制用烘好的网纹贴图
    uShadowOn:{value:0}, tShadow:{value:/** @type {THREE.Texture|null} */ (null)}, uShadowM:{value:new THREE.Matrix4()},
    uLightDir:{value:new THREE.Vector3(0.05,-1,0.1)},
    uMirrorOn:{value:0}, tMirror:{value:/** @type {THREE.Texture|null} */ (null)}, uMirrorVP:{value:new THREE.Matrix4()},
    uSideOn:{value:0}, tMirrorL:{value:/** @type {THREE.Texture|null} */ (null)}, tMirrorR:{value:/** @type {THREE.Texture|null} */ (null)},
    uMirrorLVP:{value:new THREE.Matrix4()}, uMirrorRVP:{value:new THREE.Matrix4()},
    // —— 镜头（景深 + 水体纵深雾化；原 lens-pass 迁入）——
    uNear:{value:0.05}, uFar:{value:60},
    uTexel:{value:new THREE.Vector2()}, uScale:{value:1},
    uDofOn:{value:1}, uFocus:{value:5}, uK:{value:DOF_K}, uMaxR:{value:DOF_MAX}, uTaps:{value:24},
    uHazeOn:{value:0}, uColor:{value:new THREE.Color()}, uDensity:{value:HAZE_K}, uMaxMix:{value:HAZE_MAX},
  };

  const mat=new THREE.ShaderMaterial({
    uniforms:u, depthTest:false, depthWrite:false,
    vertexShader:`varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }`,
    fragmentShader:`
      uniform sampler2D tScene, tDepth, tHalf;
      uniform mat4 uProjInv, uViewInv;
      uniform vec2 uRes, uLampHalf, uLampXZ, uLampXZ2, uTexel;
      uniform vec3 uCam, uSky, uDeep, uLampCol, uSigma, uShaftCol, uLightDir, uMin, uMax, uColor;
      uniform float uFrame, uTime, uFlow, uChop, uWaterY, uLampY, uLampK, uSigmaK, uShafts, uShadowOn, uTurb,
                    uMirrorOn, uSideOn, uWaterOn,
                    uNear, uFar, uScale, uDofOn, uFocus, uK, uMaxR, uTaps, uHazeOn, uDensity, uMaxMix;
      uniform mat4 uShadowM, uMirrorVP, uMirrorLVP, uMirrorRVP;
      uniform sampler2D tShadow, tMirror, tMirrorL, tMirrorR, tCau;
      uniform float uSteps;
      varying vec2 vUv;
      ${GRAD_GLSL}
      float ign(vec2 p){ return fract(52.9829189*fract(dot(p, vec2(0.06711056,0.00583715)))); }
      float viewZ(float d){ d=d*2.0-1.0; return 2.0*uNear*uFar/(uFar+uNear-d*(uFar-uNear)); }
      float coc(vec2 uv){ return min(abs(1.0/uFocus-1.0/viewZ(texture2D(tHalf, uv).a))*uK*uScale, uMaxR*uScale); }
      // 光柱用的焦散调制：烘好的 Voronoi 网纹贴图采样（形状与原解析式同一族）
      float cauLite(vec3 w){
        float depth=max(uWaterY-w.y, 0.0);
        vec2 s=w.xz-uLightDir.xz/max(-uLightDir.y,0.2)*depth;
        vec2 p=s*6.2831853/0.35;
        float c=texture2D(tCau, p*0.15915494+vec2(uTime*0.021,uTime*0.017)).r*1.6
               +0.6*texture2D(tCau, (p*0.47+3.1)*0.15915494-vec2(uTime*0.013,-uTime*0.019)).r;
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
        float z=texture2D(tDepth, vUv).x;
        vec4 src=texture2D(tScene, vUv);
        vec3 col=src.rgb;
        if(z>=1.0){ gl_FragColor=vec4(col,1.0); return; }
        vec4 vp=uProjInv*vec4(vec3(vUv,z)*2.0-1.0,1.0);
        vec3 P=(uViewInv*vec4(vp.xyz/vp.w,1.0)).xyz;
        vec3 o=uCam, d=normalize(P-o);
        float tSc=distance(P,o);
        int f0, f1;
        vec2 th=boxHit(o,d,f0,f1);
        float tIn=max(th.x,0.0), tOut=min(th.y,tSc);
        bool inWater=uWaterOn>0.5 && th.y>th.x && tIn<tSc;
        bool fromTop=inWater && th.x>0.0 && f0==1 && d.y<0.0;
        bool outTop=inWater && f1==1 && d.y>0.0 && th.y<tSc;
        // ---- 俯视水面的折射偏移量（先算：景深螺旋要围绕偏移后的中心采样）----
        vec3 pIn=o+d*tIn;
        vec2 refrUv=vUv;
        vec3 refrN=vec3(0.0,1.0,0.0);
        if(fromTop){
          vec2 gr=waterGrad(pIn.xz, uTime, uFlow);
          refrN=normalize(vec3(-gr.x,1.0,-gr.y));
          vec2 off=gr*0.55*clamp((tOut-tIn)*4.0,0.0,1.0);
          refrUv=clamp(vUv+off*vec2(uRes.y/uRes.x,1.0), vec2(0.001), vec2(0.999));
        }
        // ---- 景深：黄金角螺旋聚集，样本只有自己的弥散圆够大才计入（清晰的鱼不被晕到背景上）----
        if(uDofOn>0.5){
          float c0=coc(refrUv);
          if(c0>=0.5){
            vec3 acc=texture2D(tScene, refrUv).rgb;
            float wsum=1.0;
            float taps=max(uTaps, 8.0);
            for(int i=0;i<24;i++){                 // 上限 24（高清档满配），低档提前 break
              if(float(i)>=taps) break;
              float fi=float(i)+0.5;
              float r=sqrt(fi/taps)*c0;            // 螺旋半径按实际点数归一，散点覆盖不变
              float a=fi*2.39996323;
              vec2 uv=refrUv+vec2(cos(a),sin(a))*r*uTexel;
              float w=smoothstep(r-1.0, r+0.5, coc(uv));   // 样本自己的弥散圆覆盖到这里才计入
              acc+=texture2D(tHalf, uv).rgb*w; wsum+=w;
            }
            col=acc/wsum;
          } else col=texture2D(tScene, refrUv).rgb;
        } else col=texture2D(tScene, refrUv).rgb;
        // ---- 俯视水面：菲涅尔混入灯带/房间反射（颜色已带折射偏移与景深）----
        if(fromTop){
          float cosI=max(dot(-d,refrN),0.0);
          float F=0.02+0.98*pow(1.0-cosI,5.0);
          col=col*(1.0-F)+roomEnv(pIn, reflect(d,refrN))*F;
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
        bool outSide=inWater && f1==0 && th.y<tSc;
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
        // ---- 吸收 + 灯内散射（光柱）：march 阴影图 × 焦散调制，HG 相函数 ----
        if(inWater){
          vec3 sig=uSigma*uSigmaK*(1.0+3.0*clamp(uTurb,0.0,1.0));
          vec3 T=exp(-sig*L);
          vec3 S=vec3(0.0);
          // 散射色要亮（青白打底，掺主题水色）；夜间光柱由 uShaftCol 跟随主灯变暗
          vec3 scat=mix(vec3(0.75,0.95,1.0), uSky, 0.45)*1.6;
          if(L>0.02 && uShafts>0.01){
            float n=max(uSteps, 4.0);              // 步数随画质档缩放（dt 跟着放大，积分量不变）
            float j=fract(ign(gl_FragCoord.xy)+uFrame*0.618034);
            float dt=L/n;
            float cosP=dot(uLightDir,-d);
            float ph=0.55;
            float hg=(1.0-ph*ph)/pow(1.0+ph*ph-2.0*ph*cosP,1.5)/12.566;
            float phase=0.35/12.566+hg*0.65;
            for(int i=0;i<14;i++){                 // 上限 14（高清档满配），低档提前 break
              if(float(i)>=n) break;
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
        }
        // ---- 水体纵深雾化（自然水域的水面着色器已按水深处理通透度，玻璃缸由上面的吸收接管；
        //      本段只在 uHazeOn 打开时起效，正常接线恒关，留给调试钩子 haze(on) 做 A/B）----
        if(uHazeOn>0.5){
          float Lh=inWater ? L : 0.0;
          if(!inWater && uWaterOn>0.5){ /* 与水体盒不相交的像素：路径长 0 */ }
          float tb=clamp(uTurb, 0.0, 1.0);
          vec3 hc=mix(uColor, uColor*vec3(1.08,1.04,0.82)+0.03, tb*0.6);
          col=mix(col, hc, min(1.0-exp(-Lh*uDensity*(1.0+3.0*tb)), min(uMaxMix+0.3*tb, 0.8)));
        }
        gl_FragColor=vec4(col,1.0);
      }`,
  });
  const quad=new FullScreenQuad(mat);

  /* ---------- 私有目标：半分辨率副本与三块镜像（减分辨率，条件渲染） ---------- */
  const hdr=(/** @type {number} */ w,/** @type {number} */ h)=>
    new THREE.WebGLRenderTarget(Math.max(1,Math.round(w)),Math.max(1,Math.round(h)),{type:THREE.HalfFloatType,depthBuffer:false});
  const rtHalf=hdr(2,2), rtMirror=hdr(1,1), rtSide=[hdr(1,1), hdr(1,1)];   // 先占位，首帧按绘制缓冲 setSize
  u.tHalf.value=rtHalf.texture;
  // 半分辨率副本的降采样：颜色 + 深度打包进 alpha
  const downMat=new THREE.ShaderMaterial({
    uniforms:{ tDiffuse:{value:null}, tDepth:{value:null} },
    vertexShader:`varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }`,
    fragmentShader:`uniform sampler2D tDiffuse, tDepth; varying vec2 vUv;
      void main(){ gl_FragColor=vec4(texture2D(tDiffuse,vUv).rgb, texture2D(tDepth,vUv).x); }`,
    depthTest:false, depthWrite:false });
  const downQuad=new FullScreenQuad(downMat);
  const _db=new THREE.Vector2();
  /** @param {any} renderer */
  function alloc(renderer){
    renderer.getDrawingBufferSize(_db);
    // 原地 setSize（不重建纹理对象）：tHalf 的引用已挂进主 uniform
    rtHalf.setSize(Math.max(2,Math.round(_db.x/2)), Math.max(2,Math.round(_db.y/2)));
    rtMirror.setSize(Math.max(1,Math.round(_db.x/2)), Math.max(1,Math.round(_db.y/2)));
    rtSide[0].setSize(Math.max(1,Math.round(_db.x*0.55)), Math.max(1,Math.round(_db.y*0.55)));
    rtSide[1].setSize(Math.max(1,Math.round(_db.x*0.55)), Math.max(1,Math.round(_db.y*0.55)));
    u.uRes.value.set(_db.x,_db.y);
    u.uTexel.value.set(1/_db.x, 1/_db.y);
    u.uScale.value=_db.y/1000;
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
  class TankLensPass extends Pass {
    /** @param {any} renderer @param {any} writeBuffer @param {any} readBuffer */
    render(renderer, writeBuffer, readBuffer){
      if(rtHalf.width!==Math.round(renderer.domElement.width/2) || rtHalf.height!==Math.round(renderer.domElement.height/2)) alloc(renderer);
      u.tScene.value=readBuffer.texture;
      u.tDepth.value=readBuffer.depthTexture;
      u.uProjInv.value.copy(camera.projectionMatrixInverse);
      u.uViewInv.value.copy(camera.matrixWorld);
      u.uCam.value.setFromMatrixPosition(camera.matrixWorld);
      u.uNear.value=camera.near; u.uFar.value=camera.far;
      u.uFrame.value=frame++%64;
      // 雾色就是当前水色（昼夜/主题都由 daynight 改 scene.fog.color），稍提亮免得后排发黑
      if(scene.fog) u.uColor.value.copy(scene.fog.color).multiplyScalar(1.35);
      // 主灯：光柱颜色/方向、阴影图（首次阴影渲染前 map 为空 → 光柱退化为无遮挡）
      u.uShaftCol.value.set(light.color.r, light.color.g, light.color.b).multiplyScalar(light.intensity/16);
      u.uLightDir.value.copy(light.target.position).sub(light.position).normalize();
      const sm=/** @type {any} */ (light).shadow;
      if(sm?.map){ u.uShadowOn.value=light.castShadow?1:0; u.tShadow.value=sm.map.texture; u.uShadowM.value.copy(sm.matrix); }
      else u.uShadowOn.value=0;
      // 条件镜像：镜像 = 一整次场景重渲（含全部蒙皮鱼网格），只在着色器真的会采样时才渲。
      // 水面镜像：相机在水下且位于缸体 x/z 范围内；侧玻璃镜像：相机整个位于缸内。
      const cp=camera.position;
      const inXZ=cp.x>box.min.x && cp.x<box.max.x && cp.z>box.min.z && cp.z<box.max.z;
      const below=cp.y<waterY+0.02 && inXZ;
      u.uMirrorOn.value=below?1:0;
      if(below) renderMirror(renderer,'y',waterY,rtMirror,u.uMirrorVP.value);
      u.tMirror.value=rtMirror.texture;
      const inTank=inXZ && cp.y>box.min.y;
      u.uSideOn.value=inTank?1:0;
      if(inTank){
        renderMirror(renderer,'x',box.min.x,rtSide[0],u.uMirrorLVP.value);
        renderMirror(renderer,'x',box.max.x,rtSide[1],u.uMirrorRVP.value);
      }
      u.tMirrorL.value=rtSide[0].texture; u.tMirrorR.value=rtSide[1].texture;
      // 半分辨率副本（景深开着才需要）
      if(u.uDofOn.value>0.5){
        downMat.uniforms.tDiffuse.value=u.tScene.value;
        downMat.uniforms.tDepth.value=readBuffer.depthTexture;
        renderer.setRenderTarget(rtHalf);
        downQuad.render(renderer);
      }
      renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
      quad.render(renderer);
    }
    dispose(){ rtHalf.dispose(); rtMirror.dispose(); rtSide[0].dispose(); rtSide[1].dispose(); mat.dispose(); quad.dispose(); downMat.dispose(); downQuad.dispose(); }
  }
  const pass=new TankLensPass();

  let focus=-1;
  const fv=new THREE.Vector3();
  return Object.assign(pass, {
    uniforms:u,
    /** 光柱强度（画质最低档关） @param {number} k */
    setShafts(k){ u.uShafts.value=k; },
    /** 光柱 march 步数（画质档驱动：高清 14 → 低档 4..7） @param {number} n */
    setSteps(n){ u.uSteps.value=Math.max(4, Math.min(14, Math.round(n))); },
    /** 水体合成开关（自然水域 / 编辑器俯视时关；关时本 pass 退化为纯镜头） @param {boolean} on */
    setWaterOn(on){ u.uWaterOn.value=on?1:0; },
    /** 景深开关 @param {boolean} on */
    setDof(on){ u.uDofOn.value=+on; },
    /** 水体纵深雾化（调试 A/B 用；正常接线恒关——玻璃缸由吸收接管，自然水域水面自管） @param {boolean} on */
    setHaze(on){ u.uHazeOn.value=+on; },
    /** 景深采样点数（画质档驱动：高清 24 → 低档 10） @param {number} n */
    setTaps(n){ u.uTaps.value=Math.max(8, Math.min(24, Math.round(n))); },
    /** 每帧调用：对焦距离平滑拉向目标点（相机到该点的视向距离） @param {THREE.Vector3} target @param {number} dt */
    focusOn(target, dt){
      const want=Math.max(0.2, -fv.copy(target).applyMatrix4(camera.matrixWorldInverse).z);
      focus = focus<0 ? want : focus+(want-focus)*(1-Math.exp(-dt*4));
      u.uFocus.value=focus;
    },
  });
}

/** composer 的两块离屏目标都挂深度纹理（RenderPass 画进哪块由交换顺序决定；镜头段紧跟其后，读的就是本帧深度）
 * @param {any} composer */
export function attachDepth(composer){
  for(const rt of [composer.renderTarget1, composer.renderTarget2]){
    if(rt.depthTexture) continue;
    rt.depthTexture=new THREE.DepthTexture(rt.width, rt.height);
  }
}
