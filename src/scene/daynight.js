// @ts-check
import * as THREE from 'three';
import { lerp } from '../utils.js';
import { U } from '../uniforms.js';
import { shadowFit } from '../systems/shadow-fit.js';

/* ================================================================
 * 昼夜：nightK 向 target 缓动；apply(k) 驱动所有灯光、雾、水色、焦散强度
 * 日间水色/雾色/辉光随场景主题替换（setTheme），夜间统一月光表
 * ================================================================ */

const CYCLE_SECS=180;
/** 玻璃缸的雾密度（自然水域由 env.fogD 覆盖） */
const FOG_D=0.052;

/** 自然水域的太阳位置（指向缸心 spotTarget） */
const SUN={ x:-3.2, y:7.6, z:-2.6 };
/** 缸底沙面的日间焦散强度（夜间降到 0.07）：0.7 时网纹太抢眼，压到一半左右更通透 */
const SAND_CAUSTIC=0.38;

/** @param {any} opts */
export function createDayNight({ scene, lights, waterUniforms, sandMat, shell, floorGlowMat, schools, fishRim }){
  const { hoodSpot, hemi, fillLight, waterGlow, rim }=lights;
  const DAY={ spot:16, spotCol:new THREE.Color(0xfff2dc), hemi:0.35, fill:0.5, env:0.45,
    glow:new THREE.Color(0x2e8fb0), glowI:0.9, strip:2.8, bg:new THREE.Color(0x070b10),
    fog:new THREE.Color(0x0a2430), sky:new THREE.Color(0.45,0.62,0.72), deep:new THREE.Color(0.02,0.09,0.13) };
  const NIGHT={ spot:3, spotCol:new THREE.Color(0x9fc4ff), hemi:0.07, fill:0.12, env:0.12,
    glow:new THREE.Color(0x3a6fa8), glowI:0.45, strip:0.5, bg:new THREE.Color(0x030509),
    fog:new THREE.Color(0x061420), sky:new THREE.Color(0.1,0.16,0.28), deep:new THREE.Color(0.005,0.03,0.06) };
  let k=0, target=0;
  let lampK=1;                 // 用户灯光亮度倍率（0~1.5，1=默认）：昼夜调光之上再乘
  // 大池塘把阴影纹素吸到格上。0 = 不吸附（玻璃缸 / 小自然水域）
  let snapTexel=0;
  const snapRight=new THREE.Vector3(), snapUp=new THREE.Vector3(), snapProj=new THREE.Matrix4();
  const shadow=/** @type {any} */ (hoodSpot.shadow), origMatrices=shadow.updateMatrices.bind(shadow);
  shadow.updateMatrices=function(/** @type {any} */ light){
    origMatrices(light);
    if(!(snapTexel>0)) return;
    const cam=shadow.camera;
    snapRight.setFromMatrixColumn(cam.matrixWorld, 0);
    snapUp.setFromMatrixColumn(cam.matrixWorld, 1);
    const ox=cam.position.dot(snapRight), oy=cam.position.dot(snapUp);
    const sx=Math.round(ox/snapTexel)*snapTexel, sy=Math.round(oy/snapTexel)*snapTexel;
    if(sx===ox && sy===oy) return;
    cam.position.addScaledVector(snapRight, sx-ox).addScaledVector(snapUp, sy-oy);
    cam.updateMatrixWorld();
    snapProj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    shadow._frustum.setFromProjectionMatrix(snapProj, cam.coordinateSystem, cam.reversedDepth);
    shadow.matrix.set(
      0.5, 0.0, 0.0, 0.5,
      0.0, 0.5, 0.0, 0.5,
      0.0, 0.0, 0.5, 0.5,
      0.0, 0.0, 0.0, 1.0);
    shadow.matrix.multiply(snapProj);
  };
  // 天气倍率：晴天全是 1 / 0，apply 每次从昼夜表重算再乘一次，不会越乘越暗
  const wx={ sunMul:1, hemiMul:1, fogMul:1, chop:1, grey:0, rain:0, fogAmt:0 };
  const greyCol=new THREE.Color();
  // 自然水域的户外环境：天空色/雾色/环境光覆盖日间表（夜间仍是统一的月光表）
  /** @type {any} */ let ENV=null; const envBg=new THREE.Color(), envFog=new THREE.Color();

  function apply(/** @type {number} */ v){
    k=v;
    hoodSpot.intensity=lerp(DAY.spot,NIGHT.spot,k)*lampK*wx.sunMul;
    hoodSpot.color.lerpColors(DAY.spotCol,NIGHT.spotCol,k);
    hemi.intensity=lerp(ENV?.hemi ?? DAY.hemi,NIGHT.hemi,k)*wx.hemiMul;
    fillLight.intensity=lerp(ENV?.fill ?? DAY.fill,NIGHT.fill,k)*wx.hemiMul;
    scene.environmentIntensity=lerp(ENV?.env ?? DAY.env,NIGHT.env,k)*lerp(1, wx.sunMul, 0.55);
    waterGlow.color.lerpColors(DAY.glow,NIGHT.glow,k);
    waterGlow.intensity=lerp(DAY.glowI,NIGHT.glowI,k);
    scene.background.lerpColors(ENV ? envBg : DAY.bg,NIGHT.bg,k);
    scene.fog.color.lerpColors(ENV ? envFog : DAY.fog,NIGHT.fog,k);
    if(wx.grey>1e-4){                              // 0 时不碰颜色：晴天与改前逐值相同
      const lift=lerp(1.15, 0.32, k);
      greyCol.setRGB(0.55*lift, 0.58*lift, 0.62*lift);
      scene.background.lerp(greyCol, wx.grey*0.85);
      scene.fog.color.lerp(greyCol, Math.min(1, wx.grey*0.55+wx.fogAmt*0.45));
    }
    waterUniforms.uSky.value.lerpColors(DAY.sky,NIGHT.sky,k);
    waterUniforms.uDeep.value.lerpColors(DAY.deep,NIGHT.deep,k);
    if(sandMat.userData.causticK) sandMat.userData.causticK.value=lerp(SAND_CAUSTIC,0.07,k);
    for(const s of schools){ if(s.causticK) s.causticK.value=lerp(0.22,0.06,k); }
    fishRim.k.value=lerp(0.42,0.22,k);                          // 鱼体逆光轮廓夜间减弱
    rim.intensity=lerp(0.35,0.15,k);
    if(shell.lightMat) shell.lightMat.emissiveIntensity=lerp(DAY.strip,NIGHT.strip,k)*lampK;   // 灯具发光面夜间变暗
    waterUniforms.uLampK.value=lerp(1,0.22,k)*lampK;   // 水面的灯带反射/弯月线跟着灯具一起调光
    floorGlowMat.opacity=Math.min(1, lerp(1,0.45,k)*lampK);     // 地面漏光随缸内亮度变化
  }

  return {
    get k(){ return k; },
    get target(){ return target; },
    /** 当前用户灯光亮度倍率（设置面板滑杆） */
    get lamp(){ return lampK; },
    /** 用户灯光亮度（0~1.5，1=默认）：只缩放缸灯本体（主灯/灯带发光/水面灯带反射/地面漏光） */
    setLamp(/** @type {number} */ v){
      lampK=Math.min(1.5, Math.max(0, Number.isFinite(v) ? v : 1));
      apply(k);
    },
    /** 当前水域的基础雾密度（开缸浊度在它之上加浓；天气再乘 fogMul，晴天 = 1） */
    get fogD(){ return (ENV?.fogD ?? FOG_D)*wx.fogMul; },
    /** 叠一层天气。每帧从昼夜表重算，晴天倍率是 1
     * @param {{ sunMul:number, hemiMul:number, fogMul:number, chop:number, grey:number, rain:number, fogAmt:number }} f */
    setWeather(f){
      wx.sunMul=f.sunMul; wx.hemiMul=f.hemiMul; wx.fogMul=f.fogMul; wx.chop=f.chop;
      wx.grey=f.grey; wx.rain=f.rain; wx.fogAmt=f.fogAmt;
      U.chop.value=f.chop;
      apply(k);
    },
    set target(/** @type {number} */ v){ target=v; },
    /** 立即跳到某个状态（启动时恢复存档用） */
    jump(/** @type {number} */ v){ target=v; apply(v); },
    /** 场景主题只改日间表，然后按当前 k 重新应用 */
    setTheme(/** @type {any} */ t){
      DAY.fog.setHex(t.fog); DAY.glow.setHex(t.glow);
      DAY.sky.setRGB(.../** @type {[number,number,number]} */ (t.sky));
      DAY.deep.setRGB(.../** @type {[number,number,number]} */ (t.deep));
      apply(k);
    },
    /** 缸体款式：主灯色/强度/高度跟随灯具（夜间月光表不变） */
    setTank(/** @type {any} */ t){
      DAY.spotCol.setHex(t.light.spotCol); DAY.spot=16*t.light.spotK;
      const nat=t.kind==='natural', sh=hoodSpot.shadow.camera, sun=t.light.sun;
      snapTexel=0;
      hoodSpot.shadow.focus=1;
      if(sun){
        // 大场景的太阳自己带位置和张角。不能再除 (spotY-0.7)²——灯一抬高亮度就没了
        hoodSpot.position.set(sun.pos[0], sun.pos[1], sun.pos[2]);
        hoodSpot.angle=sun.angle; hoodSpot.penumbra=sun.penumbra; hoodSpot.decay=sun.decay; hoodSpot.distance=sun.distance;
        sh.near=sun.near; sh.far=sun.far;
        hoodSpot.shadow.bias=-0.0012; hoodSpot.shadow.normalBias=0.05;
        hoodSpot.target.position.set(0, 0.35, 0);
        if(sun.fit){
          // 照射张角不动，只把阴影相机收到池塘上，并按纹素吸附
          const fit=shadowFit(
            { x:sun.pos[0], y:sun.pos[1], z:sun.pos[2] },
            { x:0, y:0.35, z:0 }, sun.fit, hoodSpot.shadow.mapSize.width || 1024);
          hoodSpot.shadow.focus=Math.min(1, fit.angle/Math.max(0.05, hoodSpot.angle));
          sh.near=fit.near; sh.far=fit.far;
          snapTexel=fit.texel;
        }
      }else if(nat){
        // 自然水域：太阳斜照（后左上方约 30°），近似平行光、不随距离衰减——鱼影斜落在河床上，
        // 而不是正下方被鱼身挡住；也没有"舞台追光"那样的一圈亮斑。亮度按原先正上方灯在河床处的照度折算
        DAY.spot/=(t.light.spotY-0.7)**2;
        hoodSpot.position.set(SUN.x, SUN.y, SUN.z);
        hoodSpot.angle=0.62; hoodSpot.penumbra=0.7; hoodSpot.decay=0; hoodSpot.distance=0;
        sh.near=3; sh.far=16;
        hoodSpot.shadow.bias=-0.0004; hoodSpot.shadow.normalBias=0.02;
        hoodSpot.target.position.set(0, 0.7, 0.1);
      }else{
        hoodSpot.shadow.bias=-0.0004; hoodSpot.shadow.normalBias=0.02;
        hoodSpot.target.position.set(0, 0.7, 0.1);
        hoodSpot.position.set(0, t.light.spotY, -0.15);
        hoodSpot.angle=1.02; hoodSpot.penumbra=0.88; hoodSpot.decay=2; hoodSpot.distance=8;
        sh.near=0.4; sh.far=6;
      }
      sh.updateProjectionMatrix();
      ENV=t.env ?? null;
      if(ENV){ envBg.setHex(ENV.bg); envFog.setHex(ENV.fog); }
      scene.fog.density=(ENV?.fogD ?? FOG_D)*wx.fogMul;
      apply(k);
    },
    /** 鱼群重建后补一次（新鱼的焦散强度跟上当前昼夜） */
    refresh(){ apply(k); },
    update(/** @type {number} */ dt, /** @type {number} */ t, /** @type {boolean} */ cycle){
      if(cycle) target=(1-Math.cos(t*Math.PI*2/CYCLE_SECS))/2;     // 自动昼夜循环
      if(Math.abs(k-target)>1e-3) apply(k+(target-k)*Math.min(1,dt*1.6));
    },
  };
}
