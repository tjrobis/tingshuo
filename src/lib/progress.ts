// Progress derived from the learner's history, never stored as truth: capability achievements,
// fixed-form benchmarks, and the meta-learning experiments that tune the planner (LEARNING_ENGINE §11–12).

import { grammar, units, words } from './curriculum';
import { errorPatterns } from './grade';
import { expectedKnown, masteryStatus, median } from './learner';
import { FORMATS } from './planner';
import { db } from './db';
import { drillWins, facetsOf, isIntroduced, ITEMS, type LearnerState } from './session';
import type { AssessmentRecord, ConversationRecord, Facet } from './types';

const DAY = 86_400_000;

// ───────────── Statistics ─────────────
/** Successes out of trials. */
export interface Tally {
  k: number;
  n: number;
}
const tally = (xs: boolean[]): Tally => ({ k: xs.filter(Boolean).length, n: xs.length });
const pct = (x: Tally | number) => `${Math.round((typeof x === 'number' ? x : x.k / Math.max(1, x.n)) * 100)}%`;

/** erf, Abramowitz & Stegun 7.1.26 (error < 1.5e-7). */
function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x < 0 ? -y : y;
}
const beta = ({ k, n }: Tally) => {
  const [a, b] = [k + 1, n - k + 1];
  return { mean: a / (a + b), variance: (a * b) / ((a + b) ** 2 * (a + b + 1)) };
};

/** P(A's true rate > B's), from Beta(1,1) posteriors with a normal approximation. B may be a fixed rate. */
export function pBetter(a: Tally, b: Tally | number): number {
  const x = beta(a);
  const y = typeof b === 'number' ? { mean: b, variance: 0 } : beta(b);
  return 0.5 * (1 + erf((x.mean - y.mean) / Math.sqrt(2 * (x.variance + y.variance))));
}

// ───────────── Meta-learning (§11) ─────────────
export interface Insight {
  id: string;
  title: string;
  detail: string;
  n: number;
  probability: number;
  /** What the app changed, or what the learner could do. */
  action?: string;
}

/** An experiment still collecting data. */
export interface Experiment {
  id: string;
  title: string;
  n: number;
  needed: number;
  note?: string;
}

export interface Policy {
  /** Chance a new word is introduced audio-first (0.5 while exploring). */
  audioFirst: number;
  newItemCap: number;
  /** Per-format multipliers on the planner's difficulty exponents (planner.chooseFormat kScale). */
  formatK: Record<string, number>;
}

const MIN_ARM = 15;
const CONFIDENT = 0.9;

export const FORMAT_NAMES: Record<string, string> = {
  hanzi_to_meaning_mc: 'Choosing the meaning', hanzi_to_meaning_typed: 'Typing the meaning', audio_to_meaning_mc: 'Choosing what you heard',
  audio_to_meaning_typed: 'Typing what you heard', dictation: 'Dictation', meaning_to_chinese_bank: 'Picking the Chinese word',
  meaning_to_chinese_typed: 'Typing the Chinese', meaning_to_chinese_spoken: 'Saying the Chinese', hanzi_to_pinyin: 'Typing pinyin',
  char_mc: 'Character meanings', char_typed: 'Character pinyin', cloze_mc: 'Choosing the missing word', cloze_typed: 'Typing the missing word',
  sentence_build: 'Building sentences', translate_to_chinese: 'Translating into Chinese', minimal_pair: 'Telling sounds apart',
  tone_id: 'Naming tones', tone_production: 'Saying tones',
};

/** Each word's first review on a later day than its introduction (lookups aside): remembered? */
function firstReviews(s: LearnerState) {
  const seen = new Set<string>();
  return s.reviews.flatMap((r) => {
    if (r.elapsed_days < 1 || r.exercise === 'lookup' || !r.itemId.startsWith('w:') || seen.has(r.itemId)) return [];
    seen.add(r.itemId);
    return [{ m: s.mastery.get(r.itemId), ok: r.rating > 1 }];
  });
}

/**
 * What the learner's own history says about how they learn. An insight needs ≥ 15 observations per
 * arm and P ≥ 0.9; until then the experiment is listed as running. The policy is what sessions use.
 */
