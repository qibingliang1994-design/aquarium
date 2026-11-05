import { describe, it, expect } from 'vitest';
import { ECOLOGY, ecologyTags, mixNote, WATER_LABEL, TEMP_LABEL } from '../src/entities/fish/ecology.js';
import { FISH_IDS } from '../src/scenes/scene-doc.js';
import { PRESETS } from '../src/scenes/presets.js';
import { SPECIES } from '../src/entities/fish/species.js';

const lengths = Object.fromEntries(SPECIES.map(s => [s.id, s.L]));
const names = { gourami: '丽丽', mandarin: '麒麟鱼', clown: '小丑鱼', scalare: '神仙鱼', tetra: '霓虹脂鲤' };
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
  it('肉食鱼只有神仙鱼', () => {
    expect(FISH_IDS.filter(id => ECOLOGY[id].predator)).toEqual(['scalare']);
  });
});

describe('mixNote', () => {
  const byId = Object.fromEntries(PRESETS.map(p => [p.id, p.fish]));
  it.each([
    ['classic', '26 °C'], ['planted', '神仙鱼会把霓虹脂鲤当点心'],
    ['stream', '26 °C'], ['river', '26 °C'],
    ['reef', null],
    ['pond', null], ['lotus', null], ['garden', null], ['outdoor', null], ['iwagumi', null],
    ['donha', null], ['yururi', null], ['ashy', null],
  ])('预设 %s', (id, want) => {
    const got = note(byId[id]);
    if (want === null) expect(got).toBeNull();
    else expect(got).toContain(want);
  });
  it('13 个预设都有预期', () => { expect(PRESETS).toHaveLength(13); });
  it('温水鼠鱼不触发冷热水', () => {
    expect(note({ gold: 3, cory: 4 })).toBeNull();
    expect(note({ tetra: 3, cory: 4 })).toBeNull();
  });
  it('数量为 0 的物种不算', () => {
    expect(note({ gold: 3, tetra: 0 })).toBeNull();
  });
  it('淡海水优先于冷热水与肉食', () => {
    expect(note({ gold: 1, scalare: 1, mandarin: 1 })).toContain('淡水鱼和海水鱼');
  });
  it('点心线是肉食鱼体长的 0.7 倍：丽丽 0.22 < 0.266 算点心，长到 0.3 就不算', () => {
    expect(note({ scalare: 1, gourami: 2 })).toContain('神仙鱼会把丽丽当点心');
    expect(mixNote({ scalare: 1, gourami: 2 }, { lengths: { ...lengths, gourami: 0.3 }, names })).toBeNull();
  });
});
