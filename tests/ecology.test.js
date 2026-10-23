import { describe, it, expect } from 'vitest';
import { ECOLOGY, ecologyTags, mixNote, WATER_LABEL, TEMP_LABEL } from '../src/entities/fish/ecology.js';
import { FISH_IDS } from '../src/scenes/scene-doc.js';
import { PRESETS } from '../src/scenes/presets.js';
import { SPECIES } from '../src/entities/fish/species.js';

const lengths = Object.fromEntries(SPECIES.map(s => [s.id, s.L]));
const names = { lion: '狮子鱼', mandarin: '麒麟鱼', clown: '小丑鱼' };
const note = fish => mixNote(fish, { lengths, names });

describe('物种生态标签', () => {
  it('FISH_IDS 每个物种都有合法的水 / 水温标签（新物种漏填即失败）', () => {
    for (const id of FISH_IDS) {
      const e = ECOLOGY[id];
      expect(e, id).toBeTruthy();
      expect(Object.keys(WATER_LABEL)).toContain(e.water);
      expect(Object.keys(TEMP_LABEL)).toContain(e.temp);
      expect(ecologyTags(id)).toHaveLength(2);
    }
  });
  it('只有狮子鱼是肉食鱼', () => {
    expect(FISH_IDS.filter(id => ECOLOGY[id].predator)).toEqual(['lion']);
  });
});

describe('mixNote', () => {
  const byId = Object.fromEntries(PRESETS.map(p => [p.id, p.fish]));
  it.each([
    ['classic', '淡水鱼和海水鱼'], ['planted', '淡水鱼和海水鱼'],
    ['stream', '26 °C'], ['river', '26 °C'],
    ['reef', '狮子鱼会把麒麟鱼当点心'],
    ['pond', null], ['lotus', null], ['garden', null], ['outdoor', null],
  ])('预设 %s', (id, want) => {
    const got = note(byId[id]);
    if (want === null) expect(got).toBeNull();
    else expect(got).toContain(want);
  });
  it('9 个预设都有预期', () => { expect(PRESETS).toHaveLength(9); });
  it('温水鼠鱼不触发冷热水', () => {
    expect(note({ gold: 3, cory: 4 })).toBeNull();
    expect(note({ tetra: 3, cory: 4 })).toBeNull();
  });
  it('数量为 0 的物种不算', () => {
    expect(note({ gold: 3, tetra: 0 })).toBeNull();
  });
  it('淡海水优先于冷热水与肉食', () => {
    expect(note({ gold: 1, lion: 1, mandarin: 1 })).toContain('淡水鱼和海水鱼');
  });
  it('小丑鱼（0.2）比狮子鱼的 0.7 倍（0.182）大，不算点心', () => {
    expect(note({ lion: 1, clown: 4 })).toBeNull();
  });
});
