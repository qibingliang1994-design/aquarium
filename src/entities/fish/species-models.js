// @ts-check
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { prepareFishModel } from '../../fish/glb-style.js';

// 物种 → 骨骼动画 GLB（Quaternius，CC0，via poly.pizza）
/** @type {Record<string, string>} */
const FILES = {
  tetra: 'fish-models/species/species-tetra.glb',
  gold:  'fish-models/species/species-goldfish.glb',
  angel: 'fish-models/species/species-butterfly.glb',
  cory:  'fish-models/species/species-cory.glb',
  koi:   'fish-models/species/species-koi.glb',
  clown: 'fish-models/species/species-clown.glb',
  lion:  'fish-models/species/species-lion.glb',
  mandarin: 'fish-models/species/species-mandarin.glb',
  parrot: 'fish-models/species/species-parrot.glb',
  // 照片皮静态模型（aquarium-editor，MIT；无骨骼片段，走 decorateFishMaterial 顶点尾摆）
  guppy: 'fish-models/species/species-guppy.glb',
  betta: 'fish-models/species/species-betta.glb',
  harlequin: 'fish-models/species/species-harlequin.glb',
};

// 体长轴不是 +Z 的模型：头朝 +X（aquarium-editor 的三款静态鱼）。School 用 lookAt 让 +Z 对准游向，
// 尾摆着色器按网格局部 z 从头（+L/2）到尾（-L/2）取波幅——所以加载时把朝向和体长一起烤进几何
const HEAD_X = new Set(['guppy','betta','harlequin']);

/** 头朝 +X 的模型：把网格的节点变换、转向（+X→+Z）与体长 L 烤进几何，网格局部坐标 = 包裹节点坐标（单位与 L 一致）；
 *  其余模型原样返回。图鉴预览也用它，保证侧身视角一致 */
export function orientFishModel(/** @type {any} */ root, /** @type {string} */ id, /** @type {number} */ L){
  if(HEAD_X.has(id)) bakeHeadX(root, L);
  return root;
}
function bakeHeadX(/** @type {any} */ root, /** @type {number} */ L){
  root.updateMatrixWorld(true);
  /** @type {any[]} */ const meshes=[];
  root.traverse((/** @type {any} */ o)=>{ if(o.isMesh) meshes.push(o); });
  const box=new THREE.Box3();
  for(const m of meshes){
    m.geometry=m.geometry.clone().applyMatrix4(m.matrixWorld).rotateY(-Math.PI/2);
    m.geometry.computeBoundingBox(); box.union(m.geometry.boundingBox);
  }
  const k=L/(box.max.z-box.min.z || 1), c=box.getCenter(new THREE.Vector3());
  for(const m of meshes){
    m.geometry.translate(-c.x,-c.y,-c.z).scale(k,k,k);
    m.removeFromParent(); m.position.set(0,0,0); m.quaternion.identity(); m.scale.set(1,1,1);
    root.add(m);
  }
  root.position.set(0,0,0); root.quaternion.identity(); root.scale.set(1,1,1);
  root.updateMatrixWorld(true);
}

// 预加载；返回 map[id]={template,animations}，失败项为 null（School 回退程序化鱼）
// only/skip 用于启动渐进：先等当前场景用到的物种，其余后台补载进同一个 map
/** @param {{ id:string, L:number }[]} species @param {{ only?:string[], skip?:string[] }} [opts] */
export function loadSpeciesModels(species, { only, skip }={}){
  const loader=new GLTFLoader();
  const wanted=species.filter(s=>FILES[s.id] && (!only||only.includes(s.id)) && (!skip||!skip.includes(s.id)));
  const jobs=wanted.map((/** @type {{id:string,L:number}} */ spec)=>new Promise((/** @type {(v:any)=>void} */ resolve)=>{
    loader.load(FILES[spec.id], gltf=>{
      const root=prepareFishModel(gltf.scene, spec.id);   // 调色/平滑法线/湿润皮肤
      orientFishModel(root, spec.id, spec.L);
      root.updateMatrixWorld(true);
      const box=new THREE.Box3().setFromObject(root);
      const size=box.getSize(new THREE.Vector3());
      const center=box.getCenter(new THREE.Vector3());
      root.position.set(-center.x,-center.y,-center.z);
      const wrap=new THREE.Group();
      wrap.add(root);
      wrap.scale.setScalar(spec.L/(size.z||size.x||1));
      resolve({ template:wrap, animations:gltf.animations||[] });
    }, undefined, (/** @type {any} */ err)=>{ console.warn('[fish] load fail:', spec.id, (err&&err.message)||err); resolve(null); });
  }));
  return Promise.all(jobs).then(list=>{
    /** @type {Record<string, any>} */
    const map={};
    wanted.forEach((s,i)=>map[s.id]=list[i]);
    return map;
  });
}
