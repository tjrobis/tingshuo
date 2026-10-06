// The learning loop: item registry, learner state, building a session queue, and applying answers.
// Pure functions over an in-memory LearnerState; db.ts persists the Writes they return.

import { characters, grammar, sentences, sentenceWords, soundPairs, words } from './curriculum';
import type { Writes } from './db';
import { errorPatterns, patternKey, type GradeResult } from './grade';
import { expectedKnown, facetsToActivate, median, newMastery, recordAnswer, updateAbility } from './learner';
import { FORMATS, type PlanInput, type SessionPlan } from './planner';
import { createEmptyCard, rate, Rating, retrievability, review, State } from './srs';
import type {
  ErrorRecord, Facet, ItemKind, LearningEvent, LessonRecord, MasteryState, ReviewRecord, Skill, SkillAbility, SRSState, UserProfile,
} from './types';

const DAY = 86_400_000;

// ───────────── Items ─────────────
export interface Item {
  id: string;
  kind: ItemKind;
  unit: number;
}

const TONE_PAIRS = [...[1, 2, 3, 4].flatMap((a) => [1, 2, 3, 4].map((b) => `${a}-${b}`)), '1-0', '2-0', '3-0', '4-0'];
/** Pronunciation curriculum: the four tones, then tone pairs with a sound contrast after every second pair. */
export const PRONUNCIATION_ORDER = [
  't:1', 't:2', 't:3', 't:4',
  ...TONE_PAIRS.flatMap((p, i) => [`tp:${p}`, ...(i % 2 && soundPairs[i >> 1] ? [soundPairs[i >> 1].id] : [])]),
  ...soundPairs.slice(TONE_PAIRS.length >> 1).map((p) => p.id),
];

const charUnit = (ch: string) => Math.min(...words.filter((w) => w.hanzi.includes(ch)).map((w) => w.unit));
export const ITEMS = new Map<string, Item>([
  ...words.filter((w) => !w.incidental).map((w): [string, Item] => [w.id, { id: w.id, kind: 'word', unit: w.unit }]),
  ...grammar.map((g): [string, Item] => [g.id, { id: g.id, kind: 'grammar', unit: g.unit }]),
  ...characters.map((c): [string, Item] => [c.id, { id: c.id, kind: 'char', unit: charUnit(c.char) }]),
  ...PRONUNCIATION_ORDER.map((id): [string, Item] => [
    id, { id, kind: id.startsWith('t:') ? 'tone' : id.startsWith('tp:') ? 'tonepair' : 'sound', unit: 0 },
  ]),
]);

const isPronunciation = (id: string) => ITEMS.get(id)!.unit === 0;
export const PRIMARY: Record<ItemKind, Facet> = { word: 'meaning', grammar: 'grammar', char: 'char', tone: 'perceive', tonepair: 'perceive', sound: 'perceive' };
export const SKILL_OF: Record<Facet, Skill> = {
  meaning: 'vocab', recall: 'vocab', listening: 'listening', reading: 'reading', char: 'characters',
  grammar: 'grammar', grammarProd: 'grammar', perceive: 'tones', produce: 'pronunciation',
};

// ───────────── Learner state ─────────────
export interface Onboarding {
  name: string;
  goals: string[];
  interests: string[];
  sessionMinutes: number;
  pinyinMode: UserProfile['pinyinMode'];
}

export const newProfile = (o: Onboarding, now: Date): UserProfile => ({
  id: 'me', name: o.name.trim(), createdAt: +now, onboardedAt: +now,
  goals: o.goals.map((label, i) => ({ id: `goal${i}`, label, createdAt: +now })),
  interests: o.interests.map((id) => ({ id, weight: 1 })),
  dailyMinutes: o.sessionMinutes, weeklyMinutes: o.sessionMinutes * 5, sessionMinutes: o.sessionMinutes,
  travelPlans: '', motivation: '', pinyinMode: o.pinyinMode, immersion: 1, theme: 'system', ttsRate: 1,
  desiredRetention: 0.9, privacy: { stt: false, keepRecordings: 50 }, ai: { provider: 'none', model: '', consent: false },
  focus: [], scaffoldOffset: 0, showEnglish: true,
});

