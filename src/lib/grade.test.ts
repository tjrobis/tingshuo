import { describe, expect, it } from 'vitest';
import { classifyError, errorPatterns, gradeChinese, gradeEnglish, patternKey, type ChineseTarget } from './grade';
import { parseNumbered } from './pinyin';
import type { ErrorRecord } from './types';

describe('gradeEnglish', () => {
  const accepted = ['to eat', 'have a meal (informal)'];
  it('accepts normalised answers', () => {
    for (const g of ['eat', 'To eat!', ' EAT ', 'have a meal']) expect(gradeEnglish(g, accepted).verdict, g).toBe('correct');
  });
  it('treats typos as close, but not different words', () => {
    expect(gradeEnglish('thnk you', ['thank you']).verdict).toBe('close');
    expect(gradeEnglish('east', ['west']).verdict).toBe('wrong');
    expect(gradeEnglish('he', ['she']).verdict).toBe('wrong');
  });
  it("is honest that it can't judge free sentence translations", () => {
    expect(gradeEnglish("I don't like coffee", ['I like coffee very much']).verdict).toBe('unsure');
    expect(gradeEnglish('I like coffee very much', ['I like coffee very much']).verdict).toBe('correct');
  });
  it('blank is wrong', () => {
    expect(gradeEnglish('  ', ['hello'])).toMatchObject({ verdict: 'wrong', category: 'vocab_forgotten' });
  });
});

describe('gradeChinese', () => {
  const target = (hanzi: string, tokens: string[], pinyin: string, surface?: number[]): ChineseTarget => ({
    hanzi, tokens, pinyin: parseNumbered(pinyin), surface,
  });
  const nihao = [target('你好', ['你好'], 'ni3 hao3', [2, 3])];
  const seg = (s: string) => [...s];

  it('accepts characters or pinyin in any format', () => {
    for (const g of ['你好', '你好！', 'ni3 hao3', 'nǐhǎo', 'ni2 hao3']) expect(gradeChinese(g, nihao, seg).verdict, g).toBe('correct');
  });

  it('calls a wrong tone a tone error, recording the swap', () => {
    expect(gradeChinese('ni3 hao4', nihao, seg)).toMatchObject({ verdict: 'wrong', category: 'tone', toneSwaps: ['3>4'] });
  });

  it('calls missing tones close, not wrong', () => {
    expect(gradeChinese('nihao', nihao, seg).verdict).toBe('close');
  });

  it('detects word order in pinyin and in characters', () => {
    const t = [target('我是学生', ['我', '是', '学生'], 'wo3 shi4 xue2 sheng1')];
    expect(gradeChinese('shi4 wo3 xue2 sheng1', t, seg).category).toBe('word_order');
    expect(gradeChinese('学生是我', t, () => ['学生', '是', '我']).category).toBe('word_order');
  });

  it('rejects unreadable input', () => {
    expect(gradeChinese('hello', nihao, seg)).toMatchObject({ verdict: 'wrong', category: 'other' });
  });
});

describe('classifyError', () => {
  it('names the kind of mistake', () => {
    expect(classifyError(['我', '昨天', '去', '了', '商店'], ['我', '去', '了', '商店', '昨天']).category).toBe('word_order');
    expect(classifyError(['你', '好', '吗'], ['你', '好'])).toMatchObject({ category: 'particle' });
    expect(classifyError(['一', '杯', '咖啡'], ['一', '个', '咖啡'])).toMatchObject({ category: 'classifier', expected: '杯', given: '个' });
    expect(classifyError(['我', '是', '学生'], ['我', '有', '学生'])).toMatchObject({ category: 'similar_word', expected: '是', given: '有' });
    expect(classifyError(['谢谢'], [])).toMatchObject({ category: 'vocab_forgotten' });
    expect(classifyError(['我', '想', '去', '中国'], ['我', '要', '中国', '走'])).toMatchObject({ category: 'grammar' });
  });
});

describe('error patterns', () => {
  const DAY = 86_400_000;
  const now = new Date('2026-10-04T12:00:00').getTime();
  const err = (e: Partial<ErrorRecord>, daysAgo: number): ErrorRecord => {
    const base = { category: 'other', expected: '', given: '', source: 'exercise', at: now - daysAgo * DAY, ...e } as ErrorRecord;
    return { ...base, patternKey: patternKey(base) };
  };

  it('treats 2→3 and 3→2 as one tone weakness, and 是/有 either way as one confusion', () => {
    expect(patternKey({ category: 'tone', toneSwaps: ['3>2'] })).toBe(patternKey({ category: 'tone', toneSwaps: ['2>3'] }));
    expect(patternKey({ category: 'similar_word', itemId: 'w:是', confusedWith: 'w:有' })).toBe(
      patternKey({ category: 'similar_word', itemId: 'w:有', confusedWith: 'w:是' }),
    );
  });

  it('flags recurrence within 14 days, labels it readably, and resolves after spaced drill wins', () => {
    const errors = [
      err({ category: 'similar_word', itemId: 'w:是', confusedWith: 'w:有' }, 3),
      err({ category: 'similar_word', itemId: 'w:有', confusedWith: 'w:是' }, 1),
      err({ category: 'tone', toneSwaps: ['3>2'] }, 30),
    ];
    const [confusion, tone] = errorPatterns(errors, [], now);
    expect(confusion).toMatchObject({ status: 'recurring', count: 2, label: 'Mixing up 是 and 有' });
    expect(confusion.itemIds.sort()).toEqual(['w:是', 'w:有']);
    expect(tone).toMatchObject({ status: 'open', label: 'Confusing tones 2 and 3' });

    const key = confusion.key;
    const sameDay = [1, 2, 3].map((h) => ({ key, at: now - DAY + h * 60_000 }));
    expect(errorPatterns(errors, sameDay, now)[0].status).toBe('recurring'); // all on one day
    const spaced = [{ key, at: now - DAY + 60_000 }, { key, at: now - 1000 }, { key, at: now }];
    expect(errorPatterns(errors, spaced, now)[0].status).toBe('resolved');
  });
});
