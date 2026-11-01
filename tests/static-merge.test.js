import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { mergeStaticMeshes } from '../src/scene/static-merge.js';

const box = (mat, x, y = 0, z = 0, cast = true) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
  m.position.set(x, y, z); m.castShadow = cast; return m;
};
const meshesOf = (g) => { const a = []; g.traverse(o => { if (o.isMesh) a.push(o); }); return a; };

describe('静态网格合批', () => {
  it('共用材质的普通网格合成一个，几何烘进组局部坐标', () => {
    const g = new THREE.Group(), mat = new THREE.MeshStandardMaterial();
    g.add(box(mat, -3), box(mat, 3));
    expect(mergeStaticMeshes(g)).toBe(2);
    const ms = meshesOf(g);
    expect(ms.length).toBe(1);
    expect(ms[0].material).toBe(mat);
    ms[0].geometry.computeBoundingBox();
    expect(ms[0].geometry.boundingBox.min.x).toBeCloseTo(-3.5);
    expect(ms[0].geometry.boundingBox.max.x).toBeCloseTo(3.5);
    expect(ms[0].geometry.attributes.position.count).toBe(48);   // 两个盒子的顶点数之和
  });

  it('嵌套子节点按其世界矩阵烘平；投影标记不同的不合并', () => {
    const g = new THREE.Group(), mat = new THREE.MeshStandardMaterial(), sub = new THREE.Group();
    sub.position.set(0, 10, 0); g.add(sub);
    sub.add(box(mat, 1), box(mat, 2));
    g.add(box(mat, 5, 0, 0, false));
    mergeStaticMeshes(g);
    const ms = meshesOf(g);
    expect(ms.length).toBe(2);
    const merged = ms.find(m => m.castShadow);
    merged.geometry.computeBoundingBox();
    expect(merged.geometry.boundingBox.min.y).toBeCloseTo(9.5);   // 父节点的 y=10 被烘进去
  });

  it('透明 / 实例化 / 不同材质的网格保持原样', () => {
    const g = new THREE.Group(), a = new THREE.MeshStandardMaterial(), b = new THREE.MeshStandardMaterial(), t = new THREE.MeshStandardMaterial({ transparent:true });
    g.add(box(a, 0), box(b, 1), box(t, 2), box(t, 3));
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), a, 2); g.add(inst);
    expect(mergeStaticMeshes(g)).toBe(0);
    expect(meshesOf(g).length).toBe(5);
  });

  it('索引与非索引几何混合时统一后合并，不报错', () => {
    const g = new THREE.Group(), mat = new THREE.MeshStandardMaterial();
    const a = box(mat, 0), b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1).toNonIndexed(), mat);
    b.position.x = 4; b.castShadow = true;
    g.add(a, b);
    expect(mergeStaticMeshes(g)).toBe(2);
    expect(meshesOf(g).length).toBe(1);
  });
});
