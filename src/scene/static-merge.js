// @ts-check
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ================================================================
 * 静态网格合批：把一个组内共用同一份材质的不透明普通网格合成一个网格（几何按组局部坐标烘平）。
 * 缸体外壳（框 / 立柱 / 灯罩 / 柜门 / 格栅）是几十个共用材质的小盒子，每个都是一次绘制（阴影 pass 再来一遍），
 * 合并后外观、材质、阴影完全不变，绘制次数按"材质数"算。
 * 不动：透明网格（要逐个按深度排序）、实例化/蒙皮网格、多材质网格、顶点属性不一致的几何。
 * ================================================================ */

/** @param {THREE.Object3D} group @returns {number} 合并掉的网格数 */
export function mergeStaticMeshes(group){
  group.updateMatrixWorld(true);
  const inv=new THREE.Matrix4().copy(group.matrixWorld).invert();
  /** @type {Map<string, THREE.Mesh[]>} */ const buckets=new Map();
  group.traverse((/** @type {any} */ o)=>{
    if(!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || Array.isArray(o.material) || o.material.transparent || o.userData.keepSeparate) return;
    const key=`${o.material.uuid}|${o.castShadow?1:0}${o.receiveShadow?1:0}|${o.renderOrder}`;
    (buckets.get(key) ?? buckets.set(key, []).get(key))?.push(o);
  });
  let merged=0;
  for(const meshes of buckets.values()){
    if(meshes.length<2) continue;
    let geos=meshes.map(m=>{ const g=m.geometry.clone(); g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld)); return g; });
    // 盒子 / 圆角盒子 / 平面的索引与属性集可能不一致：统一成非索引、取属性交集再合并
    if(geos.some(g=>!g.index) && geos.some(g=>g.index)) geos=geos.map(g=>g.index ? g.toNonIndexed() : g);
    const common=Object.keys(geos[0].attributes).filter(k=>geos.every(g=>g.attributes[k]));
    for(const g of geos) for(const k of Object.keys(g.attributes)) if(!common.includes(k)) g.deleteAttribute(k);
    const geo=mergeGeometries(geos, false);
    for(const g of geos) g.dispose();
    if(!geo) continue;                              // 属性集不一致：保持原样
    const first=meshes[0], mesh=new THREE.Mesh(geo, first.material);
    mesh.castShadow=first.castShadow; mesh.receiveShadow=first.receiveShadow; mesh.renderOrder=first.renderOrder;
    mesh.matrixAutoUpdate=false;
    group.add(mesh);
    for(const m of meshes){ m.removeFromParent(); m.geometry.dispose(); }
    merged+=meshes.length;
  }
  return merged;
}
