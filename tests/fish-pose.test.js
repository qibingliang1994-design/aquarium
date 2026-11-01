import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { bakeFishPose, vatSelfCheck } from '../src/fish/fish-pose.js';

/** 手工造一条三骨"鱼"：沿 z 排开的细长盒子，骨骼链 z 向，片段让几根骨来回摆。 */
function makeFish(){
  const wrap = new THREE.Group(); wrap.scale.setScalar(0.03);
  const root = new THREE.Group(); root.position.set(0.5, -0.2, 0.1); wrap.add(root);
  const b0 = new THREE.Bone(), b1 = new THREE.Bone(), b2 = new THREE.Bone();
  b0.name = 'B0'; b1.name = 'B1'; b2.name = 'B2';
  b1.position.set(0, 0, -1); b2.position.set(0, 0, -1);
  b0.add(b1); b1.add(b2);
  const geo = new THREE.BoxGeometry(0.4, 0.4, 3, 1, 1, 12).toNonIndexed();
  const n = geo.attributes.position.count, si = new Uint16Array(n*4), sw = new Float32Array(n*4);
  for(let i=0;i<n;i++){
    const z = geo.attributes.position.getZ(i);                    // z∈[-1.5,1.5]：越靠后受 b2 影响越大
    const t = THREE.MathUtils.clamp((1.5 - z)/3, 0, 1);
    si.set([0, 1, 2, 0], i*4); sw.set([1 - t, t*0.6, t*0.4, 0], i*4);
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial());
  mesh.name = 'Body'; mesh.scale.setScalar(100);
  b0.position.set(0, 0, 1);
  root.add(b0, mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton([b0, b1, b2]), mesh.matrixWorld);
  const q = (ang) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang);
  const track = (name, a) => new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, [0, 0.5, 1], [...q(0).toArray(), ...q(a).toArray(), ...q(0).toArray()]);
  const swim = new THREE.AnimationClip('Swim', 1, [track('B1', 0.5), track('B2', -0.7)]);
  const fast = new THREE.AnimationClip('Fast', 0.5, [track('B1', 0.9), track('B2', -1.1)]);
  const bite = new THREE.AnimationClip('Bite', 0.4, [track('B0', 0.3)]);
  return { wrap, swim, fast, bite };
}

describe('骨骼位姿贴图烘焙', () => {
  it('布局：游动/冲刺循环 + 咬食末帧', () => {
    const { wrap, swim, fast, bite } = makeFish();
    const bake = bakeFishPose(wrap, { swim, fast, bite });
    expect(bake).not.toBeNull();
    const s = bake.slots;
    expect(s.swim).toMatchObject({ row:0, loop:true, dur:1 });
    expect(s.fast.row).toBe(s.swim.frames);
    expect(s.bite.row).toBe(s.fast.row + s.fast.frames);
    const tex = bake.parts[0].pose;
    expect(tex.image.height).toBe(s.bite.row + s.bite.frames + 1);   // 单次片段多一行（末帧）
    expect(tex.image.width).toBe(3*4);                                // 3 骨 × 4 列
    expect(bake.baseScale).toBeCloseTo(0.03, 6);
  });

  it('同模板只烘一次（缓存），无游动片段不适用', () => {
    const { wrap, swim } = makeFish();
    expect(bakeFishPose(wrap, { swim, fast:null, bite:null })).toBe(bakeFishPose(wrap, { swim, fast:null, bite:null }));
    expect(bakeFishPose(makeFish().wrap, { swim:null, fast:null, bite:null })).toBeNull();
  });

  it('位姿贴图重建的顶点与 three 自带蒙皮一致（相对误差 < 1e-3）', () => {
    const { wrap, swim, fast, bite } = makeFish();
    const bake = bakeFishPose(wrap, { swim, fast, bite });
    for(const ph of [0, 0.13, 0.37, 0.5, 0.82]){
      const r = vatSelfCheck(bake, wrap, swim, ph);
      expect(r.rel).toBeLessThan(1e-3);
    }
  });

  it('子网格共用同一套骨骼时位姿贴图合并成一张（影子代理的前提）', () => {
    const { wrap, swim } = makeFish();
    const root = wrap.children[0], body = root.children.find(o => o.isSkinnedMesh);
    const twin = new THREE.SkinnedMesh(body.geometry, new THREE.MeshStandardMaterial()); twin.scale.copy(body.scale);
    root.add(twin); twin.bind(body.skeleton, body.bindMatrix);
    const bake = bakeFishPose(wrap, { swim, fast:null, bite:null });
    expect(bake.parts.length).toBe(2);
    expect(bake.sharedPose).toBe(true);
    expect(bake.parts[0].pose).toBe(bake.parts[1].pose);
  });
});