export const emptyState = (profile: UserProfile): LearnerState => ({
  profile, srs: new Map(), mastery: new Map(), abilities: new Map(), reviews: [], errors: [], sessions: [], answers: [],
});

export interface LearnerState {
  profile: UserProfile;
  srs: Map<string, SRSState>;
  mastery: Map<string, MasteryState>;
  abilities: Map<Skill, SkillAbility>;
  reviews: ReviewRecord[];
  errors: ErrorRecord[];
  sessions: LessonRecord[];
  /** Answer events, oldest first (response-time medians, tone accuracy, drill wins). */
  answers: LearningEvent[];
}

// ponytail: whole learner state lives in memory and facet lookups scan it; fine to ~100k reviews,
// index by item if a profiler ever complains.
export const facetsOf = (s: LearnerState, itemId: string) => [...s.srs.values()].filter((x) => x.itemId === itemId);
export const isIntroduced = (s: LearnerState, id: string) => s.mastery.get(id)?.introducedAt !== undefined;
const newFacet = (itemId: string, facet: Facet, now: Date): SRSState => ({
  id: `${itemId}|${facet}`, itemId, facet, activatedAt: +now, card: createEmptyCard(now),
});
/** No microphone analysis until slice 5, so production drills stay off. */
const usable = (f: Facet) => f !== 'produce';

/** Apply persisted writes to the in-memory state. */
export function commit(s: LearnerState, w: Writes): void {
  w.srs?.forEach((x) => s.srs.set(x.id, x));
  w.mastery?.forEach((x) => s.mastery.set(x.itemId, x));
  w.abilities?.forEach((x) => s.abilities.set(x.skill, x));
  s.reviews.push(...(w.reviews ?? []));
  s.errors.push(...(w.errors ?? []));
  s.answers.push(...(w.events ?? []).filter((e) => e.type === 'answer'));
}

// ───────────── What's new next ─────────────
/** Items ready to be introduced, in teaching order: at most one grammar point, two characters, then words. */
export function newCandidates(s: LearnerState): string[] {
  const interests = new Set([...s.profile.interests.map((i) => i.id), ...s.profile.focus.filter((f) => f.kind === 'topic').map((f) => f.key)]);
  const ready = (ids: string[]) => ids.every((id) => isIntroduced(s, id));
  const grammarReady = grammar.filter((g) => !isIntroduced(s, g.id) && sentences.some((x) => x.grammar.includes(g.id) && ready(sentenceWords(x))));
  const charsReady = characters.filter((c) =>
    !isIntroduced(s, c.id) && words.some((w) => w.hanzi.includes(c.char) && (s.srs.get(`${w.id}|meaning`)?.card.stability ?? 0) >= 3));
  const open = words.filter((w) => !w.incidental && !isIntroduced(s, w.id));
  const unit = open[0]?.unit ?? 0;
  // Interests reorder words within the current unit; they never skip ahead of the curriculum.
  const next = open.filter((w) => w.unit === unit).sort((a, b) => +b.topics.some((t) => interests.has(t)) - +a.topics.some((t) => interests.has(t)));
  return [
    ...grammarReady.slice(0, 1).map((g) => g.id),
    ...charsReady.slice(0, 2).map((c) => c.id),
    ...next.map((w) => w.id),
    ...open.filter((w) => w.unit > unit).map((w) => w.id),
  ];
}

