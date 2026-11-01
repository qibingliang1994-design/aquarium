// @ts-check

/* ================================================================
 * 水景卡片占位图：还没进过的水景没有缩略图，原来所有卡片都是同一个居中的鱼图标。
 * 这里按缸体款式画一张剪影小插画（线条取卡片主题色 currentColor）：玻璃缸是缸框 + 沙面 + 水草 + 石头，
 * 池塘是不规则水面 + 芦苇 + 睡莲，溪流 / 河是一道蜿蜒的水带。同一套鱼剪影，让卡片一眼分得出是什么水景。
 * 纯字符串拼 SVG，没有 DOM 依赖。
 * ================================================================ */

/** 鱼剪影：(x, y) 为鱼心，s 为缩放，dir=-1 朝左 */
function fish(/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ s=1, /** @type {number} */ dir=1){
  return `<g transform="translate(${x} ${y}) scale(${dir*s} ${s})" fill="currentColor" opacity=".75">`
    +'<path d="M-9 0C-5-5 4-5 8 0C4 5-5 5-9 0Z"/><path d="M7 0L14-5V5Z"/></g>';
}

/** 一丛水草：根在 (x, y)，h 为高，向两侧弯 */
function blades(/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ h){
  return `<path d="M${x} ${y}C${x-4} ${y-h*.5} ${x-7} ${y-h*.8} ${x-5} ${y-h}`
    +`M${x} ${y}C${x+1} ${y-h*.6} ${x+4} ${y-h*.9} ${x+3} ${y-h*1.1}`
    +`M${x+3} ${y}C${x+8} ${y-h*.4} ${x+10} ${y-h*.7} ${x+9} ${y-h*.9}" `
    +'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>';
}

/** @param {string} styleId 缸体款式 id（tank-styles.js） */
export function scenePlaceholder(styleId){
  let body;
  if(styleId==='stream' || styleId==='river'){
    const w=styleId==='river' ? 16 : 9;       // 河宽，溪窄
    body=`<path d="M-4 66C30 52 52 74 86 56S134 40 164 30" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" opacity=".28"/>`
      +'<path d="M-4 66C30 52 52 74 86 56S134 40 164 30" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="3 7" opacity=".6"/>'
      +fish(60, 62, .9)+fish(112, 46, .8)+blades(22, 80, 20)+blades(138, 84, 16);
  }else if(styleId==='pond' || styleId==='outdoor'){
    body='<path d="M22 52C20 32 56 22 86 26S146 34 142 56S104 82 74 78S24 70 22 52Z" fill="currentColor" opacity=".22"/>'
      +'<path d="M22 52C20 32 56 22 86 26S146 34 142 56S104 82 74 78S24 70 22 52Z" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".6"/>'
      +'<ellipse cx="108" cy="46" rx="9" ry="4" fill="currentColor" opacity=".5"/><ellipse cx="52" cy="60" rx="7" ry="3.2" fill="currentColor" opacity=".45"/>'
      +fish(80, 54, 1)+fish(60, 42, .75, -1)+blades(34, 70, 22)+blades(132, 66, 20);
  }else{
    // 玻璃缸：缸框 + 缸内水面线 + 沙面起伏 + 水草 / 石头
    body='<rect x="18" y="20" width="124" height="62" rx="4" fill="currentColor" opacity=".1" stroke="currentColor" stroke-width="1.4"/>'
      +'<path d="M18 32H142" stroke="currentColor" stroke-width="1" opacity=".5"/>'
      +'<path d="M19 72C44 66 66 74 92 69S130 66 141 70V81H19Z" fill="currentColor" opacity=".32"/>'
      +'<path d="M78 70C84 62 96 62 100 70Z" fill="currentColor" opacity=".5"/>'
      +blades(36, 72, 28)+blades(120, 70, 24)+fish(70, 46, 1)+fish(104, 54, .8, -1)+fish(52, 58, .6);
  }
  return `<svg class="ph-art" viewBox="0 0 160 90" aria-hidden="true">${body}</svg>`;
}
