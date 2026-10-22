import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { bucketOf, createItemBatch } from '../src/scenes/item-batch.js';

// 几何构造在 Node 下可用（无 WebGL 依赖）；bucketOf 是纯函数，只看网格自身属性
function mesh(geo, mat, props = {}) {
  const m = new THREE.Mesh(geo, mat);
  Object.assign(m, props);
  return m;
}
const stdMat = () => new THREE.MeshStandardMaterial({ vertexColors: true });

describe('bucketOf 造景物件分桶', () => {
  it('同材质 + 同属性签 + 同阴影标志 → 同一桶', () => {
    const mat = stdMat();
    const a = mesh(new THREE.IcosahedronGeometry(1, 1), mat, { castShadow: true, receiveShadow: true });
    const b = mesh(new THREE.IcosahedronGeometry(1, 2), mat, { castShadow: true, receiveShadow: true });
    expect(bucketOf(a)).toBe(bucketOf(b));
    expect(bucketOf(a)).toBeTruthy();
  });

  it('不同材质 → 不同桶', () => {
    const g = new THREE.IcosahedronGeometry(1, 1);
    expect(bucketOf(mesh(g, stdMat()))).not.toBe(bucketOf(mesh(g, stdMat())));
  });

  it('属性集不同 → 不同桶（three 批内要求属性一致）', () => {
    const mat = stdMat();
    const plain = new THREE.IcosahedronGeometry(1, 1);          // position/normal/uv
    const noUv = new THREE.IcosahedronGeometry(1, 1); noUv.deleteAttribute('uv');
    expect(bucketOf(mesh(plain, mat))).not.toBe(bucketOf(mesh(noUv, mat)));
    // 属性集合相同、itemSize 相同 → 同桶（名字排序后逐项比较）
    const noUv2 = new THREE.IcosahedronGeometry(1, 2); noUv2.deleteAttribute('uv');
    expect(bucketOf(mesh(noUv, mat))).toBe(bucketOf(mesh(noUv2, mat)));
  });

  it('阴影标志不同 → 不同桶（批是整桶 castShadow，不能混）', () => {
    const mat = stdMat(), g = new THREE.IcosahedronGeometry(1, 1);
    expect(bucketOf(mesh(g, mat, { castShadow: true }))).not.toBe(bucketOf(mesh(g, mat, { castShadow: false })));
    expect(bucketOf(mesh(g, mat, { receiveShadow: true }))).not.toBe(bucketOf(mesh(g, mat, { receiveShadow: false })));
  });

  it('InstancedMesh（植物丛等，本身已是 1 次绘制）不参与', () => {
    const im = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), stdMat(), 4);
    expect(bucketOf(im)).toBeNull();
  });

  it('透明材质 / 多材质槽 / morph / 不可见材质不参与', () => {
    const g = new THREE.IcosahedronGeometry(1, 1);
    expect(bucketOf(mesh(g, new THREE.MeshStandardMaterial({ transparent: true })))).toBeNull();
    const hidden = stdMat(); hidden.visible = false;
    expect(bucketOf(mesh(g, hidden))).toBeNull();
    const multi = mesh(g, [stdMat(), stdMat()]);
    expect(bucketOf(multi)).toBeNull();
    const morphed = new THREE.IcosahedronGeometry(1, 1);
    morphed.morphAttributes.position = [new THREE.Float32BufferAttribute([0, 0, 0], 3)];
    expect(bucketOf(mesh(morphed, stdMat()))).toBeNull();
  });

  it('索引与非索引几何分开（three 要求批内一致）', () => {
    const mat = stdMat();
    const indexed = new THREE.SphereGeometry(1, 12, 8);        // Sphere 自带索引
    const nonIndexed = indexed.toNonIndexed();
    expect(indexed.index).toBeTruthy();
    expect(bucketOf(mesh(indexed, mat))).not.toBe(bucketOf(mesh(nonIndexed, mat)));
  });
});

