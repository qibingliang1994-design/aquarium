// @ts-check
import * as THREE from 'three';
import { lerp } from '../utils.js';

/* ================================================================
 * 昼夜：nightK 向 target 缓动；apply(k) 驱动所有灯光、雾、水色、焦散强度
 * 日间水色/雾色/辉光随场景主题替换（setTheme），夜间统一月光表
 * ================================================================ */

const CYCLE_SECS=180;

/** 自然水域的太阳位置（指向缸心 spotTarget） */
const SUN={ x:-3.2, y:7.6, z:-2.6 };

/** @param {any} opts */
export function createDayNight({ scene, lights, waterUniforms, sandMat, shell, floorGlowMat, rays, schools, fishRim }){
  const { hoodSpot, hemi, fillLight, waterGlow, rim }=lights;
  const DAY={ spot:16, spotCol:new THREE.Color(0xfff2dc), hemi:0.35, fill:0.5, env:0.45,
    glow:new THREE.Color(0x2e8fb0), glowI:0.9, strip:2.8, bg:new THREE.Color(0x070b10),
    fog:new THREE.Color(0x0a2430), sky:new THREE.Color(0.45,0.62,0.72), deep:new THREE.Color(0.02,0.09,0.13) };
  const NIGHT={ spot:3, spotCol:new THREE.Color(0x9fc4ff), hemi:0.07, fill:0.12, env:0.12,
    glow:new THREE.Color(0x3a6fa8), glowI:0.45, strip:0.5, bg:new THREE.Color(0x030509),
    fog:new THREE.Color(0x061420), sky:new THREE.Color(0.1,0.16,0.28), deep:new THREE.Color(0.005,0.03,0.06) };
  let k=0, target=0;
  // 自然水域的户外环境：天空色/雾色/环境光覆盖日间表（夜间仍是统一的月光表）
  /** @type {any} */ let ENV=null; const envBg=new THREE.Color(), envFog=new THREE.Color();

  function apply(/** @type {number} */ v){
    k=v;
    hoodSpot.intensity=lerp(DAY.spot,NIGHT.spot,k);
    hoodSpot.color.lerpColors(DAY.spotCol,NIGHT.spotCol,k);
    hemi.intensity=lerp(ENV?.hemi ?? DAY.hemi,NIGHT.hemi,k);
    fillLight.intensity=lerp(ENV?.fill ?? DAY.fill,NIGHT.fill,k);
    scene.environmentIntensity=lerp(ENV?.env ?? DAY.env,NIGHT.env,k);
    waterGlow.color.lerpColors(DAY.glow,NIGHT.glow,k);
    waterGlow.intensity=lerp(DAY.glowI,NIGHT.glowI,k);
    scene.background.lerpColors(ENV ? envBg : DAY.bg,NIGHT.bg,k);
    scene.fog.color.lerpColors(ENV ? envFog : DAY.fog,NIGHT.fog,k);
    waterUniforms.uSky.value.lerpColors(DAY.sky,NIGHT.sky,k);
    waterUniforms.uDeep.value.lerpColors(DAY.deep,NIGHT.deep,k);
    rays.setNight(k);
    if(sandMat.userData.causticK) sandMat.userData.causticK.value=lerp(0.7,0.12,k);
    for(const s of schools){ if(s.causticK) s.causticK.value=lerp(0.22,0.06,k); }
    fishRim.k.value=lerp(0.42,0.22,k);                          // 鱼体逆光轮廓夜间减弱
    rim.intensity=lerp(0.35,0.15,k);
    if(shell.lightMat) shell.lightMat.emissiveIntensity=lerp(DAY.strip,NIGHT.strip,k);   // 灯具发光面夜间变暗
    floorGlowMat.opacity=lerp(1,0.45,k);                        // 地面漏光随缸内亮度变化
  }

  return {
    get k(){ return k; },
    get target(){ return target; },
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
      const nat=t.kind==='natural', sh=hoodSpot.shadow.camera;
      if(nat){
        // 自然水域：太阳斜照（后左上方约 30°），近似平行光、不随距离衰减——鱼影斜落在河床上，
        // 而不是正下方被鱼身挡住；也没有"舞台追光"那样的一圈亮斑。亮度按原先正上方灯在河床处的照度折算
        DAY.spot/=(t.light.spotY-0.7)**2;
        hoodSpot.position.set(SUN.x, SUN.y, SUN.z);
        hoodSpot.angle=0.62; hoodSpot.penumbra=0.7; hoodSpot.decay=0; hoodSpot.distance=0;
        sh.near=3; sh.far=16;
      }else{
        hoodSpot.position.set(0, t.light.spotY, -0.15);
        hoodSpot.angle=1.02; hoodSpot.penumbra=0.88; hoodSpot.decay=2; hoodSpot.distance=8;
        sh.near=0.4; sh.far=6;
      }
      sh.updateProjectionMatrix();
      ENV=t.env ?? null;
      if(ENV){ envBg.setHex(ENV.bg); envFog.setHex(ENV.fog); }
      scene.fog.density=ENV?.fogD ?? 0.052;
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
