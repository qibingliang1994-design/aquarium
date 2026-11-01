// @ts-check

/* ================================================================
 * "只进阴影 pass" 的图层
 * 阴影贴图每次刷新要把所有投影物再画一遍。一个物种的鱼有 3~6 个子网格（身体/鳍/眼睛…），逐个投影就是 3~6 次绘制；
 * 改成一个合并后的"影子代理"网格（只有位置与蒙皮，深度材质）一次画完，真实子网格不再投影。
 * 代理放在图层 SHADOW_ONLY：相机默认只开图层 0，所以主画面里看不到它；
 * 阴影 pass 里 three 用主相机的图层做可见性测试，这里在阴影渲染期间临时给那台相机打开该图层。
 * ================================================================ */

export const SHADOW_ONLY_LAYER = 1;

/** @param {import('three').WebGLRenderer} renderer */
export function installShadowOnlyLayer(renderer){
  const sm=renderer.shadowMap, render=sm.render.bind(sm);
  sm.render=(/** @type {any} */ lights, /** @type {any} */ scene, /** @type {any} */ camera)=>{
    camera.layers.enable(SHADOW_ONLY_LAYER);
    try{ render(lights, scene, camera); } finally{ camera.layers.disable(SHADOW_ONLY_LAYER); }
  };
}
