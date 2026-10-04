import { describe, expect, it } from 'vitest';
import {
  comparePinyin,
  formatNumbered,
  formatWord,
  isValidSyllable,
  markSyllable,
  parseNumbered,
  parsePinyin,
  surfaceTones,
  SYLLABLES,
} from './pinyin';

const syl = parseNumbered;
const p = (s: string) => {
  const r = parsePinyin(s);
  return r && formatNumbered(r);
};
const sandhi = (hanzi: string, pinyin: string) =>
  surfaceTones([...hanzi].map((h, i) => ({ hanzi: h, tone: syl(pinyin)[i].tone ?? 0 })));

describe('syllable inventory', () => {
  it('accepts real syllables and rejects impossible ones', () => {
    for (const ok of ['a', 'zhuang', 'nü', 'lüe', 'er', 'yong', 'jiong', 'r', 'ng', 'dia']) expect(isValidSyllable(ok), ok).toBe(true);
    for (const bad of ['jü', 'qü', 'bü', 'fi', 'giao', 'zhia', 'xa', 'v']) expect(isValidSyllable(bad), bad).toBe(false);
    expect(SYLLABLES.size).toBeGreaterThan(400);
  });
});

describe('markSyllable', () => {
  it('follows the a / e / ou / last-vowel rule', () => {
    const cases: [string, number, string][] = [
      ['hao', 3, 'hǎo'], ['xie', 4, 'xiè'], ['gou', 3, 'gǒu'], ['guo', 2, 'guó'], ['liu', 2, 'liú'],
      ['gui', 4, 'guì'], ['lü', 4, 'lǜ'], ['nüe', 4, 'nüè'], ['zhi', 1, 'zhī'], ['ma', 0, 'ma'],
    ];
    for (const [base, tone, out] of cases) expect(markSyllable(base, tone)).toBe(out);
  });
});

describe('parsePinyin', () => {
  it('reads numbered, marked, joined and spaced forms identically', () => {
    for (const form of ['ni3 hao3', 'ni3hao3', 'nǐ hǎo', 'nǐhǎo', 'Nǐ Hǎo!', 'NI3HAO3']) expect(p(form), form).toBe('ni3 hao3');
  });

  it('accepts v, u: and ü', () => {
    expect(p('lv4')).toBe('lü4');
    expect(p('lu:4')).toBe('lü4');
    expect(p('nǚ rén')).toBe('nü3 ren2');
  });

  it('treats 5 as neutral and missing tones as null', () => {
    expect(p('xie4xie5')).toBe('xie4 xie0');
    expect(p('nihao')).toBe('ni hao');
    expect(p('nihao3')).toBe('ni hao3');
  });

  it('splits ambiguous strings by orthography and honours apostrophes', () => {
    expect(p('xian1')).toBe('xian1');
    expect(p("xi1'an1")).toBe('xi1 an1');
    expect(p('fangan4')).toBe('fan gan4'); // no apostrophe → fan-gan
    expect(p("fang'an4")).toBe('fang an4');
    expect(p('tian1an1men2')).toBe('tian1 an1 men2');
  });

  it('handles erhua', () => {
    expect(p('nǎr')).toBe('na3 r0');
    expect(p('nar3')).toBe('na3 r0');
  });

  it('rejects garbage', () => {
    for (const bad of ['hello', 'ni9', '3ni', '你好', 'ni33']) expect(parsePinyin(bad), bad).toBeNull();
    expect(parsePinyin('')).toEqual([]);
  });

  it('strict curated parser throws on malformed data', () => {
    expect(() => parseNumbered('ni hao3')).toThrow();
    expect(() => parseNumbered('jü3')).toThrow();
  });
});

describe('formatWord', () => {
  it('joins with apostrophes and attaches erhua', () => {
    expect(formatWord(syl('ni3 hao3'))).toBe('nǐhǎo');
    expect(formatWord(syl('xi1 an1'))).toBe("xī'ān");
    expect(formatWord(syl('na3 r0'))).toBe('nǎr');
    expect(formatWord(syl('xie4 xie0'))).toBe('xièxie');
  });
});

