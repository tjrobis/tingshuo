// The learning loop: item registry, learner state, building a session queue, and applying answers.
// Pure functions over an in-memory LearnerState; db.ts persists the Writes they return.

import { characters, dialogues, grammar, sentences, sentenceWords, soundPairs, stories, wordById, words } from './curriculum';
import type { Writes } from './db';
import { errorPatterns, patternKey, type GradeResult } from './grade';
import { computeCoverage, splitTokenised, type Coverage } from './segment';
import { expectedKnown, facetsToActivate, median, newMastery, recordAnswer, updateAbility } from './learner';
import { FORMATS, type PlanInput, type SessionPlan } from './planner';
import { createEmptyCard, rate, Rating, retrievability, review, State } from './srs';
import type {
  ErrorRecord, Facet, ItemKind, LearningEvent, LessonRecord, MasteryState, ReviewRecord, Skill, SkillAbility, SRSState, Story, UserProfile,
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
/** Production drills need a microphone the learner has switched on. */
const usable = (s: LearnerState) => (f: Facet) => f !== 'produce' || !!s.profile.micAvailable;

/** Apply a profile change to the in-memory state (the caller persists it). */
export const commitProfile = (s: LearnerState, patch: Partial<UserProfile>) => Object.assign(s.profile, patch);

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
  // "Practise this" from the reader jumps the queue, even ahead of the current unit.
  const asked = s.profile.focus.filter((f) => f.kind === 'item' && ITEMS.has(f.key) && !isIntroduced(s, f.key)).map((f) => f.key);
  const open = words.filter((w) => !w.incidental && !isIntroduced(s, w.id));
  const unit = open[0]?.unit ?? 0;
  // Within the current unit, teach next whichever word makes the most sentences readable ("every new
  // word should unlock sentences"); interests only break ties, and never skip ahead of the curriculum.
  const known = new Set([...s.mastery.values()].filter((m) => m.introducedAt !== undefined).map((m) => m.itemId));
  const usableSentences = sentences.filter((x) => x.unit <= unit).map(sentenceWords);
  const missing = (ids: string[]) => ids.filter((id) => !known.has(id) && ITEMS.has(id)).length; // names aren't in ITEMS
  const pool = open.filter((w) => w.unit === unit);
  const next: typeof pool = [];
  while (pool.length) {
    const score = (w: (typeof pool)[number]) =>
      usableSentences.filter((ids) => ids.includes(w.id)).reduce((sum, ids) => sum + (missing(ids) === 1 ? 1 : missing(ids) === 2 ? 0.25 : 0), 0) +
      (w.topics.some((t) => interests.has(t)) ? 0.1 : 0);
    const best = pool.reduce((a, b) => (score(b) > score(a) ? b : a));
    next.push(best);
    known.add(best.id);
    pool.splice(pool.indexOf(best), 1);
  }
  return [...new Set([
    ...asked,
    ...grammarReady.slice(0, 1).map((g) => g.id),
    ...charsReady.slice(0, 2).map((c) => c.id),
    ...next.map((w) => w.id),
    ...open.filter((w) => w.unit > unit).map((w) => w.id),
  ])];
}

// ───────────── Reading (LEARNING_ENGINE §10) ─────────────
/** Known for reading: taught, and its meaning or sound is still more likely remembered than not. */
export function knowsWord(s: LearnerState, id: string, now: Date): boolean {
  const R = (f: Facet) => {
    const x = s.srs.get(`${id}|${f}`);
    return x ? retrievability(x.card, now) : 0;
  };
  return Math.max(R('meaning'), R('listening')) >= 0.5;
}

/** Share of a story's words the learner knows; names don't count either way. */
export function storyCoverage(s: LearnerState, st: Story, now: Date): Coverage {
  const tokens = st.paragraphs.flat().flatMap((l) => l.tokens).filter((t) => !wordById.get(`w:${t.ref}`)?.incidental);
  return computeCoverage(tokens, (t) => !!t.ref && knowsWord(s, `w:${t.ref}`, now));
}

/** Target known-word share: 92 %, harder (88 %) while comprehension stays ≥ 90 %, easier (96 %) below 60 %. */
export function coverageTarget(s: LearnerState): number {
  const recent = s.answers.filter((e) => e.meta?.practice === 'story').slice(-6);
  if (recent.length < 3) return 0.92;
  const rate = recent.filter((e) => e.correct).length / recent.length;
  return rate >= 0.9 ? 0.88 : rate < 0.6 ? 0.96 : 0.92;
}

