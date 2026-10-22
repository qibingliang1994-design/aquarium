// @ts-check
/* ================================================================
 * 水域款式（纯数据）：玻璃缸只换外壳（框、玻璃边、灯具、底柜、灯色）；
 * 自然水域（池塘 / 溪流 / 小河 / 大户外池塘）去掉玻璃与底柜，换成土岸地形 + 岸边植被 + 天空与日光
 * 不带 volume 的款式共用默认缸的内腔（4.6×2.2×1.8），鱼和造景坐标不变。
 * volume 是可选的水体尺寸，边界由 scenes/tank-bounds.js 按同一套内缩推出。
 * light.spotCol / spotK：日间主灯（自然水域即太阳）颜色与强度倍率；spotY：主灯高度
 * light.sun：有则按给定位置做平行太阳，不再按 spotY 做距离平方衰减（高太阳会被除没）
 * env（仅自然水域）：天空/雾色、雾浓度、环境光、水面通透度 clear、水流速度 current（+x 方向）
 *   clarity：只给大户外池塘的水色着色（见 weather.pondTint），不进饲养、不扣分
 * rig / cams / thumb：只在需要不同于默认机位的大场景上填
 * ================================================================ */

/** @typedef {{ bg:number, fog:number, fogD:number, hemi:number, fill:number, env:number, clear:number, current:number, clarity?:number }} WaterEnv */
/** @typedef {{ pos:[number,number,number], angle:number, penumbra:number, decay:number, distance:number, near:number, far:number, fit?:number }} SunRig */
/** @typedef {{ W:number, H:number, D:number, glass:number, waterY:number }} TankVolume */
/** @typedef {{ min:number, max:number, near:number, far:number }} CamRig */
/** @typedef {{ label:string, hint:string, kind:'tank'|'natural', bowl?:boolean,
 *   light:{ spotCol:number, spotK:number, spotY:number, strip:number, sun?:SunRig },
 *   env?:WaterEnv, volume?:TankVolume, rig?:CamRig,
 *   cams?:{pos:number[], tgt:number[]}[], thumb?:{pos:number[], tgt:number[]} }} TankStyle */

/** @type {Record<string, TankStyle>} */
export const TANK_STYLES = {
  classic: { label:'经典黑框', hint:'金属包边 · 一体灯罩 · 深色烤漆柜', kind:'tank',
    light:{ spotCol:0xfff2dc, spotK:1, spotY:2.06, strip:0xfff2dd } },
  rimless: { label:'超白开缸', hint:'无框超白玻璃 · 吊装灯 · 橡木柜', kind:'tank',
    light:{ spotCol:0xfff6e6, spotK:1.12, spotY:2.62, strip:0xfff8ee } },
  reef:    { label:'海水礁缸', hint:'加强顶框 · 双灯盘蓝白光 · 白色烤漆柜', kind:'tank',
    light:{ spotCol:0xe4ecff, spotK:1.05, spotY:2.6, strip:0xcfe0ff } },
  zen:     { label:'和风木框', hint:'胡桃木框与格栅柜 · 木质灯檐 · 暖光', kind:'tank',
    light:{ spotCol:0xffe6c4, spotK:0.95, spotY:2.12, strip:0xffdcae } },
  ming:    { label:'明式红木', hint:'紫檀推光漆框 · 翘头灯檐与宫灯 · 回纹明式柜', kind:'tank',
    light:{ spotCol:0xffe2b8, spotK:0.95, spotY:2.5, strip:0xffd6a0 } },
  pond:    { label:'山野池塘', hint:'草岸芦苇 · 水面清澈见底 · 静水', kind:'natural',
    light:{ spotCol:0xfff0d4, spotK:3.6, spotY:4.4, strip:0 },
    env:{ bg:0x9dbfcc, fog:0x93b6bf, fogD:0.026, hemi:0.6, fill:0.4, env:0.55, clear:1, current:0 } },
  stream:  { label:'山间溪流', hint:'卵石滩与岸石 · 清冽流水 · 鱼群顶流', kind:'natural',
    light:{ spotCol:0xfff6e8, spotK:3.9, spotY:4.4, strip:0 },
    env:{ bg:0xa7c8d8, fog:0x9cbfcd, fogD:0.024, hemi:0.62, fill:0.42, env:0.6, clear:1, current:0.16 } },
  river:   { label:'林间小河', hint:'沙滩缓岸 · 茶色河水 · 缓流', kind:'natural',
    light:{ spotCol:0xffe9c8, spotK:3.5, spotY:4.4, strip:0 },
    env:{ bg:0xa9bfb0, fog:0x9fb5a6, fogD:0.028, hemi:0.56, fill:0.38, env:0.5, clear:0.85, current:0.06 } },
  // 鱼的活动矩形内接在不规则岸线里（pondD<0.92）；视觉水面约 17×12，见 scene/pond-shape.js
  outdoor: { label:'大户外池塘', hint:'不规则石岸 · 开阔水面 · 晴雨雾雪', kind:'natural', bowl:true,
    light:{ spotCol:0xfff0d4, spotK:0.32, spotY:18, strip:0,
      sun:{ pos:[-18,26,-14], angle:0.72, penumbra:0.75, decay:0, distance:0, near:8, far:90, fit:12 } },
    env:{ bg:0x8fbfdc, fog:0xb7d0dc, fogD:0.012, hemi:0.7, fill:0.4, env:0.62, clear:1, current:0, clarity:0.88 },
    volume:{ W:11.11, H:2.2, D:6.45, glass:0, waterY:1.84 },
    rig:{ min:1.6, max:32, near:0.08, far:180 },
    cams:[
      { pos:[0,8.4,12.2], tgt:[0,0.35,0] },
      { pos:[11,5.6,7.5], tgt:[0.4,0.2,-0.2] },
      { pos:[0,16.5,1.2], tgt:[0,0.1,0] },
      { pos:[-7.5,3.8,5.2], tgt:[1.2,0.6,-0.4] },
    ],
    thumb:{ pos:[0,8.4,12.2], tgt:[0,0.35,0] } },
};
export const TANK_IDS = Object.keys(TANK_STYLES);

/** @type {Record<string, string>} */
const BY_THEME = { fresh:'rimless', reef:'reef', pond:'zen', stream:'stream', river:'river', garden:'ming' };
/** @type {Record<string, string>} */
const BY_PRESET = { classic:'classic', reef:'reef', pond:'zen' };

/** 自然水域的机位：俯视水面为主（没有前玻璃可以平视） */
export const NATURAL_CAMS = [
  { pos:[0,4.1,3.5],   tgt:[0,1.1,0.1] },
  { pos:[3.9,3.3,2.9], tgt:[0.2,1.1,0] },
  { pos:[0,5.2,1.3],   tgt:[0,1.1,0] },
  { pos:[-2.2,2.7,2.3], tgt:[-0.6,1.3,-0.1] },
];
/** @param {string} id */
export const isNatural = id => Object.hasOwn(TANK_STYLES, id) && TANK_STYLES[id].kind==='natural';

/** 旧存档没有 tank 字段时的兜底：预设按预设，其余按水体主题
 * @param {unknown} tank @param {string} theme @param {string} [presetId] */
export function resolveTank(tank, theme, presetId){
  if(typeof tank==='string' && Object.hasOwn(TANK_STYLES, tank)) return tank;
  return (presetId && Object.hasOwn(BY_PRESET, presetId) && BY_PRESET[presetId]) || (Object.hasOwn(BY_THEME, theme) && BY_THEME[theme]) || 'classic';
}
