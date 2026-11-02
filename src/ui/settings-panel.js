// @ts-check
import { clamp } from '../utils.js';

/* ================================================================
 * 设置弹层：环境（光照 / 缸灯 / 天气 / 音效）· 画面（画质 / 效果 / 水色）· 更多（说明 / 存档）三页，
 * 锚定在 Dock 设置按钮上方。控件四类：开关、滑杆（行内显示百分比）、单选组（光照 / 天气）、画质下拉
 * ================================================================ */
const TOGGLES = [
  ['setSound','sound'], ['setDof','dof'], ['setHaze','haze'],
  ['setBubbles','bubbles'], ['setSnow','snow'], ['setCaustics','caustics'],
];
/** 滑杆行：onChange(key, 数值)，值显示在行内 <b> 里（百分比） */
const SLIDERS = [
  ['setLamp','lamp'], ['setAbsorb','absorb'], ['setShafts','shafts'], ['setWeatherI','weatherI'], ['setClarity','clarity'],
];
/** 下拉：onChange(key, 字符串) */
const SELECTS = [ ['setQuality','qualityMode'] ];
/** 光照四选一：日间 / 夜间是手动（onChange('light', 'day'|'night')），循环 / 定时对应两个互斥的设置键 */
const LIGHT_HINT = /** @type {Record<string, string>} */ ({
  day:'缸灯常亮', night:'月光下鱼群放慢、沉到下层休息',
  cycle:'约 3 分钟走完一个昼夜', clock:'8:00 开灯 · 21:30 关灯',
});
const EXCLUSIVE = /** @type {Record<string, string>} */ ({ cycle:'clock', clock:'cycle' });
const GAP = 10;
// 取必有元素：缺失说明 index.html 与代码脱节，启动即失败好过静默坏掉
const $ = (/** @type {string} */ id) => { const el = document.getElementById(id); if (!el) throw new Error(`missing #${id}`); return el; };
const radios = (/** @type {string} */ id) => [.../** @type {NodeListOf<HTMLButtonElement>} */ ($(id).querySelectorAll('button[role=radio]'))];

/**
 * @param {{ settings:Record<string, any>, onChange:(key:string,value:boolean|number|string)=>void,
 *   lightMode:()=>'day'|'night'|'cycle'|'clock', isBowl:()=>boolean }} opts
 *   lightMode：当前光照模式（手动日 / 夜看昼夜目标值）；isBowl：当前水景是户外池塘（才显示池水清澈度）
 */