export function metaLearning(s: LearnerState, now: number): { insights: Insight[]; running: Experiment[]; policy: Policy } {
  const insights: Insight[] = [];
  const running: Experiment[] = [];
  const policy: Policy = { audioFirst: 0.5, newItemCap: s.profile.newItemCap ?? 8, formatK: {} };
  const first = firstReviews(s);
  const compare = (id: string, title: string, a: Tally, b: Tally, found: (aWins: boolean) => Omit<Insight, 'id' | 'n' | 'probability'>) => {
    if (Math.min(a.n, b.n) < MIN_ARM) return void running.push({ id, title, n: Math.min(a.n, b.n), needed: MIN_ARM });
    const p = pBetter(a, b);
    if (p >= CONFIDENT || p <= 1 - CONFIDENT) insights.push({ id, n: a.n + b.n, probability: Math.max(p, 1 - p), ...found(p >= CONFIDENT) });
    else running.push({ id, title, n: Math.min(a.n, b.n), needed: MIN_ARM, note: `${pct(a)} vs ${pct(b)} so far: no clear difference yet.` });
  };

  // 1. Introduction modality, randomised 50/50 when each word is introduced.
  const arm = (m: 'audio' | 'text') => tally(first.filter((x) => x.m?.introModality === m).map((x) => x.ok));
  const [heard, seen] = [arm('audio'), arm('text')];
  compare('modality', 'Hearing new words first, or seeing them first', heard, seen, (audioWins) => {
    policy.audioFirst = audioWins ? 0.9 : 0.1;
    return {
      title: audioWins ? 'New words stick better when you hear them first' : 'New words stick better when you see them first',
      detail: `Remembered at the first review on a later day: ${pct(heard)} of ${heard.n} heard first, ${pct(seen)} of ${seen.n} seen first.`,
      action: `New words are now introduced ${audioWins ? 'audio' : 'text'}-first 90% of the time (the other 10% keep checking).`,
    };
  });

  // 2. New words per session (varied ±1 by day once the first week is over).
  const sized = first.filter((x) => x.m?.introBatchSize);
  const mid = median(sized.map((x) => x.m!.introBatchSize!)) ?? 0;
  const small = tally(sized.filter((x) => x.m!.introBatchSize! <= mid).map((x) => x.ok));
  const large = tally(sized.filter((x) => x.m!.introBatchSize! > mid).map((x) => x.ok));
  compare('batch', 'Fewer or more new words per session', small, large, (smallWins) => {
    const own = s.profile.newItemCap !== undefined;
    if (smallWins && !own) policy.newItemCap = Math.max(3, mid);
    return {
      title: smallWins ? 'Fewer new words at a time stick better for you' : 'You keep up fine with more new words at a time',
      detail: `Remembered at the first review: ${pct(small)} from sessions with up to ${mid} new words, ${pct(large)} from bigger ones.`,
      action: smallWins ? (own ? 'Your own setting for new words still applies.' : `At most ${Math.max(3, mid)} new words per session now.`) : undefined,
    };
  });

  // 3. Hearing tones vs saying them.
  const acc = (f: Facet) => tally(s.answers.filter((e) => e.facet === f).slice(-60).map((e) => !!e.correct));
  const [hear, say] = [acc('perceive'), acc('produce')];
  if (say.n) {
    compare('tones', 'Hearing tones vs saying them', hear, say, (hearWins) => ({
      title: hearWins ? 'You hear tones better than you say them' : 'You say tones better than you hear them',
      detail: `${pct(hear)} right hearing them, ${pct(say)} saying them (last ${hear.n} and ${say.n}).`,
      action: hearWins ? 'Tone pairs in Tones, with the microphone on, close this gap fastest.' : 'Say "more tones" to get more listening drills.',
    }));
  }

  // 4. Format calibration: does "predicted success = R^k" hold for this learner? Spaced reviews only.
  for (const f of Object.values(FORMATS).flat()) {
    const rs = s.reviews.filter((r) => r.exercise === f.id && r.elapsed_days >= 1 && r.retrievability !== undefined).slice(-100);
    if (rs.length < 30) continue;
    const actual = tally(rs.map((r) => r.rating > 1));
    const predicted = (k: number) => rs.reduce((m, r) => m + r.retrievability! ** k, 0) / rs.length;
    const p = pBetter(actual, predicted(f.k));
    if (p < CONFIDENT && p > 1 - CONFIDENT) continue;
    let [lo, hi] = [0.1, 10]; // R^k falls as k grows: bisect (within bounds) for the k that predicts what happened
    for (let i = 0; i < 40; i++) [lo, hi] = predicted((lo + hi) / 2) > actual.k / actual.n ? [(lo + hi) / 2, hi] : [lo, (lo + hi) / 2];
    policy.formatK[f.id] = Math.round(((lo + hi) / 2 / f.k) * 100) / 100;
    const easier = p >= CONFIDENT;
    insights.push({
      id: `format:${f.id}`, n: actual.n, probability: Math.max(p, 1 - p),
      title: `${FORMAT_NAMES[f.id] ?? f.id} is ${easier ? 'easier' : 'harder'} for you than expected`,
      detail: `Expected ${pct(predicted(f.k))} right, got ${pct(actual)} over ${actual.n} reviews.`,
      action: easier ? 'You now get this exercise type sooner.' : 'You now get this exercise type later, after more support.',
    });
  }

  // 5. Time of day new words are learned (a suggestion only).
  const bucket = (t: number) => ((h) => (h >= 5 && h < 12 ? 'morning' : h >= 12 && h < 18 ? 'afternoon' : 'evening'))(new Date(t).getHours());
  const timed = first.filter((x) => x.m?.introducedAt);
  const best = (['morning', 'afternoon', 'evening'] as const).find((b) => {
    const [inB, rest] = [true, false].map((same) => tally(timed.filter((x) => (bucket(x.m!.introducedAt!) === b) === same).map((x) => x.ok)));
    if (Math.min(inB.n, rest.n) < MIN_ARM || pBetter(inB, rest) < CONFIDENT) return false;
    insights.push({
      id: 'time', n: timed.length, probability: pBetter(inB, rest),
      title: `You remember more of what you learn in the ${b}`,
      detail: `${pct(inB)} of words learned in the ${b} were remembered at the next review, ${pct(rest)} of the rest.`,
      action: `If you can, learn new words in the ${b} and do reviews at other times.`,
    });
    return true;
  });
  if (!best) running.push({ id: 'time', title: 'Best time of day for new words', n: timed.length, needed: 3 * MIN_ARM });

  // 6. Real retention vs the target.
  const recent = tally(s.reviews.filter((r) => r.at >= now - 30 * DAY && r.elapsed_days >= 1 && r.exercise !== 'lookup').map((r) => r.rating > 1));
  const target = s.profile.desiredRetention;
  if (recent.n < 50) running.push({ id: 'retention', title: 'How much you remember vs your target', n: recent.n, needed: 50 });
  else {
    const p = pBetter(recent, target);
    if (p <= 1 - CONFIDENT) {
      insights.push({
        id: 'retention', n: recent.n, probability: 1 - p, title: 'Reviews are arriving a little late for you',
        detail: `You remembered ${pct(recent)} of reviews in the last 30 days; the target is ${pct(target)}.`,
        action: 'Short daily sessions keep up with reviews better than long occasional ones.',
      });
    } else if (p >= CONFIDENT && recent.k / recent.n > target + 0.04) {
      insights.push({
        id: 'retention', n: recent.n, probability: p, title: 'You remember more than your target',
        detail: `You remembered ${pct(recent)} of reviews in the last 30 days; the target is ${pct(target)}.`,
        action: 'A lower memory target in Settings would space reviews further apart: less review time.',
      });
    }
  }
  return { insights, running, policy };
}

