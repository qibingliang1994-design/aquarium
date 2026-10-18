// @ts-check
import { clamp } from '../utils.js';

/* ================================================================
 * 设置弹层：开关行（音效 / 自动昼夜 / 特效），锚定在 Dock 设置按钮上方
 * ================================================================ */
const TOGGLES = [
  ['setSound','sound'], ['setCycle','cycle'], ['setRays','rays'],
  ['setBubbles','bubbles'], ['setSnow','snow'], ['setCaustics','caustics'],
];
const GAP = 12;
// 取必有元素：缺失说明 index.html 与代码脱节，启动即失败好过静默坏掉
const $ = (/** @type {string} */ id) => { const el = document.getElementById(id); if (!el) throw new Error(`missing #${id}`); return el; };

/** @param {{ settings:Record<string, any>, onChange:(key:string,on:boolean)=>void }} opts */
export function createSettingsPanel({ settings, onChange }){
  const pop = $('settingsPop');
  const btn = /** @type {HTMLButtonElement} */ ($('bSettings'));
  /** @type {Record<string, HTMLInputElement>} */
  const boxes = {};
  for(const [id,key] of TOGGLES){
    const box = /** @type {HTMLInputElement} */ ($(id));
    boxes[key] = box;
    box.checked = !!settings[key];               // 初始状态与已存设置同步
    box.addEventListener('change',()=>onChange(key, box.checked));
  }

  function place(){
    const r = btn.getBoundingClientRect(), w = pop.offsetWidth;
    pop.style.left = `${clamp(r.left+r.width/2-w/2, GAP, innerWidth-w-GAP)}px`;
    pop.style.bottom = `${innerHeight-r.top+GAP}px`;
  }
  function setOpen(/** @type {boolean} */ on){
    pop.hidden = !on;
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-expanded', String(on));
    if(on) place();
  }
  btn.addEventListener('click',()=>setOpen(pop.hidden));
  document.addEventListener('click',e=>{
    const t = e.target;
    if(!pop.hidden && t instanceof Node && !pop.contains(t) && !btn.contains(t)) setOpen(false);
  });
  addEventListener('resize',()=>{ if(!pop.hidden) place(); });

  return {
    close:()=>setOpen(false),
    set:(/** @type {string} */ key,/** @type {boolean} */ on)=>{ if(boxes[key]) boxes[key].checked = on; },
  };
}
