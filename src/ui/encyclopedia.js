import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SPECIES } from '../entities/fish/species.js';
import { scaleNormalTex, finAlphaTex } from '../fish/textures.js';
import { buildFishBody, buildFishFins, profileSampler, fishEyeLayout } from '../fish/body.js';
import { prepareFishModel, decorateFishMaterial } from '../fish/glb-style.js';

/* ---------- 鱼类图鉴数据与视图 ---------- */
export const SPECIES_META={
  tetra:{name:'霓虹脂鲤',latin:'Paracheirodon innesi',className:'tetra',
    desc:'银蓝色的小型群游鱼，成群穿梭在水族箱中层，喂食时反应敏捷。',zone:'中层',size:'3–4 cm',behavior:'群游敏捷',diet:'杂食'},
  gold:{name:'金鱼',latin:'Carassius auratus',className:'gold',
    desc:'橙白相间的圆润居民，动作从容亲人，喜欢在中上层寻找食物。',zone:'中上层',size:'8–12 cm',behavior:'温和好动',diet:'杂食'},
  angel:{name:'蝴蝶鱼',latin:'Chaetodon auriga',className:'angel',
    desc:'高扁身姿的珊瑚礁住客，条纹优雅，泳姿从容大方，是缸中的门面担当。',zone:'中层',size:'10–15 cm',behavior:'温和群居',diet:'杂食'},
  clown:{name:'小丑鱼',latin:'Amphiprion ocellaris',className:'clown',
    desc:'橙白条纹的珊瑚礁明星，喜欢在海葵触手间穿梭安家，活泼好动。',zone:'中层',size:'8–10 cm',behavior:'活泼好动',diet:'杂食'},
  lion:{name:'狮子鱼',latin:'Pterois volitans',className:'lion',
    desc:'鳍条张扬如狮鬃，红白条纹是它的礼服，雍容巡游全缸。',zone:'全层',size:'20–30 cm',behavior:'雍容独游',diet:'肉食'},
  mandarin:{name:'麒麟鱼',latin:'Synchiropus splendidus',className:'mandarin',
    desc:'蓝橙交织的活宝石，底栖缓游，被誉为最美的海水鱼之一。',zone:'底层',size:'6–8 cm',behavior:'害羞慢游',diet:'肉食'},
  parrot:{name:'鹦鹉鱼',latin:'Chlorurus sordidus',className:'parrot',
    desc:'青蓝体色的礁石雕刻家，以藻类为食，温和大群活动。',zone:'中层',size:'25–35 cm',behavior:'温和群游',diet:'植食'},
  koi:{name:'锦鲤',latin:'Cyprinus rubrofuscus',className:'koi',
    desc:'水中活宝石，白底红斑极为吉祥，悠然巡游全缸，是当之无愧的门面。',zone:'全层',size:'40–60 cm',behavior:'从容大方',diet:'杂食'},
  cory:{name:'鼠鱼',latin:'Corydoras paleatus',className:'cory',
    desc:'活跃的底栖清道夫，常在沙地上觅食，用胡须探索每一处角落。',zone:'底层',size:'4–6 cm',behavior:'底栖活跃',diet:'杂食'},
};
const speciesGrid=document.getElementById('speciesGrid');
function renderEncyclopedia(){
  speciesGrid.innerHTML=SPECIES.map(spec=>{
    const m=SPECIES_META[spec.id];
    return `<article class="species-card">
      <div class="species-art ${m.className}"><canvas class="species-preview" data-species="${spec.id}" aria-label="${m.name}三维模型预览"></canvas></div>
      <div class="species-body">
        <div class="species-title"><h3>${m.name}</h3><span class="species-count">${spec.count} 条</span></div>
        <p class="species-latin">${m.latin}</p>
        <p class="species-desc">${m.desc}</p>
        <dl class="species-meta">
          <div><dt>活动水层</dt><dd>${m.zone}</dd></div>
          <div><dt>成鱼体长</dt><dd>${m.size}</dd></div>
          <div><dt>性格</dt><dd>${m.behavior}</dd></div>
          <div><dt>食性</dt><dd>${m.diet}</dd></div>
        </dl>
      </div>
    </article>`;
  }).join('');
  document.getElementById('speciesCount').textContent=SPECIES.length;
}
renderEncyclopedia();
/* ---------- 图鉴模型预览：优先加载本地鱼种 GLB，失败回退程序化鱼体网格 ---------- */
const fishPreviewEntries=new Map();
const glbSpeciesEntries=new Map();
function createFishPreview(spec,canvas){
  const previewScene=new THREE.Scene();
  const bodyGeo=buildFishBody(spec);
  const finGeo=buildFishFins(spec, profileSampler(spec.profileH), profileSampler(spec.profileW));
  const bodyMat=new THREE.MeshPhysicalMaterial({
    vertexColors:true, roughness:spec.rough, metalness:spec.metal, envMapIntensity:0.85,
    normalMap:scaleNormalTex, normalScale:new THREE.Vector2(spec.scaleI,spec.scaleI),
    iridescence:spec.irid, iridescenceIOR:1.3, clearcoat:0.55, clearcoatRoughness:0.35,
  });
  const finMat=new THREE.MeshStandardMaterial({
    vertexColors:true, roughness:0.6, metalness:0.05, transparent:true, opacity:spec.finOpacity,
    alphaMap:finAlphaTex, side:THREE.DoubleSide, depthWrite:false,
  });
  const group=new THREE.Group();
  group.add(new THREE.Mesh(bodyGeo,bodyMat));
  group.add(new THREE.Mesh(finGeo,finMat));
  const eye=fishEyeLayout(spec);
  const eyeGeo=new THREE.SphereGeometry(1,12,8);
  const eyeMat=new THREE.MeshPhysicalMaterial({color:0x111216,roughness:0.22,metalness:0.05,clearcoat:0.9,clearcoatRoughness:0.12});
  for(const side of [1,-1]){
    const e=new THREE.Mesh(eyeGeo,eyeMat);
    e.position.set(side*eye.x,eye.y,eye.z);
    e.scale.setScalar(eye.re*0.74);
    group.add(e);
  }
  group.rotation.y=Math.PI/2;
  group.rotation.x=-0.04;
  previewScene.add(group);
  previewScene.add(new THREE.HemisphereLight(0xbfefff,0x10232c,1.8));
  const key=new THREE.DirectionalLight(0xffffff,2.5); key.position.set(1.5,2.2,3.2); previewScene.add(key);
  const fill=new THREE.DirectionalLight(0x55c9e8,1.35); fill.position.set(-2,0.6,-1.4); previewScene.add(fill);

  const previewRenderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'low-power'});
  previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  previewRenderer.setClearColor(0x000000,0);
  previewRenderer.toneMapping=THREE.ACESFilmicToneMapping;
  previewRenderer.toneMappingExposure=1.08;
  if('outputColorSpace' in previewRenderer) previewRenderer.outputColorSpace=THREE.SRGBColorSpace;
  const previewCamera=new THREE.PerspectiveCamera(28,1,0.01,10);
  previewCamera.position.set(0,0.04,2.2);
  previewCamera.lookAt(0,0,0);

  const bounds=new THREE.Box3().setFromObject(group);
  const size=bounds.getSize(new THREE.Vector3());
  const center=bounds.getCenter(new THREE.Vector3());
  group.position.sub(center);
  group.scale.setScalar(1.28/Math.max(size.x,size.y,size.z));
  const entry={canvas,scene:previewScene,renderer:previewRenderer,camera:previewCamera,group,width:0,height:0};
  fishPreviewEntries.set(spec.id,entry);
  return entry;
}
function resizeFishPreview(entry){
  const width=Math.max(1,Math.round(entry.canvas.clientWidth||360));
  const height=Math.max(1,Math.round(entry.canvas.clientHeight||116));
  if(entry.width===width && entry.height===height) return;
  entry.width=width; entry.height=height;
  entry.renderer.setSize(width,height,false);
  entry.camera.aspect=width/height;
  entry.camera.updateProjectionMatrix();
}
function renderFishPreviews(){
  for(const spec of SPECIES){
    const canvas=speciesGrid.querySelector(`canvas[data-species="${spec.id}"]`);
    if(!canvas) continue;
    if(spec.glb){
      let g=glbSpeciesEntries.get(spec.id);
      if(!g || g.canvas!==canvas){
        g=createModelPreview({id:spec.id, path:spec.glb, name:spec.id}, canvas);
        glbSpeciesEntries.set(spec.id, g);
      }
      resizeModelPreview(g);
      if(!g.loaded && !g.loading && !g.error){ g.loading=true; loadModelPreview(g); }
      if(g.loaded) renderModelPreviewEntry(g);
      continue;
    }
    let entry=fishPreviewEntries.get(spec.id);
    if(!entry || entry.canvas!==canvas) entry=createFishPreview(spec,canvas);
    resizeFishPreview(entry);
    entry.renderer.render(entry.scene,entry.camera);
  }
}
/* ---------- GLB 预览渲染器：图鉴打开时懒加载，失败不影响其余预览 ---------- */
const gltfLoader=new GLTFLoader();
const modelPreviewEntries=new Map();
let modelPreviewRenderer=null;
const modelPreviewCamera=new THREE.PerspectiveCamera(28,1,0.01,10);
modelPreviewCamera.position.set(0,0.04,2.2);
modelPreviewCamera.lookAt(0,0,0);
function ensureModelPreviewRenderer(){
  if(modelPreviewRenderer) return modelPreviewRenderer;
  modelPreviewRenderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});
  modelPreviewRenderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  modelPreviewRenderer.setClearColor(0x000000,0);
  modelPreviewRenderer.toneMapping=THREE.ACESFilmicToneMapping;
  modelPreviewRenderer.toneMappingExposure=1.08;
  return modelPreviewRenderer;
}
function createModelPreview(model,canvas){
  const previewScene=new THREE.Scene();
  previewScene.add(new THREE.HemisphereLight(0xbfefff,0x10232c,1.7));
  const key=new THREE.DirectionalLight(0xffffff,2.4);
  key.position.set(1.5,2.2,3.2); previewScene.add(key);
  const fill=new THREE.DirectionalLight(0x55c9e8,1.15);
  fill.position.set(-2,0.7,-1.4); previewScene.add(fill);
  const context=canvas.getContext('2d');
  const entry={model,canvas,context,scene:previewScene,
    group:null,mixer:null,width:0,height:0,loading:false,loaded:false,error:false};
  modelPreviewEntries.set(model.id,entry);
  return entry;
}
function resizeModelPreview(entry){
  const width=Math.max(1,Math.round(entry.canvas.clientWidth||240));
  const height=Math.max(1,Math.round(entry.canvas.clientHeight||100));
  if(entry.width===width && entry.height===height) return;
  entry.width=width; entry.height=height;
  if(entry.context) entry.context.clearRect(0,0,width,height);
}
function renderModelPreviewEntry(entry){
  if(!entry.loaded || !entry.context) return;
  if(entry.mixer) entry.mixer.update(0.016);
  const renderer=ensureModelPreviewRenderer();
  renderer.setSize(entry.width,entry.height,false);
  modelPreviewCamera.aspect=entry.width/entry.height;
  modelPreviewCamera.updateProjectionMatrix();
  renderer.render(entry.scene,modelPreviewCamera);
  entry.context.clearRect(0,0,entry.width,entry.height);
  entry.context.drawImage(renderer.domElement,0,0,entry.width,entry.height);
}
async function loadModelPreview(entry){
  try{
    const gltf=await gltfLoader.loadAsync(entry.model.path);
    const group=prepareFishModel(gltf.scene, entry.model.id);   // 与水族箱内同一套调色与皮肤
    group.traverse(obj=>{
      if(obj.isMesh){
        obj.visible=true;
        obj.frustumCulled=false;
        obj.castShadow=false;
        obj.receiveShadow=false;
        if(obj.material){
          obj.material.side=THREE.DoubleSide;
          decorateFishMaterial(obj.material);
        }
      }
    });
    const idle=gltf.animations?.find(c=>/swimming_normal/i.test(c.name))
      ||gltf.animations?.find(c=>/swim/i.test(c.name))
      ||gltf.animations?.find(clip=>clip.name.toLowerCase()==='idle')
      ||gltf.animations?.[0];
    if(idle){
      entry.mixer=new THREE.AnimationMixer(group);
      entry.mixer.clipAction(idle).play();
      entry.mixer.update(0.12);
    }
    group.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(group);
    const size=bounds.getSize(new THREE.Vector3());
    const center=bounds.getCenter(new THREE.Vector3());
    const maxSize=Math.max(size.x,size.y,size.z);
    if(!Number.isFinite(maxSize)||maxSize<=0) throw new Error('model has no visible bounds');
    const modelRoot=new THREE.Group();
    modelRoot.add(group);
    group.position.sub(center);
    modelRoot.scale.setScalar(1.38/maxSize);
    // 侧身视角：鱼体长轴沿本地 Z，绕 Y 转到屏幕水平方向，避免正对镜头只看得到鱼头
    modelRoot.rotation.y=Math.PI/2;
    entry.scene.add(modelRoot);
    entry.group=modelRoot;
    entry.loaded=true;
    entry.canvas.setAttribute('aria-label',`${entry.model.name}三维模型预览，已加载`);
    resizeModelPreview(entry);
    renderModelPreviewEntry(entry);
  }catch(err){
    entry.error=true;
    entry.canvas.setAttribute('aria-label',`${entry.model.name}模型加载失败`);
    console.warn(`[fish-model] ${entry.model.name} failed to load`,err);
  }
}
export function renderEncyclopediaPreviews(){
  renderFishPreviews();
}
export function modelPreviewStats(){
  return SPECIES.filter(spec=>spec.glb).map(spec=>{
    const entry=glbSpeciesEntries.get(spec.id);
    return { id:spec.id, loaded:!!(entry&&entry.loaded), error:!!(entry&&entry.error) };
  });
}