// ───────────── Planning input ─────────────
export function planInput(s: LearnerState, minutes: number, now: Date, audio = true): PlanInput {
  const t = +now;
  const due = [...s.srs.values()].filter((x) => x.card.state !== State.New && +x.card.due <= t && !isPronunciation(x.itemId));
  const recent = s.reviews.filter((r) => r.elapsed_days >= 1 && (s.mastery.get(r.itemId)?.introducedAt ?? 0) >= t - 4 * DAY);
  const perceive = s.answers.filter((e) => e.facet === 'perceive').slice(-30);
  const wins = s.answers.filter((e) => e.correct && typeof e.meta?.drill === 'string').map((e) => ({ key: e.meta!.drill as string, at: e.at }));
  const recurring = errorPatterns(s.errors, wins, t).filter((p) => p.status === 'recurring');
  return {
    minutes,
    now: t,
    daysActive: (t - s.profile.createdAt) / DAY,
    dueCount: due.length,
    retentionHealth: recent.length >= 5 ? recent.filter((r) => r.rating > Rating.Again).length / recent.length : null,
    abilities: Object.fromEntries([...s.abilities].map(([k, a]) => [k, { theta: a.theta, n: a.n }])),
    toneAccuracy: perceive.length >= 10 ? perceive.filter((e) => e.correct).length / perceive.length : null,
    audio,
    micAvailable: false, // slice 5
    knownWords: expectedKnown([...s.srs.values()], 'meaning', now),
    inputAvailable: false, // slice 7
    recurringPatterns: recurring.length,
    toneConfusion: recurring.some((p) => p.key.startsWith('tone:')),
    focus: s.profile.focus,
    newItemCap: 8,
    newAvailable: newCandidates(s).length,
  };
}

// ───────────── Queue ─────────────
export interface Slot {
  key: string;
  itemId: string;
  /** Facet to test; absent for an introduction. */
  facet?: Facet;
  intro?: boolean;
  /** Error-pattern key when this slot is a targeted drill. */
  drill?: string;
}

/**
 * Turn a plan into an ordered queue: pronunciation warm-up → reviews interleaved with new items
 * (each new item re-tested after a gap) → listening → error drills → closing retrieval of today's items.
 * Exercise formats are chosen later, when each slot is shown, from the then-current recall probability.
 */
