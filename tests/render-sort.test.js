import { describe, it, expect } from 'vitest';
import { installProgramSort } from '../src/scene/render-sort.js';

/** 假渲染器：只记录 setOpaqueSort 与 properties.get */
function fakeRenderer(programOf){
  let cmp = null;
  return {
    properties: { get: (m) => ({ currentProgram: programOf(m) }) },
    setOpaqueSort: (f) => { cmp = f; },
    get cmp(){ return cmp; },
  };
}
const item = (id, matId, z, extra = {}) => ({ id, z, groupOrder:0, renderOrder:0, material:{ id:matId }, ...extra });

describe('不透明物体按着色器程序分组', () => {
  it('同程序的绘制连在一起（材质 id 交错也一样）', () => {
    const prog = { 1:{ id:10 }, 2:{ id:20 }, 3:{ id:10 }, 4:{ id:20 } };
    const r = fakeRenderer(m => prog[m.id]); installProgramSort(r);
    const list = [item(1, 1, 5), item(2, 2, 5), item(3, 3, 5), item(4, 4, 5)];
    list.sort(r.cmp);
    expect(list.map(o => o.material.id)).toEqual([1, 3, 2, 4]);          // 程序 10 的两个在前，20 的两个在后
  });

  it('groupOrder / renderOrder 优先于程序；同材质按距离由近到远', () => {
    const r = fakeRenderer(() => ({ id:7 })); installProgramSort(r);
    const a = item(1, 1, 9, { renderOrder:-1 }), b = item(2, 1, 3), c = item(3, 1, 1), d = item(4, 1, 0, { groupOrder:1 });
    const list = [d, b, a, c]; list.sort(r.cmp);
    expect(list.map(o => o.id)).toEqual([1, 3, 2, 4]);
  });

  it('尚未编译（无 currentProgram）不崩', () => {
    const r = fakeRenderer(() => undefined); installProgramSort(r);
    expect(() => [item(1, 1, 1), item(2, 2, 2)].sort(r.cmp)).not.toThrow();
  });
});
