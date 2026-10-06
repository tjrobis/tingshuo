import { describe, expect, it } from 'vitest';
import { db, loadState, persist } from './db';
import { gradeExercise, makeExercise, type Exercise, type Response } from './exercise';
import { formatNumbered } from './pinyin';
import { planSession } from './planner';
import {
  applyAnswer, buildQueue, commit, emptyState, introduce, ITEMS, newCandidates, newProfile, planInput, PRONUNCIATION_ORDER, seedKnown,
  type LearnerState, type Slot,
} from './session';
import { State } from './srs';

const DAY = 86_400_000;
const start = new Date('2026-10-05T09:00:00');
const fresh = () =>
  emptyState(newProfile({ name: 'Test', goals: ['conversation'], interests: ['gaming', 'food'], sessionMinutes: 20, pinyinMode: 'new' }, start));

const right = (ex: Exercise): Response =>
  ex.choices ? { choice: ex.answer! }
  : ex.order ? { order: ex.order }
  : ex.accepted ? { text: ex.accepted[0] }
  : ex.pinyinOnly ? { text: formatNumbered(ex.targets![0].pinyin) }
  : { text: ex.targets![0].hanzi };
const wrong = (ex: Exercise): Response =>
  ex.choices ? { choice: (ex.answer! + 1) % ex.choices.length } : ex.order ? { order: [...ex.order].reverse() } : { text: 'qqq' };

/** Run one whole session like the UI does, answering with `answer`. Returns what happened. */
async function runSession(s: LearnerState, now: Date, answer: (ex: Exercise) => Response = right, save = false) {
  const plan = planSession(planInput(s, 20, now));
  const queue = buildQueue(s, plan, now, { audio: true });
  const shown: Exercise[] = [];
  let t = +now;
  for (const slot of queue) {
    const at = new Date((t += 15_000));
    const ex = makeExercise(s, slot, { now: at, audio: true, scaffold: 0, rng: seeded(t) });
    if (!ex) continue;
    shown.push(ex);
    const w = slot.intro
      ? introduce(s, slot.itemId, at, { modality: ex.intro?.audioFirst ? 'audio' : 'text' })
      : applyAnswer(s, { slot, facet: ex.facet!, format: ex.format, result: gradeExercise(ex, answer(ex)), rtMs: 4000, given: '', expected: ex.reveal.zh }, at).writes;
    commit(s, w);
    if (save) await persist(w);
  }
  return { plan, queue, shown };
}

