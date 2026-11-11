import { describe, expect, it } from 'vitest';
import { grammar, words } from './curriculum';
import { makeExercise } from './exercise';
import { newMastery } from './learner';
import { db } from './db';
import { achievements, benchmarkForm, currentForm, hash, metaLearning, pBetter, scoreBenchmark, seeded, syncAchievements } from './progress';
import { applyPractice, commit, emptyState, newProfile, seedKnown, type LearnerState } from './session';
import type { ConversationRecord, ReviewRecord } from './types';

const DAY = 86_400_000;
const start = new Date('2026-10-01T09:00:00');
const fresh = () => emptyState(newProfile({ name: 'T', goals: [], interests: [], sessionMinutes: 20, pinyinMode: 'new' }, start));
const teachable = words.filter((w) => !w.incidental);
const review = (r: Partial<ReviewRecord>): ReviewRecord => ({
  srsId: `${r.itemId}|meaning`, itemId: 'w:你', facet: 'meaning', at: +start + DAY, rating: 3, state: 2, due: start, stability: 3, difficulty: 5,
  elapsed_days: 1, last_elapsed_days: 0, scheduled_days: 2, learning_steps: 0, exercise: 'hanzi_to_meaning_mc', retrievability: 0.9, ...r,
});

/** Words introduced in two arms, each with a first next-day review that was remembered or not. */
function experiment(arms: { modality: 'audio' | 'text'; ok: number; n: number }[]): LearnerState {
  const s = fresh();
  let i = 0;
  for (const { modality, ok, n } of arms) {
    for (let k = 0; k < n; k++) {
      const id = teachable[i++].id;
      s.mastery.set(id, { ...newMastery(id, 'word', +start), introducedAt: +start, introModality: modality, introBatchSize: 5 });
      s.reviews.push(review({ itemId: id, rating: k < ok ? 3 : 1 }));
    }
  }
  return s;
}

describe('statistics', () => {
  it('P(A is better than B) follows both the gap and the amount of evidence', () => {
    expect(pBetter({ k: 50, n: 100 }, { k: 50, n: 100 })).toBeCloseTo(0.5);
    expect(pBetter({ k: 18, n: 20 }, { k: 10, n: 20 })).toBeGreaterThan(0.99);
    expect(pBetter({ k: 2, n: 2 }, { k: 1, n: 2 })).toBeLessThan(0.9); // too little data to be sure
    expect(pBetter({ k: 95, n: 100 }, 0.9)).toBeGreaterThan(0.9);
  });
});

describe('meta-learning', () => {
  it('reports a clear difference and applies it, keeping some exploration', () => {
    const { insights, policy } = metaLearning(experiment([{ modality: 'audio', ok: 18, n: 20 }, { modality: 'text', ok: 9, n: 20 }]), +start + 2 * DAY);
    expect(insights.find((x) => x.id === 'modality')).toMatchObject({ title: expect.stringMatching(/hear them first/), n: 40 });
    expect(policy.audioFirst).toBe(0.9);
  });

  it('says nothing until there is enough data, and keeps the defaults', () => {
    const { insights, running, policy } = metaLearning(experiment([{ modality: 'audio', ok: 5, n: 5 }, { modality: 'text', ok: 1, n: 5 }]), +start + 2 * DAY);
    expect(insights).toEqual([]);
    expect(running.find((x) => x.id === 'modality')).toMatchObject({ n: 5, needed: 15 });
    expect(policy).toEqual({ audioFirst: 0.5, newItemCap: 8, formatK: {} });
  });

  it('recalibrates an exercise type that is harder than the model predicts', () => {
    const s = fresh();
    for (let k = 0; k < 40; k++) s.reviews.push(review({ itemId: `w:x${k}`, exercise: 'hanzi_to_meaning_typed', rating: k % 2 ? 3 : 1 }));
    const { insights, policy } = metaLearning(s, +start + 2 * DAY);
    expect(insights.find((x) => x.id === 'format:hanzi_to_meaning_typed')?.title).toMatch(/harder for you/);
    // 0.9^(0.9 × scale) should now predict the 50 % that happened.
    expect(0.9 ** (0.9 * policy.formatK.hanzi_to_meaning_typed)).toBeCloseTo(0.5, 1);
  });

  it('flags remembering well below the target', () => {
    const s = fresh();
    for (let k = 0; k < 60; k++) s.reviews.push(review({ itemId: `w:y${k}`, rating: k < 40 ? 3 : 1, exercise: 'cloze_mc' }));
    expect(metaLearning(s, +start + 2 * DAY).insights.find((x) => x.id === 'retention')?.title).toMatch(/arriving a little late/);
  });
});