export function buildQueue(s: LearnerState, plan: SessionPlan, now: Date, opts: { audio: boolean }): Slot[] {
  let n = 0;
  const slot = (itemId: string, facet?: Facet, extra: Partial<Slot> = {}): Slot => ({ key: `${itemId}|${facet ?? 'intro'}|${n++}`, itemId, facet, ...extra });
  const capacity = (kind: string, secs = 12) => Math.round(((plan.blocks.find((b) => b.kind === kind)?.minutes ?? 0) * 60) / secs);
  const R = (x: SRSState) => retrievability(x.card, now);
  const all = [...s.srs.values()].filter((x) => usable(x.facet) && (opts.audio || (x.facet !== 'listening' && !isPronunciation(x.itemId))));
  const due = all.filter((x) => x.card.state !== State.New && +x.card.due <= +now).sort((a, b) => R(a) - R(b));
  const queued = new Set<string>();
  const take = (xs: SRSState[]) => xs.filter((x) => !queued.has(x.id) && queued.add(x.id)).map((x) => slot(x.itemId, x.facet));

  // Warm-up: due pronunciation items, then up to 3 new ones (all four tones on day one), then the weakest.
  const warm: Slot[] = [];
  if (opts.audio) {
    const cap = capacity('warmup');
    warm.push(...take(due.filter((x) => isPronunciation(x.itemId)).slice(0, cap)));
    const newSounds = PRONUNCIATION_ORDER.filter((id) => !isIntroduced(s, id)).slice(0, isIntroduced(s, 't:1') ? 3 : 4);
    for (const id of newSounds.slice(0, Math.max(0, Math.floor((cap - warm.length) / 2)))) warm.push(slot(id, undefined, { intro: true }), slot(id, 'perceive'));
    warm.push(...take(all.filter((x) => isPronunciation(x.itemId) && x.card.state !== State.New).sort((a, b) => R(a) - R(b)).slice(0, Math.max(0, cap - warm.length))));
  }

  // Reviews, most at-risk first, with new items woven in; each new item's first test waits ≥ 2 slots.
  const reviews = take(due.filter((x) => !isPronunciation(x.itemId)).slice(0, plan.reviews));
  const fresh = newCandidates(s).slice(0, plan.newItems);
  const main: Slot[] = [];
  let waiting: Slot[] = [];
  for (const id of fresh) {
    main.push(slot(id, undefined, { intro: true }), ...reviews.splice(0, 2), ...waiting);
    waiting = [slot(id, PRIMARY[ITEMS.get(id)!.kind])];
  }
  main.push(...reviews, ...waiting);

  // Listening: words heard least recently first (including today's new ones).
  const listening = opts.audio
    ? take(all.filter((x) => x.facet === 'listening' && (x.card.state !== State.New || fresh.includes(x.itemId))).sort((a, b) => R(a) - R(b)).slice(0, capacity('listening')))
    : [];

  // Targeted drills for mistakes that keep coming back.
  const wins = s.answers.filter((e) => e.correct && typeof e.meta?.drill === 'string').map((e) => ({ key: e.meta!.drill as string, at: e.at }));
  const drills = errorPatterns(s.errors, wins, +now)
    .filter((p) => p.status === 'recurring')
    .flatMap((p) => p.itemIds.filter((id) => ITEMS.has(id) && isIntroduced(s, id)).map((id) => slot(id, id.startsWith('w:') ? 'recall' : PRIMARY[ITEMS.get(id)!.kind], { drill: p.key })))
    .slice(0, capacity('errors', 15));

  // Close by retrieving today's new words again, from production if it has unlocked by then.
  const closing = fresh.filter((id) => id.startsWith('w:')).map((id) => slot(id, 'recall'));
  return [...warm, ...main, ...listening, ...drills, ...closing];
}

// ───────────── Learning steps ─────────────
/** Activate an item's first facets. `modality` is randomised for intro-order meta-learning. */
export function introduce(s: LearnerState, itemId: string, now: Date, ctx: { sessionId?: number; modality?: 'audio' | 'text'; batch?: number }): Writes {
  const item = ITEMS.get(itemId)!;
  const existing = facetsOf(s, itemId);
  return {
    srs: facetsToActivate(item.kind, existing).filter(usable).map((f) => newFacet(itemId, f, now)),
    mastery: [{
      ...(s.mastery.get(itemId) ?? newMastery(itemId, item.kind, +now)),
      introducedAt: +now, introModality: ctx.modality, introSessionId: ctx.sessionId, introBatchSize: ctx.batch,
    }],
    events: [{ at: +now, sessionId: ctx.sessionId, type: 'intro', itemId, meta: ctx.modality ? { modality: ctx.modality } : undefined }],
  };
}

const RECOGNITION_FORMATS = new Set(['hanzi_to_meaning_mc', 'audio_to_meaning_mc', 'meaning_to_chinese_bank', 'char_mc', 'cloze_mc', 'minimal_pair', 'tone_id']);

/** Elo difficulty of a task: unit level plus format offset. */
// ponytail: unit-based heuristic for item difficulty; calibrate from response data once meta-learning lands.
const difficultyOf = (item: Item, facet: Facet, format: string) =>
  (item.unit ? 0.4 * item.unit : item.kind === 'tone' ? 0.5 : 1) + ((FORMATS[facet].find((f) => f.id === format)?.k ?? 1) - 1);

export interface Answer {
  slot: Slot;
  facet: Facet;
  format: string;
  result: GradeResult;
  rtMs: number;
  /** Used a scaffold it wouldn't normally get (revealed pinyin, slow replay…). */
  assisted?: boolean;
  given: string;
  expected: string;
  context?: string;
  sessionId?: number;
}

