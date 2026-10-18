// @ts-check
/* ================================================================
 * 水域款式（纯数据）：玻璃缸只换外壳（框、玻璃边、灯具、底柜、灯色）；
 * 自然水域（池塘 / 溪流 / 小河）去掉玻璃与底柜，换成土岸地形 + 岸边植被 + 天空与日光
 * 内部水体尺寸所有款式一致，鱼群活动范围与造景坐标不受影响
 * light.spotCol / spotK：日间主灯（自然水域即太阳）颜色与强度倍率；spotY：主灯高度
 * env（仅自然水域）：天空/雾色、雾浓度、环境光、水面通透度 clear、水流速度 current（+x 方向）
 * ================================================================ */

/** @typedef {{ bg:number, fog:number, fogD:number, hemi:number, fill:number, env:number, clear:number, current:number }} WaterEnv */
/** @typedef {{ label:string, hint:string, kind:'tank'|'natural', light:{ spotCol:number, spotK:number, spotY:number, strip:number },
 *   env?:WaterEnv }} TankStyle */

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
  pond:    { label:'山野池塘', hint:'草岸芦苇 · 水面清澈见底 · 静水', kind:'natural',
    light:{ spotCol:0xfff0d4, spotK:2.6, spotY:4.4, strip:0 },
    env:{ bg:0x9dbfcc, fog:0x93b6bf, fogD:0.026, hemi:0.85, fill:0.9, env:0.6, clear:1, current:0 } },
  stream:  { label:'山间溪流', hint:'卵石滩与岸石 · 清冽流水 · 鱼群顶流', kind:'natural',
    light:{ spotCol:0xfff6e8, spotK:2.8, spotY:4.4, strip:0 },
    env:{ bg:0xa7c8d8, fog:0x9cbfcd, fogD:0.024, hemi:0.9, fill:1.0, env:0.65, clear:1, current:0.16 } },
  river:   { label:'林间小河', hint:'沙滩缓岸 · 茶色河水 · 缓流', kind:'natural',
    light:{ spotCol:0xffe9c8, spotK:2.5, spotY:4.4, strip:0 },
    env:{ bg:0xa9bfb0, fog:0x9fb5a6, fogD:0.028, hemi:0.8, fill:0.85, env:0.55, clear:0.85, current:0.06 } },
};
export const TANK_IDS = Object.keys(TANK_STYLES);

/** @type {Record<string, string>} */
const BY_THEME = { fresh:'rimless', reef:'reef', pond:'zen', stream:'stream', river:'river' };
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
