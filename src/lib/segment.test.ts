import { describe, expect, it } from 'vitest';
import { computeCoverage, segment, splitTokenised } from './segment';

const lexicon = (...words: string[]) => {
  const set = new Set(words);
  return (w: string) => set.has(w);
};
const texts = (s: string, has: (w: string) => boolean) => segment(s, has).map((t) => t.text);

describe('splitTokenised', () => {
  it('splits curated text and keeps disambiguators as refs', () => {
    const t = splitTokenised('我 叫 了#le 。');
    expect(t.map((x) => x.text)).toEqual(['我', '叫', '了', '。']);
    expect(t.map((x) => x.kind)).toEqual(['han', 'han', 'han', 'punct']);
    expect(t[2].ref).toBe('了#le');
  });
});

describe('segment', () => {
  it('splits ICU words the lexicon keeps apart (去了 → 去 + 了)', () => {
    expect(texts('我昨天去了商店', lexicon('我', '昨天', '去', '了', '商店'))).toEqual(['我', '昨天', '去', '了', '商店']);
  });

  it('keeps unknown words whole instead of shattering them', () => {
    const toks = segment('我喜欢咖啡', lexicon('我', '喜欢'));
    expect(toks.map((t) => t.text)).toEqual(['我', '喜欢', '咖啡']);
    expect(toks[2].ref).toBeUndefined();
  });

  it('types Latin, numbers and punctuation', () => {
    const toks = segment('我叫Todd，我25岁。', lexicon('我', '叫', '岁'));
    expect(toks.map((t) => `${t.kind}:${t.text}`)).toEqual([
      'han:我', 'han:叫', 'latin:Todd', 'punct:，', 'han:我', 'number:25', 'han:岁', 'punct:。',
    ]);
  });
});

describe('computeCoverage', () => {
  it('counts Chinese word tokens only and lists unknown words once', () => {
    const toks = segment('我喜欢咖啡，我也喜欢茶和咖啡。', lexicon('我', '喜欢', '也', '茶', '和'));
    const known = new Set(['我', '喜欢', '也', '茶']);
    const r = computeCoverage(toks, (t) => known.has(t.text));
    // 我 喜欢 咖啡 / 我 也 喜欢 茶 和 咖啡 → 9 words, 6 known
    expect([r.contentTokens, r.knownTokens]).toEqual([9, 6]);
    expect(r.unknown).toEqual(['咖啡', '和']);
  });

  it('treats text with no Chinese as fully covered', () => {
    expect(computeCoverage([], () => false).coverage).toBe(1);
  });
});