/** The unread curated story whose coverage is closest to the target (ties: the most advanced), if any is readable enough. */
export function nextStory(s: LearnerState, now: Date): Story | undefined {
  const read = new Set(s.answers.filter((e) => e.meta?.practice === 'story').map((e) => e.meta!.ref));
  const target = coverageTarget(s);
  return stories
    .filter((st) => !read.has(st.id))
    .map((st) => ({ st, c: storyCoverage(s, st, now).coverage }))
    .filter((x) => x.c >= target - 0.07)
    .sort((a, b) => Math.abs(a.c - target) - Math.abs(b.c - target) || b.st.unit - a.st.unit)[0]?.st;
}

/** A word tapped while reading: logged, and a taught word's meaning counts as forgotten unless reviewed in the last 10 minutes (§3). */
export function applyLookup(s: LearnerState, itemId: string, now: Date, context?: string): Writes {
  const event: LearningEvent = { at: +now, type: 'lookup', itemId, meta: context ? { context } : undefined };
  const meaning = s.srs.get(`${itemId}|meaning`);
  const m = s.mastery.get(itemId);
  if (!meaning || meaning.card.state === State.New || s.reviews.some((r) => r.srsId === meaning.id && r.at > +now - 10 * 60_000)) {
    return { events: [event], mastery: m ? [{ ...m, lookups: m.lookups + 1 }] : [] };
  }
  const { writes } = applyAnswer(s, { slot: { key: 'lookup', itemId }, facet: 'meaning', format: 'lookup', result: { verdict: 'wrong', notes: [] }, rtMs: 0, given: '', expected: '', context }, now);
  return { ...writes, mastery: writes.mastery!.map((x) => ({ ...x, lookups: x.lookups + 1 })), events: [...writes.events!, event] };
}

// ───────────── Planning input ─────────────
/** Correct answers in targeted drills (they resolve error patterns). */
export const drillWins = (s: LearnerState) => s.answers.filter((e) => e.correct && typeof e.meta?.drill === 'string').map((e) => ({ key: e.meta!.drill as string, at: e.at }));

/** −1, 0 or +1 new words, varying by day: the batch-size experiment (LEARNING_ENGINE §11). */
export const exploreOffset = (now: number) => (((Math.floor(now / DAY) * 2654435761) >>> 0) % 3) - 1;

/** `policy` comes from meta-learning (progress.ts); without it the defaults apply. */
export function planInput(s: LearnerState, minutes: number, now: Date, audio = true, policy?: { newItemCap: number }): PlanInput {
  const t = +now;
  const due = [...s.srs.values()].filter((x) => x.card.state !== State.New && +x.card.due <= t && !isPronunciation(x.itemId));
  const recent = s.reviews.filter((r) => r.elapsed_days >= 1 && (s.mastery.get(r.itemId)?.introducedAt ?? 0) >= t - 4 * DAY);
  const perceive = s.answers.filter((e) => e.facet === 'perceive').slice(-30);
  const wins = drillWins(s);
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
    micAvailable: !!s.profile.micAvailable,
    knownWords: expectedKnown([...s.srs.values()], 'meaning', now),
    inputAvailable: !!nextStory(s, now),
    recurringPatterns: recurring.length,
    toneConfusion: recurring.some((p) => p.key.startsWith('tone:')),
    focus: s.profile.focus,
    newItemCap: policy?.newItemCap ?? s.profile.newItemCap ?? 8,
    // Experiment only once the first week is settled.
    explore: (t - s.profile.createdAt) / DAY >= 7 ? exploreOffset(t) : 0,
    newAvailable: newCandidates(s).length,
  };
}

/** Every word in tokenised text has been introduced (names don't need to be). */
const readable = (s: LearnerState, zh: string) =>
  splitTokenised(zh).every((t) => t.kind !== 'han' || isIntroduced(s, `w:${t.ref}`) || !ITEMS.has(`w:${t.ref}`));

// ───────────── Queue ─────────────
export interface Slot {
  key: string;
  itemId: string;
  /** Facet to test; absent for an introduction. */
  facet?: Facet;
  intro?: boolean;
  /** Error-pattern key when this slot is a targeted drill. */
  drill?: string;
  /** Practice that isn't a spaced-repetition review: shadowing a sentence, a listening dialogue, a story, a mission. */
  practice?: 'shadow' | 'dialogue' | 'story' | 'mission';
  /** Sentence, dialogue, story or mission id for practice slots. */
  ref?: string;
}

/**
 * Turn a plan into an ordered queue: pronunciation warm-up → reviews interleaved with new items
 * (each new item re-tested after a gap) → a story → listening (a dialogue, then words) → speaking (tone production,
 * shadowing) → error drills → closing retrieval of today's items.
 * Exercise formats are chosen later, when each slot is shown, from the then-current recall probability.
 */
