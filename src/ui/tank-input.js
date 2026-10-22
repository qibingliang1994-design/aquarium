// @ts-check
import * as THREE from 'three';
import { rand, clamp } from '../utils.js';
import { TANK, sandHeight } from '../scene/tank.js';
import { groundY } from '../scene/ground.js';

/* ================================================================
 * 观赏模式下的画布交互：单击喂食/识鱼，快速双击敲玻璃（惊吓度 2 秒衰减 + 镜头轻震）
 * isBlocked()=true 时（造景编辑中）全部让给编辑器
 * ================================================================ */

const TAP_GAP_MS=300, TAP_SLOP_PX=30, FEAR_SECS=2, SHAKE_SECS=0.18;
// 默认缸的字面量。大场景由 setBounds 换成该缸的边界（随机落点、点击钳制、敲击盒一起换）
const feedBox={ reachX:6, reachZ:3, clickX:2.15, clickZ:0.78, scatX:1.1, scatZ:0.38, waterY:TANK.waterY };
const TANK_BOX=new THREE.Box3(
  new THREE.Vector3(-TANK.W/2+TANK.glass, sandHeight(0,0), -TANK.D/2+TANK.glass),
  new THREE.Vector3( TANK.W/2-TANK.glass, TANK.waterY,      TANK.D/2-TANK.glass));

export const randomFeedPoint=()=>new THREE.Vector3(rand(-feedBox.scatX,feedBox.scatX), feedBox.waterY, rand(-feedBox.scatZ,feedBox.scatZ));

/** @param {{ camera:any, canvas:any, schools:any[], fishCard:any, feeder:any, sound:any, isBlocked:()=>boolean }} opts */
export function createTankInput({ camera, canvas, schools, fishCard, feeder, sound, isBlocked }){
  const raycaster=new THREE.Raycaster();
  let fear=0, shake=0;
  const ray=(/** @type {number} */ cx, /** @type {number} */ cy)=>raycaster.setFromCamera(new THREE.Vector2((cx/innerWidth)*2-1, -(cy/innerHeight)*2+1), camera);

  function feedAt(/** @type {THREE.Vector3} */ p){ sound.ensure(); sound.plop(); fishCard.hide(); feeder.spawn(p); }
  function tapGlass(/** @type {number} */ cx, /** @type {number} */ cy){
    ray(cx,cy);
    const point=raycaster.ray.intersectBox(TANK_BOX,new THREE.Vector3())   // 视线进入缸体处
      ?? TANK_BOX.getCenter(new THREE.Vector3());
    sound.ensure(); sound.knock(); fishCard.hide();
    fear=1; shake=SHAKE_SECS;
    for(const s of schools) s.startle(point);
  }
  function feedPointFromScreen(/** @type {number} */ cx, /** @type {number} */ cy){
    ray(cx,cy);
    const o=raycaster.ray.origin, d=raycaster.ray.direction;
    // 命中点收进投喂范围（鱼的活动区）：点在自然水域的岸边水面、或缸的边缘外一点，饲料落在离点击最近的位置
    // （此前只认 |x|<2.15、|z|<0.78 的命中，其余一律随机落点：池塘/溪流里点哪都像没反应）
    const near=(/** @type {number} */ x,/** @type {number} */ z)=>Math.abs(x)<feedBox.reachX && Math.abs(z)<feedBox.reachZ;
    if(Math.abs(d.y)>1e-4){
      for(const y of [feedBox.waterY, 0.5]){            // 先打水面，兜底打沙面上方
        const t=(y-o.y)/d.y;
        if(t<=0) continue;
        const x=o.x+d.x*t, z=o.z+d.z*t;
        if(near(x,z)) return new THREE.Vector3(clamp(x,-feedBox.clickX,feedBox.clickX), feedBox.waterY, clamp(z,-feedBox.clickZ,feedBox.clickZ));
      }
    }
    return randomFeedPoint();
  }

  let downX=0,downY=0,downT=0, lastTapT=-1e9, lastTapX=0, lastTapY=0;
  canvas.addEventListener('pointerdown',(/** @type {PointerEvent} */ e)=>{ downX=e.clientX; downY=e.clientY; downT=performance.now(); });
  canvas.addEventListener('pointerup',(/** @type {PointerEvent} */ e)=>{
    if(isBlocked()) return;
    const now=performance.now();
    if(Math.hypot(e.clientX-downX,e.clientY-downY)>=7 || now-downT>=450) return;   // 拖拽不算点击
    // 第二下紧跟第一下 → 敲玻璃（第一下照常喂食/识鱼，保证单击零延迟）
    if(now-lastTapT<TAP_GAP_MS && Math.hypot(e.clientX-lastTapX,e.clientY-lastTapY)<TAP_SLOP_PX){
      lastTapT=-1e9; tapGlass(e.clientX,e.clientY); return;
    }
    lastTapT=now; lastTapX=e.clientX; lastTapY=e.clientY;
    const hit=fishCard.pick(e.clientX,e.clientY);
    if(hit) fishCard.show(hit,e.clientX,e.clientY);      // 点到鱼 → 识别
    else feedAt(feedPointFromScreen(e.clientX,e.clientY)); // 点到水 → 喂食
  });

  return {
    feedAt, tapGlass,
    /** @param {import('../scenes/tank-bounds.js').TankBounds} b */
    setBounds(b){
      feedBox.reachX=b.feedReach.x; feedBox.reachZ=b.feedReach.z;
      feedBox.clickX=b.feedClick.x; feedBox.clickZ=b.feedClick.z;
      feedBox.scatX=b.feedScatter.x; feedBox.scatZ=b.feedScatter.z;
      feedBox.waterY=b.waterY;
      const v=b.volume;
      TANK_BOX.min.set(-v.W/2+v.glass, groundY(0,0), -v.D/2+v.glass);
      TANK_BOX.max.set( v.W/2-v.glass, v.waterY,      v.D/2-v.glass);
    },
    get fear(){ return fear; },
    /** 每帧：惊吓衰减；返回本帧镜头震动偏移（无震动时为 null） */
    update(/** @type {number} */ dt, /** @type {number} */ t){
      fear=Math.max(0,fear-dt/FEAR_SECS);
      if(shake<=0) return null;
      shake=Math.max(0,shake-dt);
      const a=0.012*shake/SHAKE_SECS;
      return { x:Math.sin(t*95)*a, y:Math.cos(t*77)*a*0.6 };
    },
  };
}