/** Grade → FSRS review, item stats, skill ability, error record, and any facets this unlocks. */
export function applyAnswer(s: LearnerState, a: Answer, now: Date): { writes: Writes; unlocked: Facet[] } {
  const item = ITEMS.get(a.slot.itemId)!;
  const srsId = `${item.id}|${a.facet}`;
  const state = s.srs.get(srsId) ?? newFacet(item.id, a.facet, now);
  const correct = a.result.verdict === 'correct' || a.result.verdict === 'close';
  const R = retrievability(state.card, now);
  const grade = rate({
    correct,
    close: a.result.verdict === 'close',
    assisted: a.assisted,
    recognition: RECOGNITION_FORMATS.has(a.format),
    rtMs: a.rtMs,
    medianRtMs: median(s.answers.filter((e) => e.exercise === a.format && e.rtMs).slice(-20).map((e) => e.rtMs!)),
  });
  const { card, log } = review(state.card, grade, now, s.profile.desiredRetention);
  const updated = { ...state, card };
  const { elapsed_days, last_elapsed_days, scheduled_days, learning_steps, stability, difficulty, due, state: st } = log;
  const skill = SKILL_OF[a.facet];
  const error: ErrorRecord | undefined = correct || !a.result.category ? undefined : {
    at: +now, category: a.result.category, itemId: item.id, confusedWith: a.result.confusedWith, expected: a.expected, given: a.given,
    exercise: a.format, sessionId: a.sessionId, source: 'exercise', toneSwaps: a.result.toneSwaps, patternKey: '',
  };
  if (error) error.patternKey = patternKey(error);
  const unlocked = facetsToActivate(item.kind, [...facetsOf(s, item.id).filter((x) => x.id !== srsId), updated]).filter(usable);
  return {
    unlocked,
    writes: {
      srs: [updated, ...unlocked.map((f) => newFacet(item.id, f, now))],
      reviews: [{ srsId, itemId: item.id, facet: a.facet, at: +now, rating: grade, state: st, due, stability, difficulty, elapsed_days, last_elapsed_days, scheduled_days, learning_steps, exercise: a.format, retrievability: R }],
      mastery: [recordAnswer(s.mastery.get(item.id), {
        itemId: item.id, kind: item.kind, facet: a.facet, correct, at: +now, rtMs: a.rtMs,
        given: correct ? undefined : a.given, confusedWith: a.result.confusedWith, context: a.context,
      })],
      abilities: [updateAbility(s.abilities.get(skill) ?? { skill, theta: 0, n: 0, updatedAt: 0 }, difficultyOf(item, a.facet, a.format), correct, +now)],
      events: [{
        at: +now, sessionId: a.sessionId, type: 'answer', itemId: item.id, facet: a.facet, exercise: a.format, correct, rating: grade,
        rtMs: a.rtMs, predictedP: R, given: a.given, expected: a.expected, errorCategory: error?.category,
        meta: a.slot.drill ? { drill: a.slot.drill } : undefined,
      }],
      errors: error ? [error] : [],
    },
  };
}

/** Placement: words the learner proved they know start as already reviewed once (Good). */
export function seedKnown(s: LearnerState, itemIds: string[], now: Date): Writes {
  const w: Writes = { srs: [], mastery: [], events: [] };
  for (const id of itemIds) {
    const intro = introduce(s, id, now, { modality: 'text' });
    const reviewed = intro.srs!.map((x) => ({ ...x, card: review(x.card, Rating.Good, now).card }));
    const unlocked = facetsToActivate(ITEMS.get(id)!.kind, reviewed).filter(usable).map((f) => newFacet(id, f, now));
    w.srs!.push(...reviewed, ...unlocked);
    w.mastery!.push(...intro.mastery!);
    w.events!.push({ at: +now, type: 'placement', itemId: id, correct: true });
  }
  return w;
}
