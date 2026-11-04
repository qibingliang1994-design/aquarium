// @ts-check
import { budgetRatio } from './quality.js';
import { setCausticsLevel } from '../scene/caustics-gen.js';

/* ================================================================
 * 画质档位 → 渲染器 / 场景的副作用收口（createQuality 的 onLevel 回调）
 * 纯状态机与档位表在 quality.js；这里只把一档画质落到像素比、玻璃材质、后期特效、
 * 阴影刷新率与场景 LOD 上，并持有随档位变化的阴影累计器
 * ================================================================ */

/** @typedef {{ level:number, label:string, ratio:number, glass:'high'|'low', bloom:boolean, pixels:number|null, shadowHz:number }} LevelSpec */

/**
 * @param {{ renderer:any, composer:any, bloom:any, lens:any, tankGroup:any, glassHigh:any, glassLow:any,
 *   waterPass:any, renderPass:any, precip:any, reflect:any, runtime:any, tank:any, settings:Record<string, any> }} deps
 */
export function createQualityEffects({ renderer, composer, bloom, lens, tankGroup, glassHigh, glassLow, waterPass, renderPass, precip, reflect, runtime, tank, settings }){
  let bloomOn=true;                               // 当前画质档是否开泛光（最低档连光柱一起停）
  let shadowHz=30, shadowAcc=1/30;                // 阴影贴图刷新率（随画质档变化）与累计器；首帧就画一次

  /** 应用一档画质 @param {LevelSpec} q */
  function apply(q){
    // 像素预算：大窗口（4K 全屏等）按 sqrt(预算/窗口像素) 立即缩，不等帧率阶梯；小窗口仍用基准 dpr
    const ratio=budgetRatio(q.pixels, innerWidth, innerHeight, q.ratio);
    renderer.setPixelRatio(ratio);
    composer.setPixelRatio(ratio);
    composer.setSize(innerWidth,innerHeight);
    for(const g of /** @type {any[]} */ (tankGroup.children)){
      const gm=/** @type {any} */ (g);
      if(gm.material===glassHigh || gm.material===glassLow) gm.material=q.glass==='low'?glassLow:glassHigh;
    }
    bloom.enabled=q.bloom; lens.setDof(q.bloom && settings.dof!==false);   // 最低一档连景深一起关（用户也关了才算数）
    bloomOn=q.bloom;
    waterPass.setShafts(q.bloom ? settings.shafts : 0);   // 光柱 march 是最贵的逐像素步进：最低档停，其余按用户强度
    waterPass.setSteps([14,12,11,10,8,6,5][q.level] ?? 8);  // march 步数随档缩放（贴图化焦散调制后每步也便宜了）
    lens.setTaps([20,18,16,14,12,10,10][q.level] ?? 12);    // 景深采样点数随档缩放（半分辨率 + 弥散圆自适应后 20 点已满配）
    renderPass.setMSAA(0);   // 场景 RT 不开 MSAA：多采样深度纹理的逐帧 resolve 是隐性大开销（实测拖累帧率），几何边缘靠 edge-aa（FXAA）兜底
    renderPass.setAA(q.level<=4);
    renderPass.ao.setLevel(q.level);              // 环境光遮蔽：切片/步数随档减（随 AA 一起在最低两档关）   // 边缘抗锯齿（FXAA）：最低两档关
    renderPass.setScale([0.85,0.8,0.75,0.7,0.68,0.65,0.6][q.level] ?? 0.8);   // 渲染尺度分离：场景降尺度，后期全分辨率
    shadowHz=q.shadowHz; shadowAcc=Math.max(shadowAcc, 1/q.shadowHz);   // 变档立即按新频率走
    precip.setLevel(q.level);
    setCausticsLevel(q.level);                     // 焦散泼溅：低档隔帧更新
    reflect.setLevel(q.level);
    runtime.applyShore(q.level);
    runtime.applyShell(q.level);
    tank.setGrainLevel(q.level);
  }

  /** 主循环每帧调用：到点就把阴影贴图标记为需要重画（鱼游得慢，降频看不出来，省下投影 pass）
   * @param {number} rawDt 真实帧间隔（秒） */
  function shadowTick(rawDt){
    shadowAcc+=rawDt;
    if(shadowAcc>=1/shadowHz){ renderer.shadowMap.needsUpdate=true; shadowAcc%=1/shadowHz; }
  }

  return { apply, shadowTick, get bloom(){ return bloomOn; } };
}
