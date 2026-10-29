// @ts-check
import * as THREE from 'three';
import { OrbitControls }   from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer }  from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }      from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { createGradePass } from './grading.js';

export function createWorld(){
const app = document.getElementById('app'); if(!app) throw new Error('missing #app');
const renderer = new THREE.WebGLRenderer({ antialias:true });
// 触屏设备（手机/平板）GPU 余量小：像素比上限从 2 收到 1.5，交给自动画质阶梯细调
const coarse = matchMedia?.('(pointer:coarse)').matches ?? false;
renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;             // 由 main 的渲染循环按 SHADOW_DT 限频置 needsUpdate
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.98;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070b10);
scene.fog = new THREE.FogExp2(0x0a2430, 0.052);

const camera = new THREE.PerspectiveCamera(45, innerWidth/innerHeight, 0.05, 60);
camera.position.set(0, 2.6, 8.8);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.95, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 1.0;
controls.maxDistance = 11;
controls.maxPolarAngle = Math.PI * 0.49;

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.45;

/* ---------- 灯光 ---------- */
const hemi = new THREE.HemisphereLight(0x8fb8c8, 0x1a1410, 0.35);
scene.add(hemi);

const hoodSpot = new THREE.SpotLight(0xfff2dc, 16, 8, 1.02, 0.88, 2);   // 吊灯光源
hoodSpot.position.set(0, 2.06, -0.15);
hoodSpot.castShadow = true;
hoodSpot.shadow.mapSize.set(1024, 1024);
hoodSpot.shadow.bias = -0.0004;
hoodSpot.shadow.normalBias = 0.02;
hoodSpot.shadow.camera.near = 0.4;
hoodSpot.shadow.camera.far = 6;
const spotTarget = new THREE.Object3D();
spotTarget.position.set(0, 0.7, 0.1);
scene.add(spotTarget);
hoodSpot.target = spotTarget;
scene.add(hoodSpot);

const fillLight = new THREE.DirectionalLight(0xbfd8e0, 0.5);
fillLight.position.set(2, 3, 6);
scene.add(fillLight);

const waterGlow = new THREE.PointLight(0x2e8fb0, 0.9, 5, 2);
waterGlow.position.set(0, 1.45, 0);
scene.add(waterGlow);

const rim = new THREE.DirectionalLight(0x4a6f8a, 0.35);   // 冷色背光，勾轮廓
rim.position.set(-2.5, 2.5, -3.5);
scene.add(rim);

/* ---------- 后期：泛光 ---------- */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.26, 0.55, 0.9);
// 泛光是低频效果：内部 mip 链按最大 768 宽封顶（大窗口/高像素比下省一大截逐像素开销，视觉无感）
const _bloomSetSize=bloom.setSize.bind(bloom);
bloom.setSize=(/** @type {number} */ w,/** @type {number} */ h)=>_bloomSetSize(Math.min(w,768), h*Math.min(1,768/w));
composer.addPass(bloom);
// OutputPass 已并入调色 pass（ACES+sRGB 在 grading.js 里完成）：链尾少一个全屏 pass
composer.addPass(createGradePass());

/** 后期链的 MSAA：antialias:true 只作用于最后贴到画布的全屏四边形，场景本身画在 composer 的离屏目标里，
 * 默认 samples=0 → 细草、吊线、鱼鳍边缘全是锯齿。按像素比开 MSAA（高 DPI 屏本身够细，省掉）。
 * 改 samples 后 dispose，three 会在下次使用时按新采样数重建 @param {number} n */
function setMSAA(n){
  for(const rt of [composer.renderTarget1, composer.renderTarget2]){
    if(rt.samples===n) continue;
    rt.samples=n; rt.dispose();
  }
}
  return { renderer, scene, camera, controls, hemi, hoodSpot, fillLight, waterGlow, composer, bloom, rim, setMSAA };
}