/** Deterministic rng so failures reproduce. */
function seeded(seed: number) {
  let x = seed % 2147483647 || 1;
  const next = () => (x = (x * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 5; i++) next(); // small seeds give tiny first draws
  return next;
}

describe('item registry', () => {
  it('covers every curriculum item, pronunciation starting with the four tones', () => {
    expect(PRONUNCIATION_ORDER.slice(0, 4)).toEqual(['t:1', 't:2', 't:3', 't:4']);
    expect(PRONUNCIATION_ORDER).toHaveLength(4 + 20 + 13);
    expect(new Set(PRONUNCIATION_ORDER).size).toBe(PRONUNCIATION_ORDER.length);
    expect([...ITEMS.values()].filter((i) => i.kind === 'word').length).toBeGreaterThan(200);
  });
});

describe('day one', () => {
  it('starts with the tones, then teaches words in context and re-tests each after a gap', () => {
    const s = fresh();
    const plan = planSession(planInput(s, 20, start));
    const queue = buildQueue(s, plan, start, { audio: true });
    expect(queue.slice(0, 8).map((q) => `${q.itemId}${q.intro ? '+' : ''}`)).toEqual(['t:1+', 't:1', 't:2+', 't:2', 't:3+', 't:3', 't:4+', 't:4']);
    const words = queue.filter((q) => q.intro && q.itemId.startsWith('w:')).map((q) => q.itemId);
    expect(words).toHaveLength(plan.newItems);
    for (const id of words) {
      const intro = queue.findIndex((q) => q.itemId === id && q.intro);
      const test = queue.findIndex((q) => q.itemId === id && q.facet === 'meaning');
      expect(test - intro, id).toBeGreaterThan(1);
    }
    expect(queue.some((q) => q.facet === 'produce')).toBe(false);
  });

  it('without speech synthesis, skips everything that needs audio', () => {
    const s = fresh();
    const queue = buildQueue(s, planSession(planInput(s, 20, start)), start, { audio: false });
    expect(queue.some((q) => q.itemId.startsWith('t') || q.itemId.startsWith('snd:') || q.facet === 'listening')).toBe(false);
  });

  it('prefers the learner’s interests within the current unit, never skipping ahead', () => {
    const units = newCandidates(fresh()).slice(0, 10).map((id) => ITEMS.get(id)!.unit);
    expect(units.every((u) => u === 1)).toBe(true);
  });
});

describe('the full loop', () => {
  it('session → answers → schedule → next day: reviews come due and production unlocks', async () => {
    const s = fresh();
    const day1 = await runSession(s, start);
    expect(day1.shown.length).toBeGreaterThan(20);
    const taught = day1.queue.filter((q) => q.intro && q.itemId.startsWith('w:')).map((q) => q.itemId);
    for (const id of taught) {
      expect(s.srs.get(`${id}|meaning`)!.card.state, id).not.toBe(State.New);
      expect(s.srs.has(`${id}|recall`), `${id} recall unlocked`).toBe(true);
    }
    expect(s.errors).toHaveLength(0);
    expect(s.abilities.get('vocab')!.n).toBeGreaterThan(0);

    const tomorrow = new Date(+start + DAY);
    const plan2 = planSession(planInput(s, 20, tomorrow));
    expect(plan2.reviews).toBeGreaterThan(0);
    const day2 = await runSession(s, tomorrow);
    const newOnDay2 = day2.queue.filter((q) => q.intro && q.itemId.startsWith('w:')).map((q) => q.itemId);
    expect(newOnDay2.some((id) => taught.includes(id))).toBe(false);
  });

  it('wrong answers are rated Again, logged as categorised errors, and shrink tomorrow’s new words', async () => {
    const s = fresh();
    await runSession(s, start, wrong);
    expect(s.errors.length).toBeGreaterThan(5);
    expect(s.errors.every((e) => e.patternKey && e.category)).toBe(true);
    expect(s.reviews.filter((r) => r.rating === 1).length).toBeGreaterThan(5);
    const good = fresh();
    await runSession(good, start);
    const later = new Date(+start + 2 * DAY);
    await runSession(s, new Date(+start + DAY), wrong);
    await runSession(good, new Date(+start + DAY));
    expect(planSession(planInput(s, 20, later)).newItems).toBeLessThan(planSession(planInput(good, 20, later)).newItems);
  });

  it('persists every step and reloads to the same model', async () => {
    await db.delete();
    await db.open();
    const s = fresh();
    await db.profile.put(s.profile);
    await runSession(s, start, right, true);
    const loaded = (await loadState())!;
    expect(loaded.srs.size).toBe(s.srs.size);
    expect(loaded.reviews.length).toBe(s.reviews.length);
    expect(loaded.answers.length).toBe(s.answers.length);
    for (const [id, x] of s.srs) expect(+loaded.srs.get(id)!.card.due, id).toBe(+x.card.due);
  });
});

describe('exercises', () => {
  const learned = () => {
    const s = fresh();
    const w: Slot = { key: 'k', itemId: 'w:你好' };
    commit(s, seedKnown(s, ['w:你', 'w:好', 'w:我', 'w:很', 'w:是', 'w:吗', 'w:你好', 'w:谢谢', 'w:学生', 'w:老师', 'w:呢', 'w:也'], start));
    for (const id of ['w:你好', 'w:学生']) commit(s, { srs: [{ id: `${id}|reading`, itemId: id, facet: 'reading', activatedAt: 0, card: s.srs.get(`${id}|meaning`)!.card }] });
    for (const id of ['c:好', 'g:ma', 'g:shi', 't:3', 'tp:3-3', 'snd:zh-j']) commit(s, introduce(s, id, start, {}));
    return { s, w };
  };
  const formats: [string, string, string][] = [
    ['w:你好', 'meaning', 'hanzi_to_meaning_mc'], ['w:你好', 'meaning', 'hanzi_to_meaning_typed'],
    ['w:你好', 'listening', 'audio_to_meaning_mc'], ['w:你好', 'listening', 'audio_to_meaning_typed'], ['w:你好', 'listening', 'dictation'],
    ['w:学生', 'recall', 'meaning_to_chinese_bank'], ['w:学生', 'recall', 'meaning_to_chinese_typed'], ['w:你好', 'reading', 'hanzi_to_pinyin'],
    ['c:好', 'char', 'char_mc'], ['c:好', 'char', 'char_typed'],
    ['g:shi', 'grammar', 'cloze_mc'], ['g:shi', 'grammar', 'cloze_typed'], ['g:shi', 'grammarProd', 'sentence_build'], ['g:shi', 'grammarProd', 'translate_to_chinese'],
    ['t:3', 'perceive', 'minimal_pair'], ['t:3', 'perceive', 'tone_id'], ['tp:3-3', 'perceive', 'tone_id'], ['snd:zh-j', 'perceive', 'minimal_pair'],
  ];

  it.each(formats)('%s %s %s: the right answer passes, a wrong one fails', (itemId, facet, format) => {
    const { s } = learned();
    if (!s.srs.has(`${itemId}|${facet}`)) commit(s, { srs: [{ id: `${itemId}|${facet}`, itemId, facet: facet as never, activatedAt: 0, card: s.srs.get(`${itemId}|${itemId.startsWith('g:') ? 'grammar' : 'perceive'}`)?.card ?? s.srs.values().next().value!.card }] });
    for (let seed = 1; seed <= 5; seed++) {
      const ex = makeExercise(s, { key: 'x', itemId, facet: facet as never }, { now: start, audio: true, scaffold: 0, rng: seeded(seed), format })!;
      expect(ex, format).not.toBeNull();
      expect(gradeExercise(ex, right(ex)).verdict, `${format} right`).toBe('correct');
      expect(gradeExercise(ex, wrong(ex)).verdict, `${format} wrong`).not.toBe('correct');
      if (ex.choices) expect(new Set(ex.choices.map((c) => c.label)).size, `${format} distinct options`).toBe(ex.choices.length);
    }
  });

  it('after a miss, the retry uses the most supportive format, not the hardest', () => {
    const { s: st } = learned();
    const slot: Slot = { key: 'm', itemId: 'w:你好', facet: 'meaning' };
    const opts = { now: start, audio: true, scaffold: 0, rng: seeded(3) };
    const first = makeExercise(st, slot, opts)!;
    commit(st, applyAnswer(st, { slot, facet: 'meaning', format: first.format, result: gradeExercise(first, wrong(first)), rtMs: 3000, given: 'x', expected: '你好' }, start).writes);
    expect(makeExercise(st, slot, { ...opts, now: new Date(+start + 60_000) })!.format).toBe('hanzi_to_meaning_mc');
  });

  it('never offers a tone option that sounds identical after sandhi (你好 vs ní hǎo)', () => {
    const { s } = learned();
    for (let seed = 1; seed <= 20; seed++) {
      const ex = makeExercise(s, { key: 'x', itemId: 'tp:3-3', facet: 'perceive' }, { now: start, audio: true, scaffold: 0, rng: seeded(seed), format: 'tone_id' })!;
      const labels = ex.choices!.map((c) => c.tones!.join('-'));
      const correct = ex.choices![ex.answer!].tones!.join('-');
      expect(correct).toBe('3-3');
      expect(labels).not.toContain('2-3');
    }
  });

  it('introduces words inside a sentence, audio-first about half the time', () => {
    const { s } = learned();
    const intros = Array.from({ length: 40 }, (_, i) => makeExercise(s, { key: 'i', itemId: 'w:老师', intro: true }, { now: start, audio: true, scaffold: 0, rng: seeded(i + 1) })!);
    expect(intros[0].intro!.examples[0].zh).toMatch(/老师/);
    const audioFirst = intros.filter((x) => x.intro!.audioFirst).length;
    expect(audioFirst).toBeGreaterThan(8);
    expect(audioFirst).toBeLessThan(32);
  });

  it('placement seeding makes words reviewed once and unlocks production', () => {
    const { s } = learned();
    expect(s.srs.get('w:你|meaning')!.card.state).not.toBe(State.New);
    expect(s.srs.has('w:你|recall')).toBe(true);
    expect(s.mastery.get('w:你')!.introducedAt).toBe(+start);
  });
});