// ───────────── Achievements (capabilities, not points) ─────────────
export interface Achievement {
  id: string;
  title: string;
  detail: string;
  /** 0..1; unlocked at 1. */
  progress: number;
}

const HOLDING = new Set(['developing', 'strong', 'mastered']);

export function achievements(s: LearnerState, now: Date, talks: ConversationRecord[]): Achievement[] {
  const holding = (ids: string[]) =>
    ids.filter((id) => isIntroduced(s, id) && HOLDING.has(masteryStatus(ITEMS.get(id)!.kind, facetsOf(s, id), now))).length / Math.max(1, ids.length);
  const unitItems = (n: number) => [...words.filter((w) => !w.incidental && w.unit === n).map((w) => w.id), ...grammar.filter((g) => g.unit === n).map((g) => g.id)];
  const tones = tally(s.answers.filter((e) => e.facet === 'perceive').slice(-20).map((e) => !!e.correct));
  const all = [...s.srs.values()];
  const storyHits = new Map<string, number>();
  for (const e of s.answers) if (e.meta?.practice === 'story' && e.correct) storyHits.set(String(e.meta.ref), (storyHits.get(String(e.meta.ref)) ?? 0) + 1);
  const understood = [...storyHits.values()].filter((k) => k >= 2).length;
  const missions = new Set(s.answers.filter((e) => e.meta?.practice === 'mission' && e.correct).map((e) => e.meta!.ref)).size;
  const minutes = talks.reduce((m, c) => m + c.minutes, 0);
  const longest = Math.max(0, ...talks.map((c) => c.minutes));
  const fixed = errorPatterns(s.errors, drillWins(s), +now).some((p) => p.status === 'resolved');
  const at = (x: number, goal: number) => Math.min(1, x / goal);
  return [
    { id: 'tones', title: 'You can hear all four tones', detail: '16 of your last 20 tone questions right.', progress: Math.min(at(tones.n, 20), at(tones.k / Math.max(1, tones.n), 0.8)) },
    ...units.map((u) => ({ id: `unit-${u.n}`, title: `Unit ${u.n}: ${u.title}`, detail: u.goal, progress: holding(unitItems(u.n)) })),
    {
      id: 'm1', title: 'Ready for a 5-minute conversation', detail: 'Units 1–11 holding, and one conversation of 5 minutes or more.',
      progress: Math.min(at(holding(units.filter((u) => u.n <= 11).flatMap((u) => unitItems(u.n))), 0.9), at(longest, 5)),
    },
    { id: 'recognise-100', title: 'Recognise 100 words', detail: 'Words you would recognise right now, by the memory model.', progress: at(expectedKnown(all, 'meaning', now), 100) },
    { id: 'recognise-200', title: 'Recognise 200 words', detail: 'Words you would recognise right now, by the memory model.', progress: at(expectedKnown(all, 'meaning', now), 200) },
    { id: 'say-50', title: 'Say 50 words from memory', detail: 'Words you could produce from their meaning right now.', progress: at(expectedKnown(all, 'recall', now), 50) },
    { id: 'say-150', title: 'Say 150 words from memory', detail: 'Words you could produce from their meaning right now.', progress: at(expectedKnown(all, 'recall', now), 150) },
    { id: 'story-1', title: 'Understood a story in Chinese', detail: 'At least two comprehension questions right on one story.', progress: at(understood, 1) },
    { id: 'story-5', title: 'Understood five stories', detail: 'At least two comprehension questions right on each.', progress: at(understood, 5) },
    { id: 'talk-1', title: 'First conversation', detail: 'A conversation where you said at least three things.', progress: at(talks.filter((c) => c.turns >= 3).length, 1) },
    { id: 'talk-60', title: 'An hour of conversation', detail: 'Time spent talking with the tutor, in total.', progress: at(minutes, 60) },
    { id: 'fixed', title: 'Fixed a mistake that kept coming back', detail: 'A recurring mistake, drilled until it stopped.', progress: fixed ? 1 : 0 },
    { id: 'mission-1', title: 'First mission done', detail: 'A real-world task, done in Chinese.', progress: at(missions, 1) },
    { id: 'mission-5', title: 'Five missions done', detail: 'Real-world tasks, done in Chinese.', progress: at(missions, 5) },
  ];
}

