// @ts-check
import * as THREE from 'three';
import { decorateFishMaterial } from './glb-style.js';
import { VAT_VERT_HEAD } from './vat-glsl.js';
import { ANIM_T, ANIM_W } from './fish-pose.js';

/** @typedef {import('./fish-pose.js').FishBake} FishBake */
/** @typedef {import('./fish-pose.js').ClipSlot} ClipSlot */
import { SHADOW_ONLY_LAYER } from '../scene/shadow-layer.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ================================================================
 * 骨骼动画鱼 → GPU 实例化蒙皮（烘焙骨骼位姿贴图）
 *
 * 旧做法：每条鱼 SkeletonUtils.clone 出 3~6 个 SkinnedMesh，49 条鱼 ≈ 200 次绘制（含阴影 pass 再来一遍），
 * 低配机上 CPU 提交开销占掉大半帧（three 每次绘制都要查程序/传 uniform/绑骨骼贴图）。
 * 新做法：骨骼只有 6 根，动画片段（游动/冲刺/咬食）离线采样成「骨骼 4×3 矩阵 × 帧」的小贴图，
 * 每个物种的每个子网格只画 1 次 InstancedMesh；顶点着色器按实例的相位取两帧矩阵插值再做 4 骨蒙皮，
 * 与 three 自带蒙皮是同一套数学（矩阵已把 bindMatrix / 子网格节点变换合并进去），形变与旧路径一致。
 * 逐实例属性：aAnimT = 三个片段的相位（0..1），aAnimW = 三个片段的混合权重（和为 1）。
 * ================================================================ */

/** 材质里要注入的 uniform（逐子网格各一份） @param {FishBake['parts'][0]} part @param {FishBake['slots']} slots */
function vatUniforms(part, slots){
  const c = (/** @type {ClipSlot|null} */ s)=>({ value:new THREE.Vector4(s?.row ?? 0, s?.frames ?? 1, s?.dur ?? 1, 0) });
  return { uPose:{ value:part.pose }, uC0:c(slots.swim), uC1:c(slots.fast), uC2:c(slots.bite) };
}

export class VatFish {
  /** @param {FishBake} bake @param {{ capacity:number, causticK:any, castShadow:boolean, tint?:boolean }} opts */
  constructor(bake, { capacity, causticK, castShadow, tint=false }){
    this.bake = bake; this.capacity = capacity;
    this.group = new THREE.Group();
    this.matAttr = new THREE.InstancedBufferAttribute(new Float32Array(capacity*16), 16).setUsage(THREE.DynamicDrawUsage);
    this.animT = new THREE.InstancedBufferAttribute(new Float32Array(capacity*4), 4).setUsage(THREE.DynamicDrawUsage);
    this.animW = new THREE.InstancedBufferAttribute(new Float32Array(capacity*4), 4).setUsage(THREE.DynamicDrawUsage);
    /** 逐条微调颜色（锦鲤冷暖差异）：instanceColor 与底色相乘 */
    this.colAttr = tint ? new THREE.InstancedBufferAttribute(new Float32Array(capacity*3).fill(1), 3) : null;
    /** @type {THREE.InstancedMesh[]} */ this.meshes = [];
    /** @type {THREE.BufferGeometry[]} */ this.geos = [];
    for(const part of bake.parts){
      const src = part.geometry;
      const geo = new THREE.BufferGeometry();       // 逐实例属性各物种自己一份；顶点属性与源几何共享（同一份 GPU 缓冲）
      for(const [k, a] of Object.entries(src.attributes)){
        if(k==='skinIndex') geo.setAttribute('aSkI', a);
        else if(k==='skinWeight') geo.setAttribute('aSkW', a);
        else geo.setAttribute(k, a);
      }
      if(src.index) geo.setIndex(src.index);
      geo.setAttribute(ANIM_T, this.animT); geo.setAttribute(ANIM_W, this.animW);
      const uni = vatUniforms(part, bake.slots);
      // 半透明双面材质（鳍）：three 会逐帧把 side 在 Back/Front 间切换并 needsUpdate（每帧重查着色器程序，约占提交开销的 1/10）。
      // 这里拆成固定 Back + Front 两个网格，绘制顺序与结果与原来的"先背面后正面"一致，但不再有版本抖动
      const sides = part.material.transparent ? [THREE.BackSide, THREE.FrontSide] : [THREE.DoubleSide];
      sides.forEach((side, si)=>{
        const mat = part.material.clone();
        mat.side = side;                           // 鳍片是单面几何：双面渲染，避免背向时整片消失
        decorateFishMaterial(mat, { causticK, vat:uni });
        const mesh = new THREE.InstancedMesh(geo, mat, capacity);
        mesh.instanceMatrix = this.matAttr;        // 同物种所有子网格共用一份矩阵缓冲：每帧只上传一次
        if(this.colAttr) mesh.instanceColor = this.colAttr;
        mesh.count = 0;
        mesh.frustumCulled = false;
        mesh.castShadow = castShadow && si===0;    // 两遍只投一次影（阴影按双面）
        if(mesh.castShadow){
          mat.shadowSide = THREE.DoubleSide;
          const dm = new THREE.MeshDepthMaterial({ depthPacking:THREE.RGBADepthPacking });
          dm.customProgramCacheKey = ()=> 'fishvat_depth';
          dm.onBeforeCompile = (/** @type {any} */ sh)=>{
            Object.assign(sh.uniforms, uni);
            sh.vertexShader = VAT_VERT_HEAD + sh.vertexShader.replace('#include <skinning_vertex>',
              'transformed = (vatSkin() * vec4(transformed, 1.0)).xyz;');
          };
          mesh.customDepthMaterial = dm;
        }
        mesh.userData.vatPart = part.name;
        this.group.add(mesh); this.meshes.push(mesh);
      });
      this.geos.push(geo);
    }
    if(castShadow && bake.sharedPose) this._shadowProxy(bake);
  }

