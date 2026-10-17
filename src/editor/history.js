// @ts-check
/* ================================================================
 * 撤销/重做栈：存整份文档的 JSON 快照（场景文档很小，简单可靠）
 * ================================================================ */

/** @param {number} [limit] */
export function createHistory(limit=60){
  /** @type {string[]} */ const undoStack=[];
  /** @type {string[]} */ const redoStack=[];
  return {
    /** 记录"改动之前"的快照；新改动会清空重做栈 @param {string} before */
    push(before){
      undoStack.push(before);
      if(undoStack.length>limit) undoStack.shift();
      redoStack.length=0;
    },
    /** @param {string} current @returns {string|null} 要恢复成的快照 */
    undo(current){
      const prev=undoStack.pop();
      if(prev===undefined) return null;
      redoStack.push(current);
      return prev;
    },
    /** @param {string} current @returns {string|null} */
    redo(current){
      const next=redoStack.pop();
      if(next===undefined) return null;
      undoStack.push(current);
      return next;
    },
    get canUndo(){ return undoStack.length>0; },
    get canRedo(){ return redoStack.length>0; },
    clear(){ undoStack.length=0; redoStack.length=0; },
  };
}
