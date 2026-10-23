// @ts-check
/* ================================================================
 * 地面高度：默认就是缸的沙床 sandHeight。大户外池塘等碗形底在换壳时
 * 用 setGround 盖上一层（中心深、岸边浅）；换回玻璃缸时传 null。
 * 鱼的贴底、饲料落点、物件接地、接触阴影都走 groundY，沙床公式本身不动。
 * ================================================================ */

/** @type {(x:number, z:number)=>number} */
let base = () => 0;
/** @type {((x:number, z:number)=>number)|null} */
let over = null;

/** 注册沙床（tank.js 在模块初始化时调用一次） @param {(x:number, z:number)=>number} fn */
export function setGroundBase(fn){ base = fn; }

/** 当前场景的地面覆盖；null = 回到沙床 @param {((x:number, z:number)=>number)|null} fn */
export function setGround(fn){ over = fn || null; }

/** @param {number} x @param {number} z */
export function groundY(x, z){ return (over || base)(x, z); }