describe('surfaceTones (sandhi)', () => {
  it('3-3 → 2-3, and runs → 2-2-3, not across a neutral tone', () => {
    expect(sandhi('你好', 'ni3 hao3')).toEqual([2, 3]);
    expect(sandhi('我很好', 'wo3 hen3 hao3')).toEqual([2, 2, 3]);
    expect(sandhi('好吃', 'hao3 chi1')).toEqual([3, 1]);
    expect(sandhi('姐姐', 'jie3 jie0')).toEqual([3, 0]);
  });

  it('不 before 4th tone, and neutral in A-不-A', () => {
    expect(sandhi('不是', 'bu4 shi4')).toEqual([2, 4]);
    expect(sandhi('不好', 'bu4 hao3')).toEqual([4, 3]);
    expect(sandhi('是不是', 'shi4 bu4 shi4')).toEqual([4, 0, 4]);
    expect(sandhi('不客气', 'bu4 ke4 qi0')).toEqual([2, 4, 0]);
  });

  it('一 by context, unchanged when counting', () => {
    expect(sandhi('一个', 'yi1 ge4')).toEqual([2, 4]);
    expect(sandhi('一天', 'yi1 tian1')).toEqual([4, 1]);
    expect(sandhi('一起', 'yi1 qi3')).toEqual([4, 3]);
    expect(sandhi('第一', 'di4 yi1')).toEqual([4, 1]);
    expect(sandhi('十一', 'shi2 yi1')).toEqual([2, 1]);
    expect(sandhi('一二三', 'yi1 er4 san1')).toEqual([1, 4, 1]);
    expect(sandhi('一', 'yi1')).toEqual([1]);
  });
});

describe('comparePinyin', () => {
  const cmp = (expected: string, given: string, surface?: number[]) => comparePinyin(syl(expected), parsePinyin(given)!, surface);

  it('accepts exact answers in any format', () => {
    expect(cmp('ni3 hao3', 'nǐhǎo').correct).toBe(true);
  });

  it('reports the exact tone error', () => {
    const r = cmp('ni3 hao3', 'ni3 hao4');
    expect([r.correct, r.segmentsMatch]).toEqual([false, true]);
    expect(r.toneErrors).toEqual([{ index: 1, expected: 3, given: 4 }]);
    expect(r.notes[0]).toBe('Syllable 2 (hao) is 3rd tone, not 4th tone.');
  });

  it('separates missing tones from wrong sounds', () => {
    const r = cmp('ni3 hao3', 'nihao');
    expect([r.correct, r.missingTones, r.segmentsMatch]).toEqual([false, true, true]);
  });

  it('says whether the initial or the final was wrong', () => {
    const r = cmp('zhi1 dao4', 'ji1 dao4');
    expect(r.segmentErrors).toEqual([{ index: 0, expected: 'zhi', given: 'ji' }]);
    expect(r.notes[0]).toBe('Syllable 1: the initial is "zh", you wrote "ji".');
    expect(cmp('xue2', 'xie2').notes[0]).toMatch(/final is "ue"/);
  });

  it('is lenient on neutral tones', () => {
    expect(cmp('xie4 xie0', 'xie4xie').correct).toBe(true);
    const r = cmp('xie4 xie0', 'xie4 xie4');
    expect(r.correct).toBe(true);
    expect(r.notes[0]).toMatch(/neutral/);
  });

  it('accepts sandhi spellings only when told the surface tones', () => {
    const r = cmp('ni3 hao3', 'ni2 hao3', [2, 3]);
    expect(r.correct).toBe(true);
    expect(r.notes[0]).toMatch(/pronounced tone.*nǐhǎo/);
    expect(cmp('ni3 hao3', 'ni2 hao3').correct).toBe(false);
  });

  it('detects missing syllables', () => {
    const r = cmp('ni3 hao3', 'ni3');
    expect([r.lengthMismatch, r.correct]).toEqual([true, false]);
  });
});
