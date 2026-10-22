// @ts-check
import * as THREE from 'three';
import { U } from '../uniforms.js';
import { skyKeys, discDirs, skySignature } from '../systems/sky.js';

/* ================================================================
 * 自然水域的天空穹顶。跟着相机平移（着色器只看方向），不写深度。
 * 环境贴图用同一套颜色渲到 PMREM，签名变了才重建，两次至少隔 0.4 秒，
 * 穹顶本身每帧朝目标色缓动，所以光照是分步交叉，而不是每帧重算。
 * ================================================================ */

const VERT = `
varying vec3 vDir;
void main(){
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = `
varying vec3 vDir;
uniform vec3 uZenith, uHorizon, uCloudCol, uFogCol, uSunDir, uMoonDir;
uniform float uSunVis, uMoonVis, uStar, uCloud, uWind, uTime;

float hash13(vec3 p){
  p = fract(p*0.1031);
  p += dot(p, p.yzx+33.33);
  return fract((p.x+p.y)*p.z);
}
float hash21(vec2 p){
  p = fract(p*vec2(123.34, 345.45));
  p += dot(p, p+34.345);
  return fract(p.x*p.y);
}
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f*f*(3.0-2.0*f);
  return mix(mix(hash21(i), hash21(i+vec2(1.0,0.0)), f.x),
             mix(hash21(i+vec2(0.0,1.0)), hash21(i+vec2(1.0,1.0)), f.x), f.y);
}
void main(){
  vec3 dir = normalize(vDir);
  float h = dir.y*0.5+0.5;
  vec3 col = mix(uHorizon, uZenith, smoothstep(0.0, 0.72, clamp(h, 0.0, 1.0)));
  col = mix(uFogCol, col, smoothstep(-0.08, 0.28, dir.y));
  vec3 sun = normalize(uSunDir), moon = normalize(uMoonDir);
  float sd = dot(dir, sun);
  float disc = smoothstep(0.9985, 0.99955, sd);
  float glow = pow(max(sd, 0.0), 56.0);
  col += vec3(1.0, 0.90, 0.72)*(disc*2.4+glow*0.55)*clamp(uSunVis, 0.0, 1.0);
  float md = dot(dir, moon);
  col += vec3(0.78, 0.84, 0.96)*smoothstep(0.9988, 0.9995, md)*clamp(uMoonVis, 0.0, 1.0)*1.7;
  vec2 cuv = dir.xz/max(dir.y, 0.15)*0.38+vec2(uTime*(0.006+uWind*0.015), uTime*0.003);
  float n = vnoise(cuv)*0.65+vnoise(cuv*2.15+4.2)*0.35;
  float cover = smoothstep(0.64-uCloud*0.5, 0.92-uCloud*0.28, n);
  cover *= smoothstep(0.0, 0.22, dir.y)*clamp(uCloud, 0.0, 1.0);
  col = mix(col, uCloudCol, clamp(cover, 0.0, 1.0));
  float star = step(0.993, hash13(floor(dir*150.0)))*pow(max(dir.y, 0.0), 0.4);
  col += vec3(0.86, 0.91, 1.0)*star*clamp(uStar, 0.0, 1.0)*(1.0-clamp(cover, 0.0, 1.0));
  if(!(col.r<=4.0 && col.g<=4.0 && col.b<=4.0)) col = uZenith;
  gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
}`;

/** @param {{ renderer:THREE.WebGLRenderer, scene:THREE.Scene, hemi:THREE.HemisphereLight }} opts */
export function createSky({ renderer, scene, hemi }){
  const pmrem = new THREE.PMREMGenerator(renderer);
  const roomEnv = scene.environment;
  const hemiSky0 = hemi.color.clone(), hemiGround0 = hemi.groundColor.clone();
  const uniforms = {
    uZenith:{ value:new THREE.Color() }, uHorizon:{ value:new THREE.Color() },
    uCloudCol:{ value:new THREE.Color() }, uFogCol:{ value:new THREE.Color(0.7, 0.8, 0.85) },
    uSunDir:{ value:new THREE.Vector3(0, 1, 0) }, uMoonDir:{ value:new THREE.Vector3(0, 1, 0) },
    uSunVis:{ value:1 }, uMoonVis:{ value:0 }, uStar:{ value:0 }, uCloud:{ value:0 }, uWind:{ value:0 },
    uTime:U.time,
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader:VERT, fragmentShader:FRAG,
    side:THREE.BackSide, depthWrite:false, fog:false, toneMapped:false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), mat);
  dome.scale.setScalar(28);
  dome.frustumCulled = false;
  dome.renderOrder = -10;
  dome.visible = false;
  scene.add(dome);

  const probe = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), mat);
  probe.scale.setScalar(8);
  const skyScene = new THREE.Scene();
  skyScene.add(probe);

  /** @type {boolean|null} */ let force = null;
  let shown = false, sig = '', acc = 1, primed = false;
  /** @type {THREE.Texture|null} */ let envTex = null;
  let kCur = 0;
  const cur = skyKeys(0, {});

  function paint(/** @type {ReturnType<typeof skyKeys>} */ s, /** @type {number[]} */ sun, /** @type {number[]} */ moon){
    uniforms.uZenith.value.setRGB(s.zenith[0], s.zenith[1], s.zenith[2]);
    uniforms.uHorizon.value.setRGB(s.horizon[0], s.horizon[1], s.horizon[2]);
    uniforms.uCloudCol.value.setRGB(s.cloudCol[0], s.cloudCol[1], s.cloudCol[2]);
    uniforms.uSunDir.value.set(sun[0], sun[1], sun[2]);
    uniforms.uMoonDir.value.set(moon[0], moon[1], moon[2]);
    uniforms.uSunVis.value = s.sunVis;
    uniforms.uMoonVis.value = s.moonVis;
    uniforms.uStar.value = s.star;
    uniforms.uCloud.value = s.cloudCover;
    uniforms.uWind.value = s.wind;
    if(/** @type {any} */ (scene).fog?.color) uniforms.uFogCol.value.copy(/** @type {any} */ (scene).fog.color);
  }
  function dampToward(/** @type {ReturnType<typeof skyKeys>} */ t, /** @type {number} */ a){
    const mix = (/** @type {number[]} */ c, /** @type {number[]} */ d)=>{
      c[0] += (d[0]-c[0])*a; c[1] += (d[1]-c[1])*a; c[2] += (d[2]-c[2])*a;
    };
    mix(cur.zenith, t.zenith); mix(cur.horizon, t.horizon); mix(cur.cloudCol, t.cloudCol);
    cur.sunVis += (t.sunVis-cur.sunVis)*a;
    cur.moonVis += (t.moonVis-cur.moonVis)*a;
    cur.star += (t.star-cur.star)*a;
    cur.cloudCover += (t.cloudCover-cur.cloudCover)*a;
    cur.wind += (t.wind-cur.wind)*a;
    cur.sunElev += (t.sunElev-cur.sunElev)*a;
  }
  function rebuild(){
    const prev = envTex;
    const nu = renderer.shadowMap.needsUpdate;
    renderer.shadowMap.needsUpdate = false;
    envTex = pmrem.fromScene(skyScene, 0, 0.1, 40).texture;
    renderer.shadowMap.needsUpdate = nu;
    if(shown) scene.environment = envTex;
    if(prev && prev!==roomEnv) prev.dispose();
  }
  function restoreRoom(){
    if(roomEnv && scene.environment!==roomEnv) scene.environment = roomEnv;
    hemi.color.copy(hemiSky0);
    hemi.groundColor.copy(hemiGround0);
  }

  return {
    dome,
    /** @param {THREE.Vector3} v */
    place(v){ dome.position.copy(v); },
    /** 调试：false 强制关掉（玻璃缸的回归对比）；null 恢复自动 @param {boolean|null} on */
    setForce(on){ force = on; },
    /** @param {number} dt @param {number} nightK @param {any} wx @param {THREE.Vector3} sunPos @param {boolean} natural */
    update(dt, nightK, wx, sunPos, natural){
      const want = natural && force!==false;
      if(!want){
        if(shown){ dome.visible = false; shown = false; restoreRoom(); }
        return;
      }
      dome.visible = true;
      shown = true;
      const a = primed ? 1-Math.exp(-2.6*Math.max(0, Math.min(dt, 0.1))) : 1;
      primed = true;
      kCur += (nightK-kCur)*a;
      dampToward(skyKeys(nightK, wx), a);
      const dirs = discDirs(kCur, [sunPos.x, sunPos.y, sunPos.z]);
      paint(cur, dirs.sun, dirs.moon);
      hemi.color.setRGB(cur.zenith[0], cur.zenith[1], cur.zenith[2]);
      hemi.groundColor.setRGB(cur.horizon[0]*0.45, cur.horizon[1]*0.42, cur.horizon[2]*0.38);
      acc += Math.max(0, dt);
      const next = skySignature(kCur, { cloud:cur.cloudCover, fogAmt:wx.fogAmt, grey:wx.grey, rain:wx.rain, sunMul:wx.sunMul });
      if(next!==sig && acc>=0.4){ sig = next; acc = 0; rebuild(); }
    },
  };
}