/** Record achievements met for the first time; once unlocked, one stays unlocked with its date. */
export async function syncAchievements(s: LearnerState, now = new Date()) {
  const met = achievements(s, now, await db.conversations.toArray()).filter((a) => a.progress >= 1);
  // Read and add in one transaction: overlapping calls (StrictMode runs effects twice) must not both add.
  await db.transaction('rw', db.achievements, async () => {
    const have = new Set(await db.achievements.toCollection().primaryKeys());
    await db.achievements.bulkAdd(met.filter((a) => !have.has(a.id)).map((a) => ({ id: a.id, unlockedAt: +now })));
  });
}

// ───────────── Benchmarks (§12): fixed forms, comparable over time ─────────────
export type BenchSkill = 'recall' | 'reading' | 'listening' | 'grammar' | 'tones';
export const BENCH_SKILLS: Record<BenchSkill, string> = {
  recall: 'Saying words from their meaning', reading: 'Reading characters', listening: 'Understanding by ear',
  grammar: 'Grammar in sentences', tones: 'Hearing tone pairs',
};
export interface BenchItem {
  itemId: string;
  facet: Facet;
  format: string;
  skill: BenchSkill;
}
export const BENCHMARKS = [
  { id: 'A', title: 'Units 1–4', upTo: 4 },
  { id: 'B', title: 'Units 1–8', upTo: 8 },
  { id: 'C', title: 'Units 1–12', upTo: 12 },
];