describe('createItemBatch 合批生命周期（Node 下 BatchedMesh 纯 JS，可无渲染器验证）', () => {
  const fakeRenderer = { extensions: { has: name => name === 'WEBGL_multi_draw' } };

  function rig() {
    const parent = new THREE.Group();
    const batch = createItemBatch({ renderer: fakeRenderer, parent });
    const mat = stdMat();
    // 两个物件根，各带 1 个同材质网格（圆石场景的缩影）+ 1 个孤立单件（不批）
    const makeItem = (x) => {
      const root = new THREE.Group();
      root.position.set(x, 0, 0);
      const m = mesh(new THREE.SphereGeometry(0.2, 10, 8), mat, { castShadow: true, receiveShadow: true });
      root.add(m);
      parent.add(root);
      root.updateMatrixWorld(true);
      return { root, m };
    };
    return { parent, batch, mat, a: makeItem(-1), b: makeItem(1) };
  }

  it('同桶 ≥2 件 → 合成一个批，原网格隐藏；单件桶留原样', () => {
    const { parent, batch, a, b } = rig();
    batch.resync([a.root, b.root]);
    const stats = batch.stats();
    expect(stats).toHaveLength(1);
    expect(stats[0].sources).toBe(2);
    expect(parent.children.filter(c => c.name === 'item-batch')).toHaveLength(1);
    expect(a.m.visible).toBe(false);
    expect(b.m.visible).toBe(false);
  });

  it('批矩阵 = 批父节点逆 × 网格世界矩阵', () => {
    const { parent, batch, a, b } = rig();
    batch.resync([a.root, b.root]);
    const bm = parent.children.find(c => c.name === 'item-batch');
    expect(bm).toBeTruthy();
    const inv = parent.matrixWorld.clone().invert();
    const got = new THREE.Matrix4(), want = new THREE.Matrix4();
    bm.getMatrixAt(0, got);
    want.copy(inv).multiply(a.m.matrixWorld);   // 物件根在 x=-1 → 批实例平移 -1
    expect(got.equals(want)).toBe(true);
    expect(got.elements[12]).toBeCloseTo(-1, 5);
  });

  it('状态未变时 resync 跳过重建（批对象保持同一个）', () => {
    const { parent, batch, a, b } = rig();
    batch.resync([a.root, b.root]);
    const before = parent.children.find(c => c.name === 'item-batch');
    batch.resync([a.root, b.root]);
    const after = parent.children.find(c => c.name === 'item-batch');
    expect(after).toBe(before);
  });

  it('移动物件后 resync 重批，矩阵跟随新位置', () => {
    const { parent, batch, a, b } = rig();
    batch.resync([a.root, b.root]);
    const before = parent.children.find(c => c.name === 'item-batch');
    a.root.position.x = -2;
    a.root.updateMatrix();
    a.root.updateMatrixWorld(true);
    batch.resync([a.root, b.root]);
    const after = parent.children.find(c => c.name === 'item-batch');
    expect(after).not.toBe(before);            // 矩阵变了 → 重建
    const got = new THREE.Matrix4();
    after.getMatrixAt(0, got);
    expect(got.elements[12]).toBeCloseTo(-2, 5);   // 平移 x 分量进了批矩阵
  });

  it('setEnabled(false) 拆批并恢复原网格可见（编辑器进入路径）', () => {
    const { parent, batch, a, b } = rig();
    batch.resync([a.root, b.root]);
    batch.setEnabled(false);
    expect(batch.stats()).toHaveLength(0);
    expect(parent.children.filter(c => c.name === 'item-batch')).toHaveLength(0);
    expect(a.m.visible).toBe(true);
    expect(b.m.visible).toBe(true);
  });

  it('不支持 multi_draw 的环境整体跳过（无回归回退）', () => {
    const parent = new THREE.Group();
    const batch = createItemBatch({ renderer: { extensions: { has: () => false } }, parent });
    const mat = stdMat();
    const root = new THREE.Group(), m1 = mesh(new THREE.SphereGeometry(1, 8, 6), mat), m2 = mesh(new THREE.SphereGeometry(1, 8, 6), mat);
    root.add(m1, m2); parent.add(root); root.updateMatrixWorld(true);
    batch.resync([root]);
    expect(batch.stats()).toHaveLength(0);
    expect(m1.visible).toBe(true);
  });
});
