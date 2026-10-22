// @ts-check
import * as THREE from 'three';

/* ================================================================
 * 造景物件绘制批处理（学自 aquarium-editor 的 PlantBatches，实测 Draw Calls -84%）
 * 把场景里大量"同材质的静态小网格"（圆石 / 沉木枝干 / 卵石滩 / 睡莲叶……）
 * 按「材质 + 阴影标志 + 属性签名 + 是否索引」分桶，每桶合成一个 BatchedMesh
 * （WEBGL_multi_draw 多绘制，1 次提交画完全桶）。原网格保留作编辑代理：
 * 批处理激活时隐藏原网格、编辑器打开时拆批恢复原样，拾取/拖拽路径完全不变。
 *
 * 约束与边界：
 * - InstancedMesh（植物丛 / 香蒲 / 触手）本身就是 1 次绘制，不参与批处理
 * - 批内几何必须属性集一致（three _validateGeometry 会抛），故按属性签名分桶
 * - 材质注入的着色器（焦散/摆动/浮叶）都带 USE_BATCHING 分支，世界坐标取值不变
 * - 不支持 WEBGL_multi_draw 的环境自动跳过（保持原网格，无收益也无回归）
 * - 透明材质不批（批内无法逐件排序）；morph / 多材质槽网格不批
 * ================================================================ */

/** 单个网格能否参与批处理；能则返回桶键，不能返回 null。纯函数（可单测）
 * @param {any} mesh */
export function bucketOf(mesh){
  if(!mesh || !mesh.isMesh || mesh.isInstancedMesh) return null;
  const mat=mesh.material;
  if(!mat || Array.isArray(mat) || mat.transparent || mat.visible===false) return null;
  const geo=mesh.geometry;
  if(!geo || !geo.attributes.position) return null;
  if(geo.morphAttributes && Object.keys(geo.morphAttributes).length>0) return null;
  const attrs=Object.keys(geo.attributes).sort()
    .map((/** @type {string} */ k)=>`${k}:${geo.attributes[k].itemSize}`).join(',');
  return `${mat.uuid}|${mesh.castShadow?1:0}${mesh.receiveShadow?1:0}|${geo.index?1:0}|${attrs}`;
}

/** @param {{ renderer:any, parent:THREE.Object3D }} opts parent 通常就是 scene-runtime 的 itemsGroup（无变换） */
export function createItemBatch({ renderer, parent }){
  const supported=renderer.extensions.has('WEBGL_multi_draw');
  /** @type {{ key:string, mesh:any, sources:any[], raws:THREE.Matrix4[] }[]} */ let batches=[];
  let enabled=true;

  function teardown(){
    for(const b of batches){
      b.mesh.removeFromParent();
      b.mesh.dispose();               // 只释放批内部缓冲；原网格几何归 items 生命周期管
      for(const s of b.sources) s.visible=true;
    }
    batches=[];
  }

  /** 与当前批完全一致（同桶同网格同矩阵）则跳过重建，让频繁 apply 不折腾 GPU。
   *  desired 只含"会建批"的 ≥2 件桶（与 batches 一一对应）
   * @param {Map<string, any[]>} desired */
  function unchanged(desired){
    if(batches.length!==desired.size) return false;
    for(const b of batches){
      const list=desired.get(b.key);
      if(!list || list.length!==b.sources.length) return false;
      for(let i=0;i<list.length;i++){
        if(list[i]!==b.sources[i] || !list[i].matrixWorld.equals(b.raws[i])) return false;
      }
    }
    return true;
  }

  /** @param {any[]} roots 场景里全部物件根节点（e.root） */
  function sync(roots){
    if(!enabled || !supported) return;
    /** @type {Map<string, any[]>} */ const buckets=new Map();
    for(const root of roots){
      root.updateMatrixWorld(true);              // place() 里已更新过；这里兜底 onPlace 的局部改动
      root.traverse((/** @type {any} */ o)=>{
        const key=bucketOf(o);
        if(key===null) return;
        const list=buckets.get(key);
        if(list) list.push(o); else buckets.set(key, [o]);
      });
    }
    const multi=new Map([...buckets].filter(([,list])=>list.length>=2));   // 单件桶没有收益，留原网格
    if(unchanged(multi)) return;
    teardown();
    parent.updateWorldMatrix(true, false);
    const inv=parent.matrixWorld.clone().invert();
    const m=new THREE.Matrix4();
    for(const [key, list] of multi){
      let verts=0, idx=0;
      for(const s of list){ verts+=s.geometry.attributes.position.count; idx+=s.geometry.index?.count ?? 0; }
      const first=list[0];
      const batch=new THREE.BatchedMesh(list.length, verts, idx, first.material);
      batch.name='item-batch';
      batch.castShadow=first.castShadow;
      batch.receiveShadow=first.receiveShadow;
      batch.frustumCulled=false;                  // 整缸都在视野里，按实例裁剪的每帧开销不划算
      batch.perObjectFrustumCulled=false;
      batch.sortObjects=false;
      const sources=[], raws=[];
      for(const s of list){
        const gid=batch.addGeometry(s.geometry);  // 数据拷进批内部缓冲（几何仍归物件所有）
        const iid=batch.addInstance(gid);
        batch.setMatrixAt(iid, m.copy(inv).multiply(s.matrixWorld));
        s.visible=false;                          // 原网格转为编辑代理：编辑器打开时恢复
        sources.push(s);
        raws.push(s.matrixWorld.clone());
      }
      parent.add(batch);
      batches.push({ key, mesh:batch, sources, raws });
    }
  }

  return {
    /** 编辑器等需要逐件拾取/改矩阵的场景：拆批恢复原网格
     * @param {boolean} on */
    setEnabled(on){
      if(on===enabled) return;
      enabled=on;
      if(!on) teardown();
    },
    get enabled(){ return enabled; },
    /** @param {any[]} roots */
    resync(roots){ if(enabled) sync(roots); },
    /** 调试/验证用：当前批的构成 */
    stats(){ return batches.map((/** @type {any} */ b)=>({ key:b.key, draws:1, sources:b.sources.length,
      material:b.mesh.material?.name || b.mesh.material?.type || '' })); },
  };
}