export function createSettingsPanel({ settings, onChange, lightMode, isBowl }){
  const pop = $('settingsPop');
  const btn = /** @type {HTMLButtonElement} */ ($('bSettings'));

  /* ---------- 分页 ---------- */
  const tabs = [.../** @type {NodeListOf<HTMLButtonElement>} */ (pop.querySelectorAll('[role=tab]'))];
  function showTab(/** @type {HTMLButtonElement} */ tab, focus=false){
    for(const t of tabs){
      const on = t===tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      $(/** @type {string} */ (t.getAttribute('aria-controls'))).hidden = !on;
    }
    if(focus) tab.focus();
  }
  tabs.forEach((t, i)=>{
    t.addEventListener('click', ()=>showTab(t));
    t.addEventListener('keydown', e=>{               // 左右方向键在分页间移动（tablist 惯例）
      const d = e.key==='ArrowRight' ? 1 : e.key==='ArrowLeft' ? -1 : 0;
      if(!d) return;
      e.preventDefault();
      showTab(tabs[(i+d+tabs.length)%tabs.length], true);
    });
  });

  /* ---------- 开关 / 滑杆 / 下拉 ---------- */
  /** @type {Record<string, HTMLInputElement>} */
  const boxes = {};
  for(const [id,key] of TOGGLES){
    const box = /** @type {HTMLInputElement} */ ($(id));
    boxes[key] = box;
    box.checked = !!settings[key];               // 初始状态与已存设置同步
    box.addEventListener('change',()=>onChange(key, box.checked));
  }
  /** @type {Record<string, HTMLElement>} */
  const readouts = {};
  /** @type {Record<string, HTMLInputElement>} */
  const sliderEls = {};
  const pct = (/** @type {number} */ v)=>`${Math.round(v*100)}%`;
  for(const [id,key] of SLIDERS){
    const slider = /** @type {HTMLInputElement} */ ($(id));
    sliderEls[key] = slider;
    const out = slider.parentElement?.querySelector('b') ?? null;
    if(out) readouts[key] = out;
    slider.value = String(settings[key]);        // 初始状态与已存设置同步
    if(out) out.textContent = pct(settings[key]);
    slider.addEventListener('input',()=>{
      const v = parseFloat(slider.value);
      if(out) out.textContent = pct(v);
      onChange(key, v);
    });
  }
  /** @type {Record<string, HTMLSelectElement>} */
  const selects = {};
  for(const [id,key] of SELECTS){
    const sel = /** @type {HTMLSelectElement} */ ($(id));
    selects[key] = sel;
    const want = String(settings[key] ?? '');
    if([...sel.options].some(o => o.value===want)) sel.value = want;
    sel.addEventListener('change',()=>onChange(key, sel.value));
  }

  /* ---------- 单选组：光照 / 天气 ---------- */
  const markRadios = (/** @type {HTMLButtonElement[]} */ list, /** @type {string} */ v)=>{
    for(const b of list){
      const on = b.dataset.v===v;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    }
  };
  /** 单选组的方向键：在组内移动并直接选中 */
  function radioKeys(/** @type {HTMLButtonElement[]} */ list, /** @type {(b:HTMLButtonElement)=>void} */ pick){
    list.forEach((b, i)=>b.addEventListener('keydown', e=>{
      const d = e.key==='ArrowRight' || e.key==='ArrowDown' ? 1 : e.key==='ArrowLeft' || e.key==='ArrowUp' ? -1 : 0;
      if(!d) return;
      e.preventDefault();
      const next = list[(i+d+list.length)%list.length];
      pick(next); next.focus();
    }));
  }

  const lightBtns = radios('setLight'), lightHint = $('lightHint');
  function renderLight(){
    const m = lightMode();
    markRadios(lightBtns, m);
    lightHint.textContent = LIGHT_HINT[m] ?? '';
  }
  function pickLight(/** @type {HTMLButtonElement} */ b){
    const v = /** @type {string} */ (b.dataset.v);
    if(v==='cycle' || v==='clock'){
      const other = EXCLUSIVE[v];
      if(settings[other]) onChange(other, false);
      if(!settings[v]) onChange(v, true);
    } else onChange('light', v);
    renderLight();
  }
  for(const b of lightBtns) b.addEventListener('click', ()=>pickLight(b));
  radioKeys(lightBtns, pickLight);

  const weatherBtns = radios('setWeather'), weatherHint = $('weatherHint');
  const weatherLabel = (/** @type {string} */ mode)=>weatherBtns.find(b=>b.dataset.v===mode)?.textContent ?? '';
  function renderWeather(){
    const auto = !!settings.weatherAuto;
    markRadios(weatherBtns, auto ? 'auto' : String(settings.weatherMode));
    for(const b of weatherBtns) b.classList.toggle('cur', auto && b.dataset.v===settings.weatherMode);   // 自动轮换时标出眼下这种
    weatherHint.textContent = auto ? `现在是${weatherLabel(settings.weatherMode)}，约半分钟换一种` : '';
  }
  function pickWeather(/** @type {HTMLButtonElement} */ b){
    const v = /** @type {string} */ (b.dataset.v);
    if(v==='auto'){ if(!settings.weatherAuto) onChange('weatherAuto', true); }
    else {
      if(settings.weatherAuto) onChange('weatherAuto', false);
      onChange('weatherMode', v);
    }
    renderWeather();
  }
  for(const b of weatherBtns) b.addEventListener('click', ()=>pickWeather(b));
  radioKeys(weatherBtns, pickWeather);

  const clarityRow = $('clarityRow');
  /** 重新读取外部状态（光照模式 / 天气 / 当前水景是否户外池塘） */
  function refresh(){
    renderLight();
    renderWeather();
    clarityRow.hidden = !isBowl();
  }
  refresh();

  /* ---------- 开合与定位 ---------- */
  function place(){
    const r = btn.getBoundingClientRect(), w = pop.offsetWidth;
    pop.style.left = `${clamp(r.left+r.width/2-w/2, GAP, innerWidth-w-GAP)}px`;
    pop.style.bottom = `${innerHeight-r.top+GAP}px`;
  }
  function setOpen(/** @type {boolean} */ on){
    pop.hidden = !on;
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-expanded', String(on));
    if(on){ refresh(); place(); }
  }
  btn.addEventListener('click',()=>setOpen(pop.hidden));
  document.addEventListener('click',e=>{
    const t = e.target;
    if(!pop.hidden && t instanceof Node && !pop.contains(t) && !btn.contains(t)) setOpen(false);
  });
  addEventListener('resize',()=>{ if(!pop.hidden) place(); });

  /** 外部改了某项设置时同步控件，不再次触发 onChange @param {string} key @param {boolean|number|string} value */
  function sync(key, value){
    if(typeof value==='boolean' && boxes[key]) boxes[key].checked = value;
    if(typeof value==='number' && sliderEls[key]){
      sliderEls[key].value = String(value);
      if(readouts[key]) readouts[key].textContent = pct(value);
    }
    if(selects[key]) selects[key].value = String(value);
    if(key==='weatherMode' || key==='weatherAuto') renderWeather();
    if(key==='cycle' || key==='clock') renderLight();
  }

  return {
    get isOpen(){ return !pop.hidden; },
    close:()=>setOpen(false),
    refresh,
    set:(/** @type {string} */ key,/** @type {boolean} */ on)=>sync(key, on),
    sync,
  };
}
