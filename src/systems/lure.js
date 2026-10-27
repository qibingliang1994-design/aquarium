// @ts-check
import * as THREE from 'three';
import { rand } from '../utils.js';

/* ================================================================
 * 逗鱼光点：开启后光标化作水中一枚发光的小光点（"逗猫棒"），
 * 鱼群会被吸引、绕圈盘旋、凑近轻咬（追逐力在 steering.lureAcc，
 * 这里只负责光标 → 水中投影、光点视觉与呼吸/漂浮动画）
 * ================================================================ */

const RANGE=1.25;          // 光点吸引半径（与 steering.lureAcc 共用）
const MOTES=10;            // 环绕光尘数量

/** @param {{ tankGroup:any, camera:any, canvas:any }} opts */
export function createLure({ tankGroup, camera, canvas }){
  // 光标落点：射线打到水下 0.28 的水平面，钳进当前缸的投喂范围（setBounds 换缸时更新）
  const box={ x:2.15, z:0.78, waterY:1.84, floor:0.45 };
  const raycaster=new THREE.Raycaster();
  const target=new THREE.Vector3();
  let placed=false;            // 第一次 pointermove 之前不显示（还没有落点）

  const group=new THREE.Group();
  group.visible=false;
  tankGroup.add(group);
  // 核心：高亮小球（泛光让它在水里发光）
  const core=new THREE.Mesh(
    new THREE.SphereGeometry(0.028,16,12),
    new THREE.MeshBasicMaterial({ color:0xcdf6ff }));
  group.add(core);
  // 光晕：加色混合的外壳，随呼吸脉动
  const halo=new THREE.Mesh(
    new THREE.SphereGeometry(0.06,16,12),
    new THREE.MeshBasicMaterial({ color:0x66d9ff, transparent:true, opacity:0.3, blending:THREE.AdditiveBlending, depthWrite:false }));
  group.add(halo);
  // 光尘：环绕光点缓缓打转的小亮屑
  const moteGeo=new THREE.TetrahedronGeometry(0.011);
  const moteMesh=new THREE.InstancedMesh(moteGeo,
    new THREE.MeshBasicMaterial({ color:0x9fe8ff, transparent:true, opacity:0.75, blending:THREE.AdditiveBlending, depthWrite:false }), MOTES);
  moteMesh.frustumCulled=false;
  group.add(moteMesh);
  /** @type {{ r:number, w:number, ph:number, y:number, s:number }[]} */
  const motes=Array.from({length:MOTES},()=>({ r:rand(0.07,0.16), w:rand(0.6,1.6)*(Math.random()<0.5?-1:1), ph:rand(6.283), y:rand(-0.1,0.1), s:rand(0.6,1.3) }));
  // 一盏小点光：靠近的鱼身与沙面被照亮
  const light=new THREE.PointLight(0x7fd8ff, 0, 2.4, 2);
  group.add(light);

  const p=new THREE.Vector3();   // 光点当前位置（缓动跟随光标）
  let on=false, k=0, nibbles=0;
  /** @type {(()=>void)|null} */ let onNibble=null;
  const _m=new THREE.Matrix4(), _q=new THREE.Quaternion(), _s=new THREE.Vector3(), _pos=new THREE.Vector3();

  function set(/** @type {boolean} */ v){ on=v; }

  canvas.addEventListener('pointermove',(/** @type {PointerEvent} */ e)=>{
    if(!on) return;
    raycaster.setFromCamera(new THREE.Vector2((e.clientX/innerWidth)*2-1, -(e.clientY/innerHeight)*2+1), camera);
    const o=raycaster.ray.origin, d=raycaster.ray.direction;
    const y=box.waterY-0.28;                       // 水面下一点点的水平面
    if(Math.abs(d.y)>1e-4){
      const t=(y-o.y)/d.y;
      if(t>0){
        target.set(THREE.MathUtils.clamp(o.x+d.x*t,-box.x,box.x), y,
                   THREE.MathUtils.clamp(o.z+d.z*t,-box.z,box.z));
        if(!placed){ p.copy(target); placed=true; }   // 第一次落点：直接就位，不从缸底飞上来
      }
    }
  });

  return {
    set,
    get on(){ return on; },
    /** 鱼群读到的追逐目标：k=有效强度（0..1；还没落点时为 0，鱼群不追），p=位置，range=吸引半径 */
    get k(){ return placed ? k : 0; },
    p,
    range:RANGE,
    /** @param {import('../scenes/tank-bounds.js').TankBounds} b */
    setBounds(b){
      box.x=b.feedClick.x; box.z=b.feedClick.z; box.waterY=b.waterY;
      box.floor=Math.max(0.45, b.waterY-1.3);
    },
    /** 咬到光点时由 School 调用：计数 + 音效回调（main 接 sound.pling） */
    nibble(){
      nibbles++;
      light.intensity=4.5;                          // 被咬时闪一下
      onNibble?.();
    },
    /** 直接摆放光点（调试钩子用，不经光标） @param {number} x @param {number} y @param {number} z */
    place(x,y,z){
      target.set(THREE.MathUtils.clamp(x,-box.x,box.x), THREE.MathUtils.clamp(y,box.floor,box.waterY-0.08),
                 THREE.MathUtils.clamp(z,-box.z,box.z));
      if(!placed){ p.copy(target); placed=true; }
    },
    /** @param {number} dt @param {number} t */
    update(dt, t){
      k+=( (on?1:0)-k )*Math.min(1, dt*3);
      group.visible=k>0.02 && placed;
      if(!group.visible){ light.intensity=0; return; }
      p.lerp(target, 1-Math.exp(-dt*10));            // 缓动跟随光标
      const bob=Math.sin(t*2.2)*0.02;                // 轻轻漂浮
      group.position.set(p.x, p.y+bob, p.z);
      // 呼吸脉动 + 被咬时的余辉衰减
      const pulse=1+Math.sin(t*4.6)*0.14;
      core.scale.setScalar(k*pulse);
      halo.scale.setScalar((1.15+Math.sin(t*3.1)*0.2)*k);
      /** @type {any} */ (halo.material).opacity=0.3*k;
      light.intensity=Math.max(2.2*k, light.intensity-dt*10);
      for(let i=0;i<MOTES;i++){
        const mo=motes[i], a=t*mo.w+mo.ph;
        _pos.set(p.x+Math.cos(a)*mo.r, p.y+Math.sin(t*1.3+mo.ph)*0.03+mo.y*bob*3, p.z+Math.sin(a)*mo.r);
        _q.setFromAxisAngle(_s.set(0,1,0), a*1.7);
        const s=mo.s*k*(0.7+0.3*Math.sin(t*3+mo.ph*2));
        _m.compose(_pos, _q, _s.set(s,s,s));
        moteMesh.setMatrixAt(i,_m);
      }
      moteMesh.instanceMatrix.needsUpdate=true;
    },
    /** 调试：累计咬光点次数（传 0 归零） @param {number} reset */
    nibbleCount(reset){ if(reset===0) nibbles=0; return nibbles; },
    /** @param {(()=>void)|null} fn */
    setOnNibble(fn){ onNibble=fn; },
    dispose(){
      group.removeFromParent();
      core.geometry.dispose(); /** @type {any} */ (core.material).dispose();
      halo.geometry.dispose(); /** @type {any} */ (halo.material).dispose();
      moteGeo.dispose(); /** @type {any} */ (moteMesh.material).dispose();
      moteMesh.dispose();
    },
  };
}