export function buildQueue(s: LearnerState, plan: SessionPlan, now: Date, opts: { audio: boolean }): Slot[] {
  let n = 0;
  const slot = (itemId: string, facet?: Facet, extra: Partial<Slot> = {}): Slot => ({ key: `${itemId}|${facet ?? 'intro'}|${n++}`, itemId, facet, ...extra });
  const capacity = (kind: string, secs = 12) => Math.round(((plan.blocks.find((b) => b.kind === kind)?.minutes ?? 0) * 60) / secs);
  const R = (x: SRSState) => retrievability(x.card, now);
  const all = [...s.srs.values()].filter((x) => usable(s)(x.facet) && (opts.audio || (x.facet !== 'listening' && !isPronunciation(x.itemId))));
  const due = all.filter((x) => x.card.state !== State.New && +x.card.due <= +now).sort((a, b) => R(a) - R(b));
  const queued = new Set<string>();
  const take = (xs: SRSState[]) => xs.filter((x) => !queued.has(x.id) && queued.add(x.id)).map((x) => slot(x.itemId, x.facet));

  // Warm-up: due pronunciation items, then up to 3 new ones (all four tones on day one), then the weakest.
  const warm: Slot[] = [];
  if (opts.audio) {
    const cap = capacity('warmup');
    warm.push(...take(due.filter((x) => isPronunciation(x.itemId) && x.facet === 'perceive').slice(0, cap)));
    const newSounds = PRONUNCIATION_ORDER.filter((id) => !isIntroduced(s, id)).slice(0, isIntroduced(s, 't:1') ? 3 : 4);
    for (const id of newSounds.slice(0, Math.max(0, Math.floor((cap - warm.length) / 2)))) warm.push(slot(id, undefined, { intro: true }), slot(id, 'perceive'));
    warm.push(...take(all.filter((x) => isPronunciation(x.itemId) && x.facet === 'perceive' && x.card.state !== State.New).sort((a, b) => R(a) - R(b)).slice(0, Math.max(0, cap - warm.length))));
  }

  // Reviews: first anything the learner asked to practise (and hasn't answered since), then most
  // at-risk first, with new items woven in; each new item's first test waits ≥ 2 slots.
  const asked = s.profile.focus.filter((f) => f.kind === 'item' && f.until > +now && !s.answers.some((e) => e.itemId === f.key && e.at > (f.since ?? 0)));
  const reviews = [
    ...take(asked.flatMap((f) => all.filter((x) => x.itemId === f.key).sort((a, b) => R(a) - R(b)).slice(0, 1))),
    ...take(due.filter((x) => !isPronunciation(x.itemId)).slice(0, plan.reviews)),
  ];
  const fresh = newCandidates(s).slice(0, plan.newItems);
  const main: Slot[] = [];
  let waiting: Slot[] = [];
  for (const id of fresh) {
    main.push(slot(id, undefined, { intro: true }), ...reviews.splice(0, 2), ...waiting);
    waiting = [slot(id, PRIMARY[ITEMS.get(id)!.kind])];
  }
  main.push(...reviews, ...waiting);

  // Reading: one story at the learner's level, when the plan has a couple of minutes for it.
  const story = capacity('input', 150) ? nextStory(s, now) : undefined;
  const input = story ? [slot(story.id, undefined, { practice: 'story', ref: story.id })] : [];

  // Listening: one dialogue the learner can fully follow (most advanced first, not heard in 3 days),
  // then words heard least recently (including today's new ones).
  const listening: Slot[] = [];
  if (opts.audio && capacity('listening')) {
    const recent = new Set(s.answers.filter((e) => e.at > +now - 3 * DAY && e.meta?.practice === 'dialogue').map((e) => e.meta!.ref));
    const dialogue = dialogues.filter((d) => !recent.has(d.id) && d.lines.every((l) => readable(s, l.zh))).sort((a, b) => b.unit - a.unit)[0];
    if (dialogue) listening.push(slot(dialogue.id, undefined, { practice: 'dialogue', ref: dialogue.id }));
    listening.push(...take(all.filter((x) => x.facet === 'listening' && (x.card.state !== State.New || fresh.includes(x.itemId))).sort((a, b) => R(a) - R(b)).slice(0, Math.max(0, capacity('listening') - 4 * listening.length))));
  }

  // Speaking (microphone on): tone production for sounds already heard, then shadowing sentences
  // built from recent words.
  const speaking: Slot[] = [];
  if (s.profile.micAvailable && opts.audio && capacity('speaking', 20)) {
    const cap = capacity('speaking', 20);
    const produce = all.filter((x) => x.facet === 'produce').sort((a, b) => R(a) - R(b));
    const unpracticed = PRONUNCIATION_ORDER.filter((id) => id.startsWith('t') && isIntroduced(s, id) && !s.srs.has(`${id}|produce`));
    speaking.push(...take(produce.filter((x) => +x.card.due <= +now)), ...unpracticed.map((id) => slot(id, 'produce')));
    speaking.splice(Math.ceil(cap / 2));
    const shadowed = new Set(s.answers.filter((e) => e.at > +now - DAY && e.meta?.practice === 'shadow').map((e) => e.meta!.ref));
    const recentWords = new Set([...s.mastery.values()].filter((m) => (m.introducedAt ?? 0) > +now - 7 * DAY).map((m) => m.itemId));
    const shadow = sentences
      .filter((x) => !shadowed.has(x.id) && readable(s, x.zh))
      .sort((a, b) => sentenceWords(b).filter((w) => recentWords.has(w)).length - sentenceWords(a).filter((w) => recentWords.has(w)).length)
      .slice(0, Math.max(1, cap - speaking.length));
    speaking.push(...shadow.map((x) => slot(sentenceWords(x).find((w) => ITEMS.has(w)) ?? sentenceWords(x)[0], undefined, { practice: 'shadow', ref: x.id })));
  }

  // Targeted drills for mistakes that keep coming back.
  const wins = drillWins(s);
  const drills = errorPatterns(s.errors, wins, +now)
    .filter((p) => p.status === 'recurring')
    .flatMap((p) => p.itemIds.filter((id) => ITEMS.has(id) && isIntroduced(s, id)).map((id) => slot(id, id.startsWith('w:') ? 'recall' : PRIMARY[ITEMS.get(id)!.kind], { drill: p.key })))
    .slice(0, capacity('errors', 15));

  // Close by retrieving today's new words again, from production if it has unlocked by then.
  const closing = fresh.filter((id) => id.startsWith('w:')).map((id) => slot(id, 'recall'));
  return [...warm, ...main, ...input, ...listening, ...speaking, ...drills, ...closing];
}

