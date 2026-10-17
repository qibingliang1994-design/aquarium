// @ts-check
/* ================================================================
 * 缸体款式（纯数据）：只换外壳——框、玻璃边、灯具、底柜、灯色
 * 内部尺寸（玻璃/水面/沙床）所有款式一致，鱼群活动范围与造景坐标不受影响
 * light.spotCol / spotK：日间主灯颜色与强度倍率；spotY：主灯高度（吊灯更高）
 * ================================================================ */

/** @typedef {{ label:string, hint:string, light:{ spotCol:number, spotK:number, spotY:number, strip:number } }} TankStyle */

/** @type {Record<string, TankStyle>} */
export const TANK_STYLES = {
  classic: { label:'经典黑框', hint:'金属包边 · 一体灯罩 · 深色烤漆柜',
    light:{ spotCol:0xfff2dc, spotK:1, spotY:2.06, strip:0xfff2dd } },
  rimless: { label:'超白开缸', hint:'无框超白玻璃 · 吊装灯 · 橡木柜',
    light:{ spotCol:0xfff6e6, spotK:1.12, spotY:2.62, strip:0xfff8ee } },
  reef:    { label:'海水礁缸', hint:'加强顶框 · 双灯盘蓝白光 · 白色烤漆柜',
    light:{ spotCol:0xe4ecff, spotK:1.05, spotY:2.6, strip:0xcfe0ff } },
  zen:     { label:'和风木框', hint:'胡桃木框与格栅柜 · 木质灯檐 · 暖光',
    light:{ spotCol:0xffe6c4, spotK:0.95, spotY:2.12, strip:0xffdcae } },
};
export const TANK_IDS = Object.keys(TANK_STYLES);

/** @type {Record<string, string>} */
const BY_THEME = { fresh:'rimless', reef:'reef', pond:'zen' };
/** @type {Record<string, string>} */
const BY_PRESET = { classic:'classic', reef:'reef', pond:'zen' };

/** 旧存档没有 tank 字段时的兜底：预设按预设，其余按水体主题
 * @param {unknown} tank @param {string} theme @param {string} [presetId] */
export function resolveTank(tank, theme, presetId){
  if(typeof tank==='string' && TANK_STYLES[tank]) return tank;
  return (presetId && BY_PRESET[presetId]) || BY_THEME[theme] || 'classic';
}
