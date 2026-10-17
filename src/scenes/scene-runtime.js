import * as THREE from 'three';
import { makeRng, rrange } from '../utils.js';
import { sandHeight, TANK } from '../scene/tank.js';
import { SPECIES } from '../entities/fish/species.js';
import { School } from '../entities/fish/school.js';
import { createCare } from '../systems/care.js';
import { buildItem, disposeItem } from './catalog.js';
import { THEMES } from './themes.js';
import { TANK_STYLES } from './tank-styles.js';
import { careKey } from './scene-store.js';
import { cloneDoc } from './scene-doc.js';

/* ================================================================
 * 场景运行时：把场景文档落到 three 场景里，并做增量更新
 * - 物件：每件一个根节点（userData.itemId），移动/旋转/缩放只改变换，换 seed/type 才重建
 * - obstacles / schools 数组原地修改（鱼群、识鱼卡片等持有的是同一个引用）
 * - air：第一个气石的位置（气泡发射点），没有气石时 air.on=false
 * - 饲养存档按场景隔离（careKey），切场景时落盘旧的、读取新的
 * ================================================================ */

const GRAVEL_N=56;

export function createSceneRuntime({ tankGroup, tank, glbMap, schools, obstacles, air, onTheme, onTank, onSchools }){
  const itemsGroup=new THREE.Group();
  itemsGroup.name='scene-items';
  tankGroup.add(itemsGroup);
  /** @type {Map<string, { item:any, root:THREE.Group, local:{c:THREE.Vector3,r:number}[] }>} */
  const live=new Map();
  let doc=null, care=null;

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

  function setTheme(id){
    const t=THEMES[id] ?? THEMES.fresh, c=new THREE.Color();
    tank.setSandColors(t.sand[0], t.sand[1]);
    tank.setBackdrop(t.backdrop);
    for(let i=0;i<GRAVEL_N;i++) gravel.setColorAt(i, c.setHex(t.gravel[(i*7)%t.gravel.length]));
    gravel.instanceColor.needsUpdate=true;
    onTheme?.(t);
  }

  /* ---------- 物件 ---------- */
  function place(e){
    const it=e.item;
    const y=sandHeight(it.x,it.z);
    e.root.position.set(it.x, y, it.z);
    e.root.rotation.set(0, it.rot, 0);
    e.root.scale.setScalar(it.s);
    e.root.children[0]?.userData.onPlace?.((TANK.waterY-y)/it.s);   // 睡莲/香蒲按到水面的局部高度伸展
    e.root.updateMatrix();
    e.root.updateMatrixWorld(true);
  }
  function build(item){
    const { object, obstacles:local }=buildItem(item.type, item.seed);
    const root=new THREE.Group();
    root.matrixAutoUpdate=false;                 // 变换只在 place() 里更新
    root.userData.itemId=item.id;
    root.add(object);
    itemsGroup.add(root);
    const e={ item:{ ...item }, root, local };
    place(e);
    return e;
  }
  function destroy(e){ e.root.removeFromParent(); disposeItem(e.root); }

  // 物件局部障碍 → 世界障碍；同时刷新气泡发射点
  function refreshDerived(){
    obstacles.length=0;
    for(const e of live.values())
      for(const o of e.local) obstacles.push({ c:o.c.clone().applyMatrix4(e.root.matrix), r:o.r*e.item.s });
    const first=[...live.values()].find(e=>e.item.type==='airstone');
    air.on=!!first;
    if(first){ air.x=first.item.x; air.z=first.item.z; }
  }

  /** 让场景里的物件与列表一致（新增/删除/移动/重建），保持文档顺序 */
  function syncItems(items){
    const keep=new Set(items.map(it=>it.id));
    for(const [id,e] of live) if(!keep.has(id)){ destroy(e); live.delete(id); }
    const next=new Map();
    for(const it of items){
      let e=live.get(it.id);
      if(e && (e.item.type!==it.type || e.item.seed!==it.seed)){ destroy(e); e=null; }
      if(!e) e=build(it);
      else{ e.item={ ...it }; place(e); }
      next.set(it.id, e);
    }
    live.clear();
    for(const [id,e] of next) live.set(id,e);
    refreshDerived();
  }

  /* ---------- 鱼群 ---------- */
  const countsOf=fish=>SPECIES.map(s=>fish[s.id] ?? 0);
  function setFish(fish, { reset=false }={}){
    const counts=countsOf(fish);
    const specs=SPECIES.map((s,i)=>({ ...s, count:counts[i] }));
    care?.dispose();
    care=createCare(specs, { key:careKey(doc.id) });
    const old=new Map(schools.map(s=>[s.spec.id, s]));
    const next=[];
    for(const spec of specs){
      const prev=old.get(spec.id);
      if(prev && !reset && prev.spec.count===spec.count){ next.push(prev); old.delete(spec.id); continue; }
      if(spec.count<=0) continue;
      const s=new School(spec, obstacles, glbMap[spec.id], { growth:care.growthArray(spec.id) });
      tankGroup.add(s.group);
      next.push(s);
    }
    for(const s of old.values()) s.dispose();
    schools.length=0;
    schools.push(...next);
    onSchools?.();
  }

  /** 应用文档。fresh=true 用于切换场景（鱼群全部重生）；否则只做差量更新（编辑器预览） */
  function apply(nextDoc, { fresh=false }={}){
    const prev=doc;
    doc=cloneDoc(nextDoc);
    if(fresh || !prev || prev.theme!==doc.theme) setTheme(doc.theme);
    if(fresh || !prev || prev.tank!==doc.tank){
      tank.setShell(doc.tank);
      onTank?.(TANK_STYLES[doc.tank] ?? TANK_STYLES.classic);
    }
    syncItems(doc.items);
    const fishChanged=!prev || countsOf(prev.fish).join()!==countsOf(doc.fish).join();
    if(fresh || prev?.id!==doc.id || fishChanged) setFish(doc.fish, { reset:fresh || prev?.id!==doc.id });
  }

  return {
    apply,
    get doc(){ return doc; },
    get care(){ return care; },
    itemsGroup,
    /** @param {string} id */
    rootOf: id => live.get(id)?.root ?? null,
    /** 编辑器拖拽时的轻量更新：只改变换，不重建 */
    moveItem(item){
      const e=live.get(item.id);
      if(!e) return;
      e.item={ ...e.item, x:item.x, z:item.z, rot:item.rot, s:item.s };
      place(e);
      refreshDerived();
    },
    fishTotal: () => schools.reduce((a,s)=>a+s.spec.count, 0),
  };
}
