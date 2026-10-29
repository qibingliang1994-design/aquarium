// @ts-check
/* 模态层：打开时挡住背后的键盘焦点，关闭后还回去。 */

/** @type {HTMLElement|null} */
let prev=null;

/** @param {HTMLElement} el @param {string} focusSel */
export function holdDialog(el, focusSel){
  prev=document.activeElement instanceof HTMLElement ? document.activeElement : null;
  el.hidden=false;
  for(const node of document.body.children) if(node!==el) node.setAttribute('inert','');
  const f=el.querySelector(focusSel);
  if(f instanceof HTMLElement) f.focus();
}

/** @param {HTMLElement} el */
export function releaseDialog(el){
  el.hidden=true;
  for(const node of document.body.children) node.removeAttribute('inert');
  const back=prev;
  prev=null;
  back?.focus();
}
