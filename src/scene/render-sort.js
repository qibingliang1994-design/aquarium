// @ts-check

/* ================================================================
 * 不透明物体按"着色器程序"分组排序
 * three 默认按 material.id 排：id 是创建顺序，相邻两个材质往往属于不同程序，
 * 每次切程序都要重传整套灯光 / 相机 uniform（物理材质 + 多灯 + 阴影，量很大）。
 * 先按程序 id 再按材质 id，同一个程序的绘制连在一起，逐帧切程序次数减少一半以上。
 * 不透明物体靠深度测试，绘制顺序不影响结果；透明物体仍走 three 默认的由远到近。
 * ================================================================ */

/** @param {import('three').WebGLRenderer} renderer */
export function installProgramSort(renderer){
  const props=renderer.properties;
  const progOf=(/** @type {any} */ m)=>/** @type {any} */ (props.get(m)).currentProgram?.id ?? -1;   // 尚未编译（首帧）→ -1，排在最前
  renderer.setOpaqueSort((/** @type {any} */ a,/** @type {any} */ b)=>{
    if(a.groupOrder!==b.groupOrder) return a.groupOrder-b.groupOrder;
    if(a.renderOrder!==b.renderOrder) return a.renderOrder-b.renderOrder;
    const pa=progOf(a.material), pb=progOf(b.material);
    if(pa!==pb) return pa-pb;
    if(a.material.id!==b.material.id) return a.material.id-b.material.id;
    if(a.z!==b.z) return a.z-b.z;
    return a.id-b.id;
  });
}
