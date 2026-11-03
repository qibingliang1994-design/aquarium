// @ts-check
/* ================================================================
 * 宣传片分镜《第 1 天 → 第 30 天》：造缸延时
 * 成品缸一闪 → 倒带回空缸 → 主石起每拍落一块石头 → 牛毛毡按十六分音符铺开 → 放鱼 → 跟拍 → 关灯
 * 只描述"什么时候发生什么"，逐帧导出/摄影机/合成在 promo.js，画面文字在 overlay.js，
 * 节拍表在 timeline.js（配乐脚本按同一张表 + 这里记下的事件出声）。
 * ================================================================ */
import { SEC, BEAT } from './timeline.js';

const DROP_T=0.34;                // 落石下坠时长（秒）：落地正好卡在拍上
const DROP_H=0.85;                // 下坠高度
const GROW_T=0.55;                // 草丛长出来的时长

const clamp01=(/** @type {number} */ x)=>x<0?0:x>1?1:x;
const smooth=(/** @type {number} */ x)=>{ x=clamp01(x); return x*x*(3-2*x); };
const backOut=(/** @type {number} */ x)=>{ x=clamp01(x); const c=1.5; return 1+(c+1)*Math.pow(x-1,3)+c*Math.pow(x-1,2); };

/** @typedef {{ pos:number[], tgt:number[], fov?:number }} Key */
/** @typedef {{ from:Key, to:Key, sway?:number, follow?:string, hold?:number }} Cam */