describe('achievements', () => {
  it('are capabilities earned from the learner model, conversations and practice', () => {
    const s = fresh();
    const none = achievements(s, start, []);
    expect(none.every((a) => a.progress === 0)).toBe(true);
    const upTo2 = [...teachable.filter((w) => w.unit <= 2).map((w) => w.id), ...grammar.filter((g) => g.unit <= 2).map((g) => g.id)];
    commit(s, seedKnown(s, upTo2, start));
    for (const correct of [true, true]) commit(s, applyPractice(s, { slot: { key: 'k', itemId: 'st:meet', practice: 'story', ref: 'st:meet' }, correct, level: 0.8, rtMs: 0, given: '', expected: '' }, start));
    const talk: ConversationRecord = { startedAt: +start, mode: 'conversation', scenario: 'meet', provider: 'x', minutes: 6, chineseOnly: false, turns: 5 };
    const got = new Map(achievements(s, start, [talk]).map((a) => [a.id, a.progress]));
    expect([got.get('unit-1'), got.get('unit-2'), got.get('unit-3')]).toEqual([1, 1, 0]);
    expect([got.get('story-1'), got.get('talk-1')]).toEqual([1, 1]);
    expect(got.get('m1')).toBeGreaterThan(0);
    expect(got.get('m1')).toBeLessThan(1); // units 3–11 still to go
  });
});

it('records each achievement once, with the date it was first met, even when syncs overlap', async () => {
  const s = fresh();
  commit(s, seedKnown(s, teachable.filter((w) => w.unit <= 7).map((w) => w.id), start));
  await Promise.all([syncAchievements(s, start), syncAchievements(s, start)]);
  await syncAchievements(s, new Date(+start + DAY));
  expect(await db.achievements.get('recognise-100')).toEqual({ id: 'recognise-100', unlockedAt: +start });
});

describe('benchmarks', () => {
  it('are fixed forms: the same items and the same exercises every time', () => {
    const form = benchmarkForm('A', true);
    expect(form).toEqual(benchmarkForm('A', true));
    expect(form.length).toBe(30);
    expect(benchmarkForm('A', false).length).toBe(18); // no listening or tone parts without a voice
    expect(form.every((x) => !x.itemId.startsWith('w:') || words.find((w) => w.id === x.itemId)!.unit <= 4)).toBe(true);
    const build = (blank: LearnerState) => form.map((it, i) =>
      makeExercise(blank, { key: `b${i}`, itemId: it.itemId, facet: it.facet }, { now: start, audio: true, mic: false, scaffold: 0, rng: seeded(hash(`A|${i}`)), format: it.format }));
    const first = build(fresh());
    expect(first.every((ex, i) => ex?.format === form[i].format)).toBe(true);
    expect(JSON.stringify(build(fresh()))).toBe(JSON.stringify(first));
  });

  it('scores by skill, and the form follows the learner up the units', () => {
    const items = benchmarkForm('A', false);
    const r = scoreBenchmark('A', items, items.map((_, i) => i % 2 === 0), 1);
    expect(r.results.map((x) => x.skill)).toEqual(['recall', 'reading', 'grammar']);
    expect(r.results[0]).toEqual({ skill: 'recall', correct: 4, total: 8 });
    const s = fresh();
    expect(currentForm(s).id).toBe('A');
    commit(s, seedKnown(s, teachable.filter((w) => w.unit <= 5).map((w) => w.id), start));
    expect(currentForm(s).id).toBe('B');
  });
});
