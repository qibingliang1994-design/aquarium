// @ts-check
import { THEMES, THEME_IDS } from '../scenes/themes.js';
import { holdDialog, releaseDialog } from './dialog.js';
import { fishTotal } from '../scenes/scene-doc.js';
import { TANK_STYLES } from '../scenes/tank-styles.js';
import { scenePlaceholder } from './scene-placeholder.js';

/* ================================================================
 * "我的水景"弹层：场景卡片（缩略图 / 名称 / 统计）+ 切换、造景、新建；
 * 低频的复制、改名、恢复预设、删除收在每张卡的「⋯」菜单里
 * 所有写操作经 store；切换/编辑交给 main 提供的回调
 * ================================================================ */

const $=(/** @type {string} */ id)=>{ const el=document.getElementById(id); if(!el) throw new Error(`missing #${id}`); return el; };

/** onCreate：新建空缸后直接进造景（放弃时由 main 删掉这个从未保存过的缸）
 * @param {{ store:any, onSwitch:any, onEdit:any, onCreate?:any, toast:any }} opts */
export function createScenePicker({ store, onSwitch, onEdit, onCreate=onEdit, toast }){
  const modal=$('scenes'), grid=$('sceneGrid');
  /** @type {string|null} */ let confirmId=null;
  /** @type {string|null} */ let renameId=null;

  const open=()=>{ confirmId=null; renameId=null; render(); holdDialog(modal, '#scenesClose'); };
  const close=()=>{ closeMenu(); if(!modal.hidden) releaseDialog(modal); };
  $('scenesClose').addEventListener('click', close);
  modal.addEventListener('click',e=>{
    if(menuEl && !(e.target instanceof Node && menuEl.contains(e.target))) closeMenu();
    if(e.target===modal) close();
  });
  $('scenesCard').addEventListener('scroll', ()=>closeMenu(), { passive:true });

  /* ---------- 卡片「⋯」菜单：挂在弹层根节点上（卡片 overflow:hidden 会裁掉） ---------- */
  /** @type {HTMLElement|null} */ let menuEl=null;
  function closeMenu(){
    if(!menuEl) return;
    menuEl.remove(); menuEl=null;
    for(const b of grid.querySelectorAll('[aria-expanded=true]')) b.setAttribute('aria-expanded','false');
  }
  function openMenu(/** @type {HTMLButtonElement} */ anchor, /** @type {any} */ doc){
    const reopen=menuEl && anchor.getAttribute('aria-expanded')==='true';
    closeMenu();
    if(reopen) return;                              // 再点一次「⋯」= 收起
    const m=document.createElement('div');
    m.className='scene-menu glass-strong';
    m.setAttribute('role','menu');
    m.setAttribute('aria-label',`「${doc.name}」更多操作`);
    const item=(/** @type {string} */ label, /** @type {()=>void} */ fn, cls='')=>{
      const b=document.createElement('button');
      b.type='button'; b.className=cls; b.textContent=label;
      b.setAttribute('role','menuitem');
      b.addEventListener('click',e=>{ e.stopPropagation(); closeMenu(); fn(); });
      return b;
    };
    m.append(
      item('复制',()=>{ const c=store.duplicate(doc.id); if(c){ render(); toast(`已复制为「${c.name}」`); } else toast('水景数量已达上限'); }),
      item('改名',()=>{ renameId=doc.id; render(); }),
    );
    if(doc.presetId) m.append(item('恢复预设',()=>{
      const d=store.reset(doc.id);
      if(d && doc.id===store.activeId) onSwitch(doc.id, { force:true });
      render(); toast(`「${doc.name}」已恢复为预设布局`);
    }));
    const del=item('删除',()=>{ confirmId=doc.id; render(); }, 'danger');
    if(store.list().length<=1){ del.disabled=true; del.title='至少要留一个水景'; }
    m.append(del);
    m.addEventListener('keydown',e=>{               // 菜单内上下键移动，Esc 收起回到「⋯」
      const items=/** @type {HTMLButtonElement[]} */ ([...m.querySelectorAll('button:not(:disabled)')]);
      const i=items.indexOf(/** @type {any} */ (document.activeElement));
      if(e.key==='ArrowDown' || e.key==='ArrowUp'){ e.preventDefault(); items[(i+(e.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus(); }
      if(e.key==='Escape'){ e.stopPropagation(); closeMenu(); anchor.focus(); }
    });
    modal.appendChild(m);
    const r=anchor.getBoundingClientRect(), w=m.offsetWidth, h=m.offsetHeight;
    m.style.left=`${Math.max(8, Math.min(r.right-w, innerWidth-w-8))}px`;
    m.style.top=`${r.bottom+6+h>innerHeight-8 ? r.top-6-h : r.bottom+6}px`;
    anchor.setAttribute('aria-expanded','true');
    menuEl=m;
    /** @type {HTMLButtonElement|null} */ (m.querySelector('button:not(:disabled)'))?.focus();
  }

  const btn=(/** @type {string} */ label, /** @type {string} */ cls, /** @type {()=>void} */ fn, /** @type {string} */ title)=>{
    const b=document.createElement('button');
    b.type='button'; b.className=`chip-btn ${cls}`; b.textContent=label;
    if(title) b.title=title;
    b.addEventListener('click',e=>{ e.stopPropagation(); fn(); });
    return b;
  };

  function card(/** @type {any} */ doc){
    const active=doc.id===store.activeId, theme=THEMES[doc.theme] ?? THEMES.fresh;
    const el=document.createElement('article');
    el.className=`scene-card${active?' active':''}`;
    el.style.setProperty('--th', theme.backdrop);

    const thumb=document.createElement('button');
    thumb.type='button'; thumb.className='scene-thumb';
    thumb.title=active ? '当前水景' : `切换到「${doc.name}」`;
    const src=store.thumb(doc.id);
    if(src){ const img=document.createElement('img'); img.alt=''; img.src=src; thumb.appendChild(img); }
    else thumb.insertAdjacentHTML('beforeend', `<span class="ph">${scenePlaceholder(doc.tank)}</span>`);
    thumb.insertAdjacentHTML('beforeend', `<span class="scene-badge${active?' now':''}">${active?'当前':theme.label}</span>`);
    thumb.addEventListener('click',()=>{ if(!active){ close(); onSwitch(doc.id); } });

    const body=document.createElement('div');
    body.className='scene-body';
    const name=document.createElement('div');
    name.className='scene-name';
    if(renameId===doc.id){
      const input=document.createElement('input');
      input.maxLength=16; input.value=doc.name;
      let closed=false;
      const done=(/** @type {boolean} */ ok)=>{
        if(closed) return;
        closed=true;
        if(ok && store.rename(doc.id, input.value)) onRenamed(doc.id);
        renameId=null; render();
      };
      input.addEventListener('keydown',e=>{ e.stopPropagation(); if(e.key==='Enter') done(true); if(e.key==='Escape') done(false); });
      input.addEventListener('blur',()=>done(true));
      name.appendChild(input);
      requestAnimationFrame(()=>{ input.focus(); input.select(); });
    } else name.textContent=doc.name;
    const meta=document.createElement('div');
    meta.className='scene-meta';
    meta.textContent=`${TANK_STYLES[doc.tank]?.label ?? ''} · ${fishTotal(doc)} 条鱼 · ${doc.items.length} 件造景${doc.presetId?' · 预设':''}`;
    body.append(name, meta);

    const acts=document.createElement('div');
    acts.className='scene-actions';
    if(confirmId===doc.id){
      acts.className='scene-confirm';
      acts.append('删除后无法找回，确定？',
        btn('删除','danger',()=>{ const wasActive=store.activeId===doc.id; store.remove(doc.id); confirmId=null;
          if(wasActive) onSwitch(store.activeId, { force:true }); render(); toast(`已删除「${doc.name}」`); }),
        btn('取消','',()=>{ confirmId=null; render(); }));
    } else {
      if(!active) acts.append(btn('进入','primary',()=>{ close(); onSwitch(doc.id); }, `切换到「${doc.name}」`));
      acts.append(btn('造景',active ? 'primary' : '',()=>{ close(); onEdit(doc.id); }, '进入造景编辑'));
      const more=btn('','more',()=>openMenu(more, doc),'复制 / 改名 / 恢复预设 / 删除');
      more.innerHTML='<svg class="icon" aria-hidden="true"><use href="#i-more"/></svg>';
      more.setAttribute('aria-label',`「${doc.name}」更多操作`);
      more.setAttribute('aria-haspopup','menu');
      more.setAttribute('aria-expanded','false');
      acts.append(more);
    }
    body.appendChild(acts);
    el.append(thumb, body);
    return el;
  }

  function newCard(){
    const el=document.createElement('article');
    el.className='scene-card scene-new';
    el.innerHTML='<h3><svg class="icon"><use href="#i-plus"/></svg>新建空缸</h3><p>从一缸清水开始：选一种水体风格，然后亲手摆放岩石、水草、珊瑚，再放入喜欢的鱼。</p>';
    const opts=document.createElement('div');
    opts.className='opts';
    for(const id of THEME_IDS) opts.appendChild(btn(THEMES[id].label,'',()=>{
      const d=store.create(`我的${THEMES[id].label}`, id);
      if(!d){ toast('水景数量已达上限'); return; }
      close(); onCreate(d.id);
    }));
    if(!store.canAdd()) opts.querySelectorAll('button').forEach(b=>{ b.disabled=true; });
    el.appendChild(opts);
    return el;
  }

  /** @type {(id:string)=>void} */ let onRenamed=()=>{};
  function render(){
    grid.replaceChildren(...store.list().map(card), newCard());
  }

  return {
    open, close,
    get isOpen(){ return !modal.hidden; },
    /** 当前场景改名后让 HUD 同步 @param {(id:string)=>void} fn */
    set onRenamed(fn){ onRenamed=fn; },
  };
}