  /** 影子代理：所有子网格的位置 + 蒙皮合成一个几何，一次绘制只写深度；真实子网格改为不投影 @param {FishBake} bake */
  _shadowProxy(bake){
    const geos = bake.parts.map(part=>{
      const src = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', src.attributes.position);
      g.setAttribute('aSkI', src.attributes.skinIndex); g.setAttribute('aSkW', src.attributes.skinWeight);
      return g;
    });
    const geo = mergeGeometries(geos, false);
    if(!geo) return;                              // 属性不一致：保持逐子网格投影
    geo.setAttribute(ANIM_T, this.animT); geo.setAttribute(ANIM_W, this.animW);
    const uni = vatUniforms(bake.parts[0], bake.slots);
    const dm = new THREE.MeshDepthMaterial({ depthPacking:THREE.RGBADepthPacking });
    dm.customProgramCacheKey = ()=> 'fishvat_depth';
    dm.onBeforeCompile = (/** @type {any} */ sh)=>{
      Object.assign(sh.uniforms, uni);
      sh.vertexShader = VAT_VERT_HEAD + sh.vertexShader.replace('#include <skinning_vertex>',
        'transformed = (vatSkin() * vec4(transformed, 1.0)).xyz;');
    };
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ side:THREE.DoubleSide }), this.capacity);
    mesh.instanceMatrix = this.matAttr; mesh.count = 0; mesh.frustumCulled = false;
    mesh.castShadow = true; mesh.customDepthMaterial = dm; mesh.material.shadowSide = THREE.DoubleSide;
    mesh.layers.set(SHADOW_ONLY_LAYER);           // 主画面不画，只在阴影 pass 里出现
    mesh.userData.vatShadow = true;
    for(const m of this.meshes) m.castShadow = false;
    this.group.add(mesh); this.meshes.push(mesh); this.geos.push(geo);
  }
  /** @param {number} i @param {number} r @param {number} g @param {number} b */
  setTint(i, r, g, b){ if(!this.colAttr) return; this.colAttr.setXYZ(i, r, g, b); this.colAttr.needsUpdate = true; }
  /** @param {number} n */
  setCount(n){ for(const m of this.meshes) m.count = n; }
  /** 实例矩阵 = 世界变换（位置/朝向/整体缩放），蒙皮后的"包裹节点内"坐标再乘它 @param {number} i @param {THREE.Matrix4} m */
  setMatrix(i, m){ m.toArray(this.matAttr.array, i*16); }
  /** @param {number} i @param {number} tS @param {number} tF @param {number} tB @param {number} wS @param {number} wF @param {number} wB */
  setAnim(i, tS, tF, tB, wS, wF, wB){
    const t = this.animT.array, w = this.animW.array, o = i*4;
    t[o]=tS; t[o+1]=tF; t[o+2]=tB; w[o]=wS; w[o+1]=wF; w[o+2]=wB;
  }
  flush(){ this.matAttr.needsUpdate = true; this.animT.needsUpdate = true; this.animW.needsUpdate = true; }
  dispose(){
    this.group.removeFromParent();
    for(const m of this.meshes) m.customDepthMaterial?.dispose();
    for(const g of this.geos) g.dispose();
  }
}

