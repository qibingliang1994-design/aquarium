import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { prepareFishModel } from '../../fish/glb-style.js';

// 物种 → 骨骼动画 GLB（Quaternius，CC0，via poly.pizza）
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
};

// 预加载；返回 map[id]={template,animations}，失败项为 null（School 回退程序化鱼）
export function loadSpeciesModels(species){
  const loader=new GLTFLoader();
  const jobs=species.map(spec=>new Promise(resolve=>{
    const file=FILES[spec.id];
    if(!file) return resolve(null);
    loader.load(file, gltf=>{
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
    }, undefined, err=>{ console.warn('[fish] load fail:', spec.id, (err&&err.message)||err); resolve(null); });
  }));
  return Promise.all(jobs).then(list=>{
    const map={};
    species.forEach((s,i)=>map[s.id]=list[i]);
    return map;
  });
}
