// @ts-check
import * as THREE from 'three';
import { makeRng, rrange, clamp } from '../utils.js';
import { sandHeight } from '../scene/tank.js';
import { groundY } from '../scene/ground.js';
import { SPECIES } from '../entities/fish/species.js';
import { School } from '../entities/fish/school.js';
import { createCare } from '../systems/care.js';
import { buildItem, disposeItem } from './catalog.js';
import { createItemBatch } from './item-batch.js';
import { createContactShadows } from './contact-shadow.js';
import { THEMES } from './themes.js';
import { TANK_STYLES } from './tank-styles.js';
import { careKey } from './scene-store.js';
import { cloneDoc, FISH_MAX, FISH_TOTAL_MAX } from './scene-doc.js';
import { ITEM_META } from './item-meta.js';
import { boundsFor } from './tank-bounds.js';
import { shoreLod } from '../systems/shore-lod.js';
import { lanternGlow, fireflyMat } from './items/shore.js';

/* ================================================================
 * 场景运行时：把场景文档落到 three 场景里，并做增量更新
 * - 物件：每件一个根节点（userData.itemId），移动/旋转/缩放只改变换，换 seed/type 才重建
 * - obstacles / schools 数组原地修改（鱼群、识鱼卡片等持有的是同一个引用）
 * - air：第一个气石的位置（气泡发射点），没有气石时 air.on=false
 * - 饲养存档按场景隔离（careKey），切场景时落盘旧的、读取新的
 * ================================================================ */

const GRAVEL_N=56;