/** @param {{ ev:(e:any)=>void }} io  ev：记一条声音事件（时间用拍对齐后的秒数） */
export function createStory({ ev }){
  /* ---------- 镜头表（绝对拍位） ---------- */
  /** @type {{ at:number, cam:Cam }[]} */
  const SHOTS=[
    { at:SEC.hook,   cam:{ from:{ pos:[0.9,1.22,3.6],  tgt:[-0.25,1.08,0], fov:40 }, to:{ pos:[0.62,1.18,3.2], tgt:[-0.3,1.06,0], fov:40 }, sway:0.6, follow:'rummy', hold:0.45 } },
    { at:SEC.empty,  cam:{ from:{ pos:[0,1.42,6.3],    tgt:[0,1.0,0],     fov:52 }, to:{ pos:[0,1.36,5.6],   tgt:[0,0.98,0],  fov:52 }, sway:0.12 } },
    { at:SEC.plants, cam:{ from:{ pos:[-1.3,0.82,2.7], tgt:[-0.2,0.66,-0.2], fov:40 }, to:{ pos:[0.5,0.86,2.6], tgt:[0.7,0.68,-0.2], fov:40 }, sway:0.35 } },
    { at:SEC.fish,   cam:{ from:{ pos:[0.3,1.58,3.3],  tgt:[0,1.45,0],    fov:44 }, to:{ pos:[0.2,1.5,3.0],   tgt:[0,1.15,0],  fov:44 }, sway:0.5 } },
    { at:SEC.macro,  cam:{ from:{ pos:[0.55,1.12,2.25], tgt:[0,1.05,0],   fov:30 }, to:{ pos:[-0.1,1.06,1.95], tgt:[0,1.0,0],  fov:29 }, sway:0.8, follow:'rummy', hold:0.85 } },
    { at:SEC.wide,   cam:{ from:{ pos:[0,1.4,6.0],     tgt:[0,1.0,0],     fov:50 }, to:{ pos:[0,1.44,6.7],   tgt:[0,1.0,0],   fov:50 }, sway:0.25 } },
  ];

  /* ---------- 造缸素材：开录时从成品文档里拆出来 ---------- */
  /** @type {any} */ let full=null;          // 成品文档（第 30 天）
  /** @type {any} */ let work=null;          // 正在搭的文档（逐件往里加）
  /** @type {{ at:number, run:(d:any)=>void, done?:boolean }[]} */ let cues=[];
  /** @type {{ id:string, t0:number, kind:'drop'|'grow', item:any, len:number, base?:number, landed?:boolean }[]} */ let anims=[];
  let shakeT=-9;                           // 上次落石时刻（镜头震一下）

  function plan(/** @type {any} */ doc){
    full=structuredClone(doc);
    const zero=Object.fromEntries(Object.keys(full.fish ?? {}).map(k=>[k, 0]));
    work={ ...structuredClone(doc), items:[], fish:zero };
    const items=/** @type {any[]} */ (full.items);
    const stones=items.filter((/** @type {any} */ it)=>it.type==='rockTall').sort((/** @type {any} */ a,/** @type {any} */ b)=>b.s-a.s);   // 主石先落
    const pebbles=items.filter((/** @type {any} */ it)=>it.type==='rock');
    const paths=items.filter((/** @type {any} */ it)=>it.type==='sandPath');
    const plants=items.filter((/** @type {any} */ it)=>it.type==='hairgrass' || it.type==='carpet')
      .sort((/** @type {any} */ a,/** @type {any} */ b)=>(a.x+a.z*0.6)-(b.x+b.z*0.6));    // 从左后往右前铺，像一道浪
    const rest=items.filter((/** @type {any} */ it)=>!stones.includes(it) && !pebbles.includes(it) && !paths.includes(it) && !plants.includes(it));

    cues=[];
    cues.push({ at:SEC.empty, run:d=>{ d.setBatching(false); d.applyDoc(work); d.setNight(0); ev({ type:'cut' }); } });
    stones.forEach((it,i)=>drop(it, SEC.stones+i, i));
    pebbles.forEach((it,i)=>drop(it, SEC.stones+stones.length+i*0.5, stones.length+i, true));
    const pAt=SEC.stones+stones.length+pebbles.length*0.5;
    paths.forEach((it,i)=>grow(it, pAt+i*0.5, -1));
    plants.forEach((it,i)=>grow(it, SEC.plants+i*0.25, i));
    if(rest.length) cues.push({ at:SEC.plants, run:d=>{ for(const it of rest) add(d, it); } });

    // 放鱼：先各放一条建鱼群（切镜那一帧），之后从水面一把一把往下撒
    const want=full.fish ?? {};
    const live=Object.keys(want).filter(k=>want[k]>0);
    cues.push({ at:SEC.fish, run:d=>{ work.fish={ ...zero, ...Object.fromEntries(live.map(k=>[k, 1])) }; d.applyDoc(work); } });
    const big=live.sort((a,b)=>want[b]-want[a]);
    let j=0;
    for(const id of big){
      const n=want[id]-1;
      for(let k=0;k<n;k++){
        const at=id===big[0] ? SEC.fish+0.5+Math.floor(k/4)*0.5+(k%4)*0.06 : SEC.fish+1.5+k;   // 主鱼群一拍两把，每把 4 条
        cues.push({ at, run:d=>{ if(d.addFish(id)) ev({ type:'fish', at:at*BEAT, n:j++ }); } });
      }
    }
    cues.push({ at:SEC.fish+3.9, run:d=>{ work=d.docOf(); } });
    cues.sort((a,b)=>a.at-b.at);
    anims=[];
  }
  function add(/** @type {any} */ d, /** @type {any} */ it){ work.items.push(structuredClone(it)); d.applyDoc(work); }
  function drop(/** @type {any} */ it, /** @type {number} */ landBeat, /** @type {number} */ i, small=false){
    const t0=landBeat*BEAT-DROP_T;
    cues.push({ at:t0/BEAT, run:d=>{ add(d, it); anims.push({ id:it.id, t0, kind:'drop', item:it, len:DROP_T }); } });
    ev({ type:small?'pebble':'stone', at:landBeat*BEAT, i, s:it.s });
  }
  function grow(/** @type {any} */ it, /** @type {number} */ beat, /** @type {number} */ i){
    const t0=beat*BEAT;
    cues.push({ at:beat, run:d=>{ add(d, { ...it, s:it.s*0.02 }); anims.push({ id:it.id, t0, kind:'grow', item:it, len:i<0?BEAT*1.2:GROW_T }); } });
    ev({ type:i<0?'path':'plant', at:t0, i });
  }

  /** 每帧：触发到点的事件、推进落石/生长动画、昼夜 —— 在 loopFrame 之前调 */
  function frame(/** @type {number} */ t, /** @type {any} */ d){
    const b=t/BEAT;
    for(const c of cues) if(!c.done && b>=c.at-1e-6){ c.done=true; c.run(d); }
    for(const a of anims){
      const u=clamp01((t-a.t0)/a.len);
      if(a.kind==='drop'){
        const r=d.itemRoot(a.id); if(!r) continue;
        const base=a.base ??= r.position.y;
        r.position.y=base+DROP_H*(1-u*u);                       // 自由落体：越落越快
        r.updateMatrix(); r.updateMatrixWorld(true);
        if(u>=1 && !a.landed){ a.landed=true; shakeT=t; d.kickTurbid(a.item.s>1.2 ? 0.32 : 0.16); }
      } else {
        const s=a.item.s*Math.max(0.02, a.len>GROW_T ? smooth(u) : backOut(u));
        d.moveItem({ ...a.item, s });
        const w=work.items.find((/** @type {any} */ x)=>x.id===a.id); if(w) w.s=s;   // 后面再 applyDoc 时别把长到一半的草缩回去
      }
    }
    anims=anims.filter(a=>!(a.kind==='grow' && t-a.t0>a.len+0.05) && !(a.kind==='drop' && a.landed));
    // 关灯：两小节慢慢暗下去
    if(b>=SEC.night) d.setNight(smooth((b-SEC.night)/5));
  }
  /** 落石时镜头的一下闷震（衰减正弦），加在机位上 */
  function shake(/** @type {number} */ t){
    const u=t-shakeT; if(u<0 || u>0.4) return 0;
    return Math.exp(-u*14)*Math.sin(u*70)*0.018;
  }
  /** 第几天：成品 30 → 倒带滚回 1 → 种草时 2..28 → 放鱼 30 */
  function day(/** @type {number} */ b){
    if(b<SEC.rewind) return 30;
    if(b<SEC.empty) return 30-29*smooth((b-SEC.rewind)/1);
    if(b<SEC.plants) return 1;
    if(b<SEC.fish) return 2+26*smooth((b-SEC.plants)/(SEC.fish-SEC.plants-0.5));
    return 28+2*smooth((b-SEC.fish)/0.6);
  }
  function label(/** @type {number} */ b){
    if(b<SEC.rewind) return '这缸，是我一块石头一块石头搭的';
    if(b<SEC.empty) return '';
    if(b<SEC.plants) return '先摆石头';
    if(b<SEC.fish) return '种牛毛毡';
    if(b<SEC.macro) return '放鱼';
    return '';
  }
  function shotAt(/** @type {number} */ b){
    let i=0; for(let k=0;k<SHOTS.length;k++) if(b>=SHOTS[k].at) i=k;
    const s=SHOTS[i], end=SHOTS[i+1]?.at ?? SEC.end;
    return { cam:s.cam, k:clamp01((b-s.at)/(end-s.at)), index:i };
  }
  return { plan, frame, shake, day, label, shotAt, get full(){ return full; } };
}
