import { describe, expect, it } from 'vitest';
import {
  abilityBand,
  expectedKnown,
  facetsToActivate,
  masteryStatus,
  median,
  recordAnswer,
  streak,
  trueRetention,
  updateAbility,
  weeklyVelocity,
} from './learner';
import { createEmptyCard as newCard, State } from './srs';
import type { Facet, ReviewRecord, SkillAbility, SRSState } from './types';

const DAY = 86_400_000;
const now = new Date('2026-10-04T12:00:00');

/** A facet reviewed `daysAgo` with the given stability (days). stability 0 = never reviewed. */
const facet = (f: Facet, stability: number, daysAgo = 0): SRSState => ({
  id: `w:好|${f}`,
  itemId: 'w:好',
  facet: f,
  activatedAt: 0,
  card: stability
    ? { ...newCard(now), state: State.Review, stability, difficulty: 5, reps: 3, last_review: new Date(+now - daysAgo * DAY) }
    : newCard(now),
});

describe('masteryStatus', () => {
  it('walks new → learning → developing → strong → mastered', () => {
    expect(masteryStatus('word', [facet('meaning', 0), facet('listening', 0)], now)).toBe('new');
    expect(masteryStatus('word', [facet('meaning', 0.2), facet('listening', 0)], now)).toBe('learning');
    expect(masteryStatus('word', [facet('meaning', 2.3), facet('listening', 2.3), facet('recall', 0.5)], now)).toBe('developing');
    expect(masteryStatus('word', [facet('meaning', 8), facet('listening', 8), facet('recall', 4)], now)).toBe('strong');
    expect(masteryStatus('word', [facet('meaning', 40), facet('listening', 25), facet('recall', 25)], now)).toBe('mastered');
  });

  it('caps recognition-only knowledge at developing', () => {
    expect(masteryStatus('word', [facet('meaning', 60), facet('listening', 60)], now)).toBe('developing');
    expect(masteryStatus('word', [facet('meaning', 60), facet('listening', 60), facet('recall', 0)], now)).toBe('developing');
  });

  it('needs listening too before calling a word mastered', () => {
    expect(masteryStatus('word', [facet('meaning', 40), facet('listening', 5), facet('recall', 25)], now)).toBe('strong');
  });

  it('demotes anything slipping below 70% recall to at risk, whatever it reached', () => {
    expect(masteryStatus('word', [facet('meaning', 8, 60), facet('listening', 8, 60), facet('recall', 4, 60)], now)).toBe('at_risk');
    expect(masteryStatus('word', [facet('meaning', 0.2, 30)], now)).toBe('learning'); // never "at risk" before it was learned
  });

  it('works for kinds without a production facet', () => {
    expect(masteryStatus('char', [{ ...facet('char', 40), itemId: 'c:好' }], now)).toBe('mastered');
  });
});

describe('facetsToActivate', () => {
  it('introduces words for recognition, unlocks production after a success, tones after that', () => {
    expect(facetsToActivate('word', [])).toEqual(['meaning', 'listening']);
    expect(facetsToActivate('word', [facet('meaning', 0.2), facet('listening', 0)])).toEqual([]);
    expect(facetsToActivate('word', [facet('meaning', 2.3), facet('listening', 0)])).toEqual(['recall']);
    expect(facetsToActivate('word', [facet('meaning', 5), facet('listening', 5), facet('recall', 2.5)])).toEqual(['reading']);
  });

  it('handles grammar and tones', () => {
    expect(facetsToActivate('grammar', [])).toEqual(['grammar']);
    expect(facetsToActivate('grammar', [facet('grammar', 1.5)])).toEqual(['grammarProd']);
    expect(facetsToActivate('tonepair', [])).toEqual(['perceive', 'produce']);
  });
});