/** A stable string hash, so a form picks the same items on every device and version. */
export const hash = (str: string) => [...str].reduce((h, c) => (Math.imul(h, 31) + c.codePointAt(0)!) >>> 0, 7);

/** Seeded PRNG (mulberry32): benchmark exercises are built the same way every time. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The fixed item list of a form. Without audio the listening and tone parts are left out (and compared separately). */
export function benchmarkForm(id: string, audio: boolean): BenchItem[] {
  const { upTo } = BENCHMARKS.find((b) => b.id === id)!;
  // Particles and measure words have no English meaning to type.
  const pool = words.filter((w) => !w.incidental && w.unit <= upTo && w.pos !== 'part' && w.pos !== 'mw').sort((a, b) => hash(a.id) - hash(b.id));
  const pick = (from: number, n: number, facet: Facet, format: string, skill: BenchSkill): BenchItem[] =>
    pool.slice(from, from + n).map((w) => ({ itemId: w.id, facet, format, skill }));
  return [
    ...pick(0, 8, 'recall', 'meaning_to_chinese_typed', 'recall'),
    ...pick(8, 6, 'meaning', 'hanzi_to_meaning_typed', 'reading'),
    ...(audio ? pick(14, 8, 'listening', 'audio_to_meaning_typed', 'listening') : []),
    ...grammar.filter((g) => g.unit <= upTo).sort((a, b) => hash(a.id) - hash(b.id)).slice(0, 4)
      .map((g): BenchItem => ({ itemId: g.id, facet: 'grammar', format: 'cloze_typed', skill: 'grammar' })),
    ...(audio ? ['tp:2-3', 'tp:3-3', 'tp:4-1', 'tp:3-0'].map((itemId): BenchItem => ({ itemId, facet: 'perceive', format: 'tone_id', skill: 'tones' })) : []),
  ];
}

/** The form for the learner's level: the first one covering the unit they're in. */
export function currentForm(s: LearnerState) {
  const unit = words.find((w) => !w.incidental && !isIntroduced(s, w.id))?.unit ?? units.length;
  return BENCHMARKS.find((b) => b.upTo >= unit) ?? BENCHMARKS[BENCHMARKS.length - 1];
}

/** A benchmark is worth taking every two weeks, once there's something to measure. */
export const benchmarkDue = (s: LearnerState, history: AssessmentRecord[], now: number) =>
  [...s.mastery.values()].filter((m) => m.introducedAt !== undefined).length >= 15 &&
  !history.some((a) => a.kind === 'benchmark' && a.form === currentForm(s).id && a.at > now - 14 * DAY);

export function scoreBenchmark(form: string, items: BenchItem[], correct: boolean[], at: number): AssessmentRecord {
  const skills = [...new Set(items.map((x) => x.skill))];
  return {
    at, kind: 'benchmark', form, estimates: {},
    results: skills.map((skill) => {
      const mine = items.flatMap((x, i) => (x.skill === skill ? [correct[i]] : []));
      return { skill, correct: mine.filter(Boolean).length, total: mine.length };
    }),
    items: items.map((x, i) => ({ id: x.itemId, skill: x.skill, correct: correct[i] })),
  };
}