/** @param {any} opts */
export function createSceneRuntime({ tankGroup, tank, glbMap, schools, obstacles, air, renderer, onTheme, onTank, onSchools }){
  const contact=createContactShadows(tankGroup, groundY);
  const itemsGroup=new THREE.Group();
  itemsGroup.name='scene-items';
  tankGroup.add(itemsGroup);
  // 静态物件绘制批处理：同材质网格合批（Draw Calls 大减）；编辑器打开时拆批恢复逐件交互
  const batch=createItemBatch({ renderer, parent:itemsGroup });
  const rootsOf=()=>[...live.values()].map((/** @type {any} */ e)=>e.root);
  /** @type {Map<string, { item:any, root:THREE.Group, local:{c:THREE.Vector3,r:number}[], ext:{x:number,z:number}, lim:{x:number,z:number}, shadow?:THREE.Mesh|null }>} */
  const live=new Map();
  /** @type {any} */ let doc=null;
  /** @type {any} */ let care=null;
  let shoreLevel=0;

  /* ---------- 碎石（主题配色，位置固定） ---------- */
  const gravel=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),   // 圆润卵石（十二面体太像碎块）
    new THREE.MeshStandardMaterial({vertexColors:false, roughness:0.9}), GRAVEL_N);
  {
    const rng=makeRng(7), m=new THREE.Matrix4(), q=new THREE.Quaternion(), s=new THREE.Vector3(), pv=new THREE.Vector3(), ax=new THREE.Vector3();
    for(let i=0;i<GRAVEL_N;i++){
      const x=rrange(rng,-2.1,2.1), z=rrange(rng,-0.78,0.78), sc=rrange(rng,0.012,0.034);
      q.setFromAxisAngle(ax.set(rng()-0.5,rng()-0.5,rng()-0.5).normalize(), rng()*6.283);
      s.set(sc,sc*rrange(rng,0.55,0.8),sc);
      pv.set(x, sandHeight(x,z)+sc*0.35, z);
      gravel.setMatrixAt(i, m.compose(pv,q,s));
      gravel.setColorAt(i, new THREE.Color(1,1,1));
    }
    gravel.receiveShadow=true;
    tankGroup.add(gravel);
  }
  const boxOf=()=>boundsFor(doc?.tank ?? 'classic');

  function setTheme(/** @type {string} */ id){
    const t=THEMES[id] ?? THEMES.fresh, c=new THREE.Color();
    tank.setSandColors(t.sand[0], t.sand[1], t.sandTex);
    tank.setBackdrop(t.backdrop, t.art);
    for(let i=0;i<GRAVEL_N;i++) gravel.setColorAt(i, c.setHex(t.gravel[(i*7)%t.gravel.length]));
    if(gravel.instanceColor) gravel.instanceColor.needsUpdate=true;
    onTheme?.(t);
  }

  /* ---------- 物件 ---------- */
  // 物件局部满幅（含 InstancedMesh 的每个实例）：build 时根节点还没有变换，量出来的就是本体的包络
  function localExtents(/** @type {any} */ object){
    const box=new THREE.Box3();
    object.updateMatrixWorld(true);
    object.traverse((/** @type {any} */ o)=>{
      if(o.isInstancedMesh){ if(!o.boundingBox) o.computeBoundingBox(); box.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld)); }
      else if(o.geometry){ if(!o.geometry.boundingBox) o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)); }
    });
    return { x:Math.max(Math.abs(box.min.x),Math.abs(box.max.x)), z:Math.max(Math.abs(box.min.z),Math.abs(box.max.z)) };
  }
  /** 中心点允许范围：玻璃内壁 − 真实包络（含旋转/缩放，水草加摆动余量）。
   *  岸边物件在 shore 大于水面摆放框时改收到岸线内。数据侧估算见 item-meta.placeLimits */
  function limitsOf(/** @type {any} */ e){
    const it=e.item, c=Math.abs(Math.cos(it.rot)), sn=Math.abs(Math.sin(it.rot));
    const meta=ITEM_META[it.type];
    const pad=(meta?.group==='plant') ? 0.09 : 0.03;
    const b=boxOf();
    const hx=(e.ext.x*c+e.ext.z*sn)*it.s+pad, hz=(e.ext.x*sn+e.ext.z*c)*it.s+pad;
    const land=!!meta?.land && (b.shore.x>b.place.x+1e-4 || b.shore.z>b.place.z+1e-4);
    if(land) return { x:Math.max(0.15, b.shore.x-hx), z:Math.max(0.15, b.shore.z-hz) };
    return { x:Math.min(b.place.x, Math.max(0.15, b.glassInner.x-hx)),
             z:Math.min(b.place.z, Math.max(0.15, b.glassInner.z-hz)) };
  }
  function place(/** @type {any} */ e){
    const it=e.item;
    e.lim=limitsOf(e);
    it.x=clamp(it.x,-e.lim.x,e.lim.x);   // 写回运行时副本：旧存档里贴边的物件在这里被拉回缸内，
    it.z=clamp(it.z,-e.lim.z,e.lim.z);   // 接地暗斑也跟着钳制后的位置贴沙面
    const y=groundY(it.x,it.z);
    e.root.position.set(it.x, y, it.z);
    e.root.rotation.set(0, it.rot, 0);
    e.root.scale.setScalar(it.s);
    e.root.children[0]?.userData.onPlace?.((boxOf().waterY-y)/it.s);   // 睡莲/香蒲按到水面的局部高度伸展
    e.root.updateMatrix();
    e.root.updateMatrixWorld(true);
    e.shadow=contact.fit(it, e.shadow ?? null);   // 接地暗斑跟着位置/缩放重贴沙面
  }
  function build(/** @type {any} */ item){
    const { object, obstacles:local }=buildItem(item.type, item.seed);
    const root=new THREE.Group();
    root.matrixAutoUpdate=false;                 // 变换只在 place() 里更新
    root.userData.itemId=item.id;
    root.add(object);
    itemsGroup.add(root);
    const e={ item:{ ...item }, root, local, ext:localExtents(object) };
    place(e);
    return e;
  }
  function destroy(/** @type {any} */ e){ e.root.removeFromParent(); disposeItem(e.root); if(e.shadow) contact.remove(e.shadow); }

  // 物件局部障碍 → 世界障碍；同时刷新气泡发射点
  function refreshDerived(){
    obstacles.length=0;
    for(const e of live.values())
      for(const o of e.local) obstacles.push({ c:o.c.clone().applyMatrix4(e.root.matrix), r:o.r*e.item.s });
    const first=[...live.values()].find((/** @type {any} */ e)=>e.item.type==='airstone');
    air.on=!!first;
    if(first){ air.x=first.item.x; air.z=first.item.z; }
  }

  /** 让场景里的物件与列表一致（新增/删除/移动/重建），保持文档顺序 */
  function syncItems(/** @type {any[]} */ items){
    const keep=new Set(items.map((/** @type {any} */ it)=>it.id));
    for(const [id,e] of live) if(!keep.has(id)){ destroy(e); live.delete(id); }
    const next=new Map();
    for(const it of items){
      /** @type {any} */ let e=live.get(it.id);
      if(e && (e.item.type!==it.type || e.item.seed!==it.seed)){ destroy(e); e=null; }
      if(!e) e=build(it);
      else{ e.item={ ...it }; place(e); }
      next.set(it.id, e);
    }
    live.clear();
    for(const [id,e] of next) live.set(id,e);
    refreshDerived();
    batch.resync(rootsOf());                    // 物件集合/变换变化后重批（同批同矩阵则自动跳过）
    applyShore(shoreLevel);
  }

  /** 草叶 / 枫叶按画质档减实例；加密草丛（seed%3===0）在低档整丛隐藏。InstancedMesh 不进批处理 */
  function applyShore(/** @type {number} */ level){
    shoreLevel=level;
    const lod=shoreLod(level);
    for(const e of live.values()){
      e.root.traverse((/** @type {any} */ o)=>{
        const sh=o.userData?.shore;
        if(!sh || !o.isInstancedMesh) return;
        if(sh.extra && !lod.extra){ o.visible=false; return; }
        o.visible=true;
        const k=sh.kind==='grass' ? lod.grass : lod.leaf;
        const min=sh.extra ? 0 : 3;
        o.count=clamp(Math.round(sh.full*k), min, sh.full);
      });
    }
  }

  /** 石灯火室与萤火虫。要在反射 pass 之前调，倒影里才看得到夜光 */
  function glowShore(/** @type {number} */ k){
    const night=k*k, show=k>0.4;
    let glow=null, flies=null;
    for(const e of live.values()){
      if(e.item.type!=='lantern') continue;
      glow=glow ?? lanternGlow();
      flies=flies ?? fireflyMat();
      e.root.traverse((/** @type {any} */ o)=>{
        if(o.userData?.shoreLight) o.intensity=night*2.2;
        if(o.isPoints) o.visible=show;
      });
    }
    if(glow) glow.emissiveIntensity=0.04+night*2.4;
    if(flies) flies.opacity=show ? Math.min(0.95, (k-0.4)/0.35) : 0;
  }

  /** 调试用：藏起岸边物件（含已合批的树干）做前后对比。@param {boolean} on */
  function setShoreVisible(/** @type {boolean} */ on){
    for(const e of live.values()){
      if(!ITEM_META[e.item.type]?.land) continue;
      e.root.visible=on;
      if(e.shadow) e.shadow.visible=on;
    }
    batch.resync(on ? rootsOf() : rootsOf().filter((/** @type {any} */ r)=>r.visible));
  }

  /* ---------- 鱼群 ---------- */
  const countsOf=(/** @type {any} */ fish)=>SPECIES.map((/** @type {any} */ s)=>fish[s.id] ?? 0);
  function setFish(/** @type {any} */ fish, /** @type {{ reset?:boolean }} */ { reset=false }={}){
    const counts=countsOf(fish);
    const specs=SPECIES.map((s,i)=>({ ...s, count:counts[i] }));
    care?.dispose();
    care=createCare(specs, { key:careKey(doc.id) });
    const b=boxOf();
    const old=new Map(schools.map((/** @type {any} */ s)=>[s.spec.id, s]));
    const next=[];
    for(const spec of specs){
      const prev=old.get(spec.id);
      if(prev && !reset && prev.spec.count===spec.count){ prev.setLimits(b.swim, b.yCeil, b.waterY); next.push(prev); old.delete(spec.id); continue; }
      if(spec.count<=0) continue;
      const s=new School(spec, obstacles, glbMap[spec.id],
        { growth:care.growthArray(spec.id), capacity:FISH_MAX[spec.id] ?? spec.count, gloss:care.glossK(),
          swim:b.swim, yCeil:b.yCeil, waterY:b.waterY });
      tankGroup.add(s.group);
      next.push(s);
    }
    for(const s of old.values()) s.dispose();
    schools.length=0;
    schools.push(...next);
    onSchools?.();
  }

  /** 应用文档。fresh=true 用于切换场景（鱼群全部重生）；否则只做差量更新（编辑器预览） */
  function apply(/** @type {any} */ nextDoc, /** @type {{ fresh?:boolean }} */ { fresh=false }={}){
    const prev=doc;
    doc=cloneDoc(nextDoc);
    if(fresh || !prev || prev.theme!==doc.theme) setTheme(doc.theme);
    const tankChanged=fresh || !prev || prev.tank!==doc.tank;
    if(tankChanged){
      tank.setShell(doc.tank);
      gravel.visible=!(TANK_STYLES[doc.tank]?.bowl);   // 小缸碎石会浮在碗形底上方
      onTank?.(TANK_STYLES[doc.tank] ?? TANK_STYLES.classic, doc.tank);
    }
    syncItems(doc.items);
    const fishChanged=!prev || countsOf(prev.fish).join()!==countsOf(doc.fish).join();
    if(fresh || prev?.id!==doc.id || fishChanged) setFish(doc.fish, { reset:fresh || prev?.id!==doc.id });
    else if(tankChanged){ const b=boxOf(); for(const s of schools) s.setLimits(b.swim, b.yCeil, b.waterY); }
  }

  return {
    apply,
    get doc(){ return doc; },
    get care(){ return care; },
    itemsGroup,
    /** 编辑器进出时开关物件批处理：关 = 拆批恢复原网格（逐件拾取/拖拽），开 = 立即重批 */
    setBatching(/** @type {boolean} */ on){ batch.setEnabled(on); if(on) batch.resync(rootsOf()); },
    /** 调试/验证用：当前批构成（每桶一次绘制） */
    batchStats: () => batch.stats(),
    /** @param {string} id */
    rootOf: (/** @type {string} */ id) => live.get(id)?.root ?? null,
    /** 编辑器摆放钳制用：该物件中心点允许范围（真实几何包络，place() 同一套） */
    limitsOf: (/** @type {string} */ id) => live.get(id)?.lim ?? { x:boxOf().place.x, z:boxOf().place.z },
    /** 编辑器拖拽时的轻量更新：只改变换，不重建 */
    moveItem(/** @type {any} */ item){
      const e=live.get(item.id);
      if(!e) return;
      e.item={ ...item, x:item.x, z:item.z, rot:item.rot, s:item.s };
      place(e);
      refreshDerived();
    },
    fishTotal: () => schools.reduce((/** @type {number} */ a,/** @type {any} */ s)=>a+s.spec.count, 0),
    /** 亲密度发鱼：原地给该物种加一条（不重建鱼群），并同步文档计数；
     * 调用方负责 store.save 持久化。返回命中的鱼群，失败返回 null */
    addFish(/** @type {string} */ speciesId){
      const s=schools.find((/** @type {any} */ x)=>x.spec.id===speciesId);
      if(!s || doc.fish[speciesId]==null) return null;
      if(s.spec.count>=s.capacity || fishTotalOf(doc)>=FISH_TOTAL_MAX) return null;
      const i=s.addFish();
      if(i<0) return null;
      care?.arrive(speciesId, i);               // 在缸时长从这一刻算起
      doc.fish[speciesId]=s.spec.count;
      return s;
    },
    /** 光泽度变化时刷新全部鱼群（School 内部去重，同值不重设材质） */
    setGloss(/** @type {number} */ k){ for(const s of /** @type {any[]} */ (schools)) s.setGloss(k); },
    applyShore,
    /** 自然水域外壳散布密度（草/卵石/岸石）。玻璃缸无标记 @param {number} level */
    applyShell(level){ tank.applyDensity?.(level); },
    /** 后台模型到位后，把还在用程序化身体的该物种换成 GLB，并接上原来的位置和游速 @param {string} speciesId */
    useModel(speciesId){
      const idx=schools.findIndex((/** @type {any} */ s)=>s.spec.id===speciesId);
      if(idx<0 || schools[idx].glbMode || !glbMap[speciesId] || !care) return false;
      const prev=schools[idx];
      const base=SPECIES.find(s=>s.id===speciesId);
      if(!base) return false;
      const spec={ ...base, count:prev.spec.count };
      const b=boxOf();
      const s=new School(spec, obstacles, glbMap[speciesId], {
        growth:care.growthArray(spec.id), capacity:FISH_MAX[spec.id] ?? spec.count, gloss:care.glossK(),
        swim:b.swim, yCeil:b.yCeil, waterY:b.waterY });
      const n=Math.min(s.spec.count, prev.pos.length);
      for(let i=0;i<n;i++){
        s.pos[i].copy(prev.pos[i]); s.vel[i].copy(prev.vel[i]); s.smv[i].copy(prev.smv[i]);
        s.yaw[i]=prev.yaw[i]; s.bank[i]=prev.bank[i];
        s.growth[i]=prev.growth[i]; s.growthTarget[i]=prev.growthTarget[i];
      }
      s.update(0, { obstacles, pellets:[], excite:0, time:0, schools });
      tankGroup.add(s.group);
      prev.dispose();
      schools[idx]=s;
      onSchools?.();
      return true;
    },
    glowShore,
    setShoreVisible,
  };
}
const fishTotalOf=(/** @type {any} */ d)=>Object.values(d.fish).reduce((/** @type {number} */ a,/** @type {any} */ n)=>a+n,0);
