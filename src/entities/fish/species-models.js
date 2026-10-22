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

// 预加载；返回 map[id]={template,animations}，失败项为 null（School 回退程序化鱼）
// only/skip 用于启动渐进：先等当前场景用到的物种，其余后台补载进同一个 map
/** @param {{ id:string, L:number }[]} species @param {{ only?:string[], skip?:string[] }} [opts] */
export function loadSpeciesModels(species, { only, skip }={}){
  const loader=new GLTFLoader();
  const wanted=species.filter(s=>FILES[s.id] && (!only||only.includes(s.id)) && (!skip||!skip.includes(s.id)));
  const jobs=wanted.map((/** @type {{id:string,L:number}} */ spec)=>new Promise((/** @type {(v:any)=>void} */ resolve)=>{
    loader.load(FILES[spec.id], gltf=>{
      const root=prepareFishModel(gltf.scene, spec.id);   // 调色/平滑法线/湿润皮肤
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
