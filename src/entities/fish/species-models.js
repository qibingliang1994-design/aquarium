// @ts-check
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { prepareFishModel } from '../../fish/glb-style.js';
import { photoSource } from '../../fish/photo-fish.js';

// 物种 → GLB。两类：
//  照片皮模型（aquarium-editor，MIT）：单网格 + 照片贴图 + 鳍分区与游动参数，走 fish/photo-fish.js 的实例化游动着色器
//  骨骼动画模型（Quaternius，CC0；锦鲤为用户提供）：走 fish-vat.js 的实例化蒙皮
/** @type {Record<string, string>} */
const FILES = {
  tetra: 'fish-models/species/species-neon.glb',
  gold:  'fish-models/species/species-ryukin.glb',
  angel: 'fish-models/species/species-butterfly.glb',
  cory:  'fish-models/species/species-panda.glb',
  koi:   'fish-models/species/species-koi.glb',
  clown: 'fish-models/species/species-clown-photo.glb',   // 照片皮（scripts/photo-fish 由照片生成）；原 Quaternius 卡通模型 species-clown.glb 暂留作对照
  lion:  'fish-models/species/species-lion.glb',
  mandarin: 'fish-models/species/species-mandarin.glb',
  parrot: 'fish-models/species/species-parrot.glb',
  guppy: 'fish-models/species/species-guppy.glb',
  betta: 'fish-models/species/species-betta.glb',
  harlequin: 'fish-models/species/species-harlequin.glb',
  rummy: 'fish-models/species/species-rummy.glb',
  ember: 'fish-models/species/species-ember.glb',
  oto:   'fish-models/species/species-oto.glb',
  ram:   'fish-models/species/species-ram.glb',
  scalare: 'fish-models/species/species-scalare.glb',
  gourami: 'fish-models/species/species-gourami.glb',
};

/** 物种模型路径（图鉴预览与加载共用；没有模型的物种返回 null） @param {string} id */
export const speciesModelPath = id => Object.hasOwn(FILES, id) ? FILES[id] : null;

// 预加载；返回 map[id]={template,animations,photo?}，失败项为 null（School 回退程序化鱼）
// only/skip 用于启动渐进：先等当前场景用到的物种，其余后台补载进同一个 map
/** @param {{ id:string, L:number }[]} species @param {{ only?:string[], skip?:string[] }} [opts] */
export function loadSpeciesModels(species, { only, skip }={}){
  const loader=new GLTFLoader();
  const wanted=species.filter(s=>FILES[s.id] && (!only||only.includes(s.id)) && (!skip||!skip.includes(s.id)));
  const jobs=wanted.map((/** @type {{id:string,L:number}} */ spec)=>new Promise((/** @type {(v:any)=>void} */ resolve)=>{
    loader.load(FILES[spec.id], gltf=>{
      const photo=photoSource(gltf.scene);         // 照片皮：几何/贴图/游动参数原样交给 PhotoFish（头朝 +X，米制，School 按 L 缩放）
      if(photo){ resolve({ template:gltf.scene, animations:[], photo }); return; }
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
