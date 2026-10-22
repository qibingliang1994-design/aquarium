// @ts-check
import { clamp } from '../utils.js';

/* ================================================================
 * 设置弹层：开关行（音效 / 自动昼夜 / 跟随本地时间 / 特效）与滑杆行
 * （灯光亮度 / 水色浓淡 / 光柱强度），锚定在 Dock 设置按钮上方
 * ================================================================ */
const TOGGLES = [
  ['setSound','sound'], ['setCycle','cycle'], ['setClock','clock'],
  ['setDof','dof'], ['setHaze','haze'],
  ['setBubbles','bubbles'], ['setSnow','snow'], ['setCaustics','caustics'],
];
/** 滑杆行：onChange(key, 数值)，值显示在行内 <b> 里（百分比） */
const SLIDERS = [
  ['setLamp','lamp'], ['setAbsorb','absorb'], ['setShafts','shafts'],
];
/** 互斥的开关：打开一个时另一个自动关掉（自动昼夜循环 ↔ 跟随本地时间） */
const EXCLUSIVE = /** @type {Record<string, string>} */ ({ cycle:'clock', clock:'cycle' });
const GAP = 12;
// 取必有元素：缺失说明 index.html 与代码脱节，启动即失败好过静默坏掉
const $ = (/** @type {string} */ id) => { const el = document.getElementById(id); if (!el) throw new Error(`missing #${id}`); return el; };

/** @param {{ settings:Record<string, any>, onChange:(key:string,value:boolean|number)=>void }} opts */
export function createSettingsPanel({ settings, onChange }){
  const pop = $('settingsPop');
  const btn = /** @type {HTMLButtonElement} */ ($('bSettings'));
  /** @type {Record<string, HTMLInputElement>} */
  const boxes = {};
  for(const [id,key] of TOGGLES){
    const box = /** @type {HTMLInputElement} */ ($(id));
    boxes[key] = box;
    box.checked = !!settings[key];               // 初始状态与已存设置同步
    box.addEventListener('change',()=>{
      const other = EXCLUSIVE[key];
      if(box.checked && other && boxes[other]?.checked){ boxes[other].checked = false; onChange(other, false); }
      onChange(key, box.checked);
    });
  }
  /** @type {Record<string, HTMLElement>} */
  const readouts = {};
  for(const [id,key] of SLIDERS){
    const slider = /** @type {HTMLInputElement} */ ($(id));
    const out = slider.parentElement?.querySelector('b') ?? null;
    if(out) readouts[key] = out;
    const show = (/** @type {number} */ v)=>{ if(out) out.textContent = `${Math.round(v*100)}%`; };
    slider.value = String(settings[key]);        // 初始状态与已存设置同步
    show(settings[key]);
    slider.addEventListener('input',()=>{
      const v = parseFloat(slider.value);
      show(v);
      onChange(key, v);
    });
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
