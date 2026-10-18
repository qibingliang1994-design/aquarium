import { describe, it, expect } from 'vitest';
import { fishName, schoolNames, personaTags } from '../src/entities/fish/identity.js';

describe('fishName / schoolNames', () => {
  it('同一条鱼（场景+物种+序号）名字永远一致', () => {
    expect(fishName('sc-1', 'tetra', 3)).toBe(fishName('sc-1', 'tetra', 3));
    expect(schoolNames('a', 'gold', 4)).toEqual(schoolNames('a', 'gold', 4));
  });

  it('不同场景 / 不同个体名字（默认）不同', () => {
    expect(fishName('sc-1', 'tetra', 3)).not.toBe(fishName('sc-2', 'tetra', 3));
    expect(fishName('sc-1', 'tetra', 3)).not.toBe(fishName('sc-1', 'tetra', 4));
  });

  it('一群鱼内不重名（最大容量 40 条），且都是两字中文名', () => {
    for(const [species, n] of [['tetra', 40], ['gold', 10], ['koi', 6], ['mandarin', 6]]){
      const names=schoolNames('sc-x', species, n);
      expect(new Set(names).size).toBe(n);
      for(const name of names) expect(name).toMatch(/^[\u4e00-\u9fff]{2}$/);
    }
  });
});

describe('personaTags', () => {
  const avg={ spd:0.5, turn:0.2 };
  const st=(spd,turn,layer,obs=60)=>({ spd, turn, layer, obs });

  it('观察时长不足时显示"观察中"', () => {
    expect(personaTags(st(0.9,0.5,0.9,3), avg)).toEqual(['观察中']);
  });

  it('速度/好动相对全群平均分档，水层按绝对位置分档', () => {
    expect(personaTags(st(0.9,0.5,0.9), avg)).toContain('急性子');
    expect(personaTags(st(0.9,0.5,0.9), avg)).toContain('上层巡游');
    expect(personaTags(st(0.2,0.05,0.1), avg)).toContain('慢性子');
    expect(personaTags(st(0.2,0.05,0.1), avg)).toContain('底栖宅');
  });

  it('居中的个体拿到中间档标签，恒为三条', () => {
    expect(personaTags(st(0.5,0.2,0.5), avg)).toEqual(['从容','安稳','中层漫游']);
  });
});