// ───────────── Learning steps ─────────────
/** Activate an item's first facets. `modality` is randomised for intro-order meta-learning. */
export function introduce(s: LearnerState, itemId: string, now: Date, ctx: { sessionId?: number; modality?: 'audio' | 'text'; batch?: number }): Writes {
  const item = ITEMS.get(itemId)!;
  const existing = facetsOf(s, itemId);
  return {
    srs: facetsToActivate(item.kind, existing).filter(usable(s)).map((f) => newFacet(itemId, f, now)),
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
  const unlocked = facetsToActivate(item.kind, [...facetsOf(s, item.id).filter((x) => x.id !== srsId), updated]).filter(usable(s));
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

export interface Practice {
  slot: Slot;
  correct: boolean;
  /** Content difficulty on the ability scale (≈ 0.4 × unit). */
  level: number;
  rtMs: number;
  given: string;
  expected: string;
  sessionId?: number;
}

/** Shadowing, dialogues and stories aren't reviews: they move the speaking/listening/reading ability, not FSRS. */
export function applyPractice(s: LearnerState, p: Practice, now: Date): Writes {
  const skill: Skill = p.slot.practice === 'dialogue' ? 'listening' : p.slot.practice === 'story' ? 'reading' : 'speaking'; // shadowing, missions
  return {
    abilities: [updateAbility(s.abilities.get(skill) ?? { skill, theta: 0, n: 0, updatedAt: 0 }, p.level, p.correct, +now)],
    events: [{
      at: +now, sessionId: p.sessionId, type: 'answer', itemId: p.slot.itemId, exercise: p.slot.practice, correct: p.correct,
      rtMs: p.rtMs, given: p.given, expected: p.expected, meta: { practice: p.slot.practice, ref: p.slot.ref },
    }],
  };
}

/** Placement: words the learner proved they know start as already reviewed once (Good). */
export function seedKnown(s: LearnerState, itemIds: string[], now: Date): Writes {
  const w: Writes = { srs: [], mastery: [], events: [] };
  for (const id of itemIds) {
    const intro = introduce(s, id, now, { modality: 'text' });
    const reviewed = intro.srs!.map((x) => ({ ...x, card: review(x.card, Rating.Good, now).card }));
    const unlocked = facetsToActivate(ITEMS.get(id)!.kind, reviewed).filter(usable(s)).map((f) => newFacet(id, f, now));
    w.srs!.push(...reviewed, ...unlocked);
    w.mastery!.push(...intro.mastery!);
    w.events!.push({ at: +now, type: 'placement', itemId: id, correct: true });
  }
  return w;
}