describe('recordAnswer', () => {
  it('accumulates per-facet counts, mistakes, confusions, contexts and response times', () => {
    let m = recordAnswer(undefined, { itemId: 'w:是', kind: 'word', facet: 'recall', correct: false, at: 1, given: '有', confusedWith: 'w:有', context: 's1', rtMs: 4000 });
    m = recordAnswer(m, { itemId: 'w:是', kind: 'word', facet: 'recall', correct: false, at: 2, given: '有', confusedWith: 'w:有', context: 's1' });
    m = recordAnswer(m, { itemId: 'w:是', kind: 'word', facet: 'recall', correct: true, at: 3, context: 's2', rtMs: 2000 });
    expect(m.byFacet.recall).toEqual({ correct: 1, incorrect: 2, lastResult: true });
    expect(m.mistakes).toEqual([{ given: '有', count: 2, last: 2 }]);
    expect(m.confusions).toEqual([{ itemId: 'w:有', count: 2 }]);
    expect(m.contexts).toEqual(['s1', 's2']);
    expect([m.encounters, m.firstSeen, m.lastSeen]).toEqual([3, 1, 3]);
    expect(median(m.rtSamples)).toBe(3000);
  });

  it('keeps only the last 10 response times', () => {
    let m = recordAnswer(undefined, { itemId: 'x', kind: 'word', facet: 'meaning', correct: true, at: 0, rtMs: 1 });
    for (let i = 2; i <= 15; i++) m = recordAnswer(m, { itemId: 'x', kind: 'word', facet: 'meaning', correct: true, at: i, rtMs: i });
    expect(m.rtSamples).toEqual([6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  });
});

describe('skill abilities (Elo)', () => {
  it('rises on success, falls on failure, and settles near the level where ~half are right', () => {
    let a: SkillAbility = { skill: 'listening', theta: 0, n: 0, updatedAt: 0 };
    expect(updateAbility(a, 0, true, 1).theta).toBeGreaterThan(0);
    expect(updateAbility(a, 0, false, 1).theta).toBeLessThan(0);
    // Learner who always gets level-3 content right and level-4 content wrong.
    for (let i = 0; i < 200; i++) a = updateAbility(a, i % 2 ? 3 : 4, i % 2 === 1, i);
    expect(a.theta).toBeGreaterThan(3);
    expect(a.theta).toBeLessThan(4);
  });

  it('labels bands coarsely and flags thin evidence', () => {
    expect(abilityBand({ theta: 0.2, n: 5 })).toEqual({ label: 'Starting', tentative: true });
    expect(abilityBand({ theta: 3, n: 50 })).toEqual({ label: 'Elementary', tentative: false });
  });
});

describe('progress metrics', () => {
  it('estimates words known as the sum of recall probabilities', () => {
    const states = [facet('meaning', 30, 0), facet('meaning', 30, 0), facet('meaning', 0), facet('recall', 30, 0)];
    expect(expectedKnown(states, 'meaning', now)).toBeCloseTo(2, 1);
    expect(expectedKnown(states, 'recall', now)).toBeCloseTo(1, 1);
  });

  it('true retention ignores same-day steps and refuses to guess on thin data', () => {
    const r = (rating: number, elapsed: number, daysAgo = 1) => ({ rating, elapsed_days: elapsed, at: +now - daysAgo * DAY }) as ReviewRecord;
    expect(trueRetention([r(3, 2), r(1, 2)], +now)).toEqual({ rate: null, n: 2 });
    const many = [...Array(9).fill(r(3, 2)), r(1, 3), r(1, 0), r(3, 5, 60)];
    expect(trueRetention(many, +now)).toEqual({ rate: 0.9, n: 10 });
  });

  it('velocity counts recent items that are still holding', () => {
    const items = [
      { introducedAt: +now - DAY, status: 'developing' as const },
      { introducedAt: +now - DAY, status: 'learning' as const },
      { introducedAt: +now - 10 * DAY, status: 'strong' as const },
    ];
    expect(weeklyVelocity(items, +now)).toBe(1);
  });

  it('streak counts consecutive days and survives an unfinished today', () => {
    const day = (n: number) => +now - n * DAY;
    expect(streak([day(0), day(1), day(2)], +now)).toBe(3);
    expect(streak([day(1), day(2)], +now)).toBe(2);
    expect(streak([day(0), day(2)], +now)).toBe(1);
    expect(streak([day(3)], +now)).toBe(0);
  });
});
