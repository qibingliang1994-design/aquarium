import * as THREE from 'three';
import { lerp } from '../utils.js';

/* ================================================================
 * 昼夜：nightK 向 target 缓动；apply(k) 驱动所有灯光、雾、水色、焦散强度
 * 日间水色/雾色/辉光随场景主题替换（setTheme），夜间统一月光表
 * ================================================================ */

const CYCLE_SECS=180;

export function createDayNight({ scene, lights, waterUniforms, sandMat, shell, floorGlowMat, rays, schools, fishRim }){
  const { hoodSpot, hemi, fillLight, waterGlow, rim }=lights;
  const DAY={ spot:16, spotCol:new THREE.Color(0xfff2dc), hemi:0.35, fill:0.5, env:0.45,
    glow:new THREE.Color(0x2e8fb0), glowI:0.9, strip:2.8, bg:new THREE.Color(0x070b10),
    fog:new THREE.Color(0x0a2430), sky:new THREE.Color(0.45,0.62,0.72), deep:new THREE.Color(0.02,0.09,0.13) };
  const NIGHT={ spot:3, spotCol:new THREE.Color(0x9fc4ff), hemi:0.07, fill:0.12, env:0.12,
    glow:new THREE.Color(0x3a6fa8), glowI:0.45, strip:0.5, bg:new THREE.Color(0x030509),
    fog:new THREE.Color(0x061420), sky:new THREE.Color(0.1,0.16,0.28), deep:new THREE.Color(0.005,0.03,0.06) };
  let k=0, target=0;

  function apply(v){
    k=v;
    hoodSpot.intensity=lerp(DAY.spot,NIGHT.spot,k);
    hoodSpot.color.lerpColors(DAY.spotCol,NIGHT.spotCol,k);
    hemi.intensity=lerp(DAY.hemi,NIGHT.hemi,k);
    fillLight.intensity=lerp(DAY.fill,NIGHT.fill,k);
    scene.environmentIntensity=lerp(DAY.env,NIGHT.env,k);
    waterGlow.color.lerpColors(DAY.glow,NIGHT.glow,k);
    waterGlow.intensity=lerp(DAY.glowI,NIGHT.glowI,k);
    scene.background.lerpColors(DAY.bg,NIGHT.bg,k);
    scene.fog.color.lerpColors(DAY.fog,NIGHT.fog,k);
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
    set target(v){ target=v; },
    /** 立即跳到某个状态（启动时恢复存档用） */
    jump(v){ target=v; apply(v); },
    /** 场景主题只改日间表，然后按当前 k 重新应用 */
    setTheme(t){
      DAY.fog.setHex(t.fog); DAY.glow.setHex(t.glow);
      DAY.sky.setRGB(...t.sky); DAY.deep.setRGB(...t.deep);
      apply(k);
    },
    /** 缸体款式：主灯色/强度/高度跟随灯具（夜间月光表不变） */
    setTank(t){
      DAY.spotCol.setHex(t.light.spotCol); DAY.spot=16*t.light.spotK;
      hoodSpot.position.y=t.light.spotY;
      apply(k);
    },
    /** 鱼群重建后补一次（新鱼的焦散强度跟上当前昼夜） */
    refresh(){ apply(k); },
    update(dt, t, cycle){
      if(cycle) target=(1-Math.cos(t*Math.PI*2/CYCLE_SECS))/2;     // 自动昼夜循环
      if(Math.abs(k-target)>1e-3) apply(k+(target-k)*Math.min(1,dt*1.6));
    },
  };
}
