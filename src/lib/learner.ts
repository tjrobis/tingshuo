// The learner model: mastery status, facet unlocking, per-item stats, skill abilities, progress.
// All pure functions of stored state (LEARNING_ENGINE.md §2, §4, §5, §12).

import { retrievability, State } from './srs';
import {
  FACETS_BY_KIND,
  type Facet,
  type ItemKind,
  type MasteryState,
  type MasteryStatus,
  type ReviewRecord,
  type SkillAbility,
  type SRSState,
} from './types';

const DAY = 86_400_000;
const RECOGNITION: Record<ItemKind, Facet> = {
  word: 'meaning', char: 'char', grammar: 'grammar', tone: 'perceive', tonepair: 'perceive', sound: 'perceive',
};
const PRODUCTION: Partial<Record<ItemKind, Facet>> = { word: 'recall', grammar: 'grammarProd', tone: 'produce', tonepair: 'produce' };

const stability = (states: SRSState[], facet: Facet) =>
  states.find((s) => s.facet === facet && s.card.state !== State.New)?.card.stability ?? 0;

/**
 * Derived, never stored: recognising an item caps it at "developing" until production is stable,
 * and anything slipping below 70 % recall probability is "at risk" whatever it reached before.
 */
export function masteryStatus(kind: ItemKind, states: SRSState[], now: Date): MasteryStatus {
  const seen = states.filter((s) => s.card.state !== State.New);
  if (!seen.length) return 'new';
  const rec = stability(states, RECOGNITION[kind]);
  const prod = PRODUCTION[kind] ? stability(states, PRODUCTION[kind]) : Infinity;
  const listen = states.some((s) => s.facet === 'listening') ? stability(states, 'listening') : Infinity;
  const status: MasteryStatus =
    rec >= 30 && prod >= 21 && listen >= 21 ? 'mastered'
    : rec >= 7 && prod >= 3 ? 'strong'
    : Math.max(...seen.map((s) => s.card.stability)) >= 1 ? 'developing'
    : 'learning';
  return status !== 'learning' && seen.some((s) => retrievability(s.card, now) < 0.7) ? 'at_risk' : status;
}

/**
 * Facets that should be active but aren't. A new word starts with meaning + listening; production
 * (recall) unlocks after its first successful recognition, tone reading once recall holds 2 days.
 * Stability ≥ 1 day is the card-level sign of a first success (an Again leaves it at ~0.2).
 */
export function facetsToActivate(kind: ItemKind, active: SRSState[]): Facet[] {
  const s = (f: Facet) => stability(active, f);
  const want: Facet[] =
    kind === 'word'
      ? ['meaning', 'listening', ...(Math.max(s('meaning'), s('listening')) >= 1 ? (['recall'] as const) : []), ...(s('recall') >= 2 ? (['reading'] as const) : [])]
      : kind === 'grammar'
        ? ['grammar', ...(s('grammar') >= 1 ? (['grammarProd'] as const) : [])]
        : FACETS_BY_KIND[kind];
  return want.filter((f) => !active.some((x) => x.facet === f));
}

export interface AnswerFact {
  itemId: string;
  kind: ItemKind;
  facet: Facet;
  correct: boolean;
  at: number;
  rtMs?: number;
  given?: string;
  confusedWith?: string;
  context?: string; // sentence / story id
}

/** Fold one answer into the item's running statistics. */
export function recordAnswer(m: MasteryState | undefined, a: AnswerFact): MasteryState {
  const prev: MasteryState = m ?? {
    itemId: a.itemId, kind: a.kind, firstSeen: a.at, lastSeen: a.at, encounters: 0, byFacet: {},
    rtSamples: [], contexts: [], mistakes: [], confusions: [], lookups: 0, flags: {},
  };
  const f = prev.byFacet[a.facet] ?? { correct: 0, incorrect: 0 };
  const mistake = prev.mistakes.find((x) => x.given === a.given);
  const confusion = prev.confusions.find((x) => x.itemId === a.confusedWith);
  return {
    ...prev,
    lastSeen: a.at,
    encounters: prev.encounters + 1,
    byFacet: { ...prev.byFacet, [a.facet]: { correct: f.correct + +a.correct, incorrect: f.incorrect + +!a.correct, lastResult: a.correct } },
    rtSamples: a.rtMs ? [...prev.rtSamples, a.rtMs].slice(-10) : prev.rtSamples,
    contexts: a.context && !prev.contexts.includes(a.context) ? [...prev.contexts, a.context].slice(-20) : prev.contexts,
    // Most recent last; counts carried over.
    mistakes: !a.correct && a.given
      ? [...prev.mistakes.filter((x) => x !== mistake), { given: a.given, count: (mistake?.count ?? 0) + 1, last: a.at }]
      : prev.mistakes,
    confusions: a.confusedWith
      ? [...prev.confusions.filter((x) => x !== confusion), { itemId: a.confusedWith, count: (confusion?.count ?? 0) + 1 }]
      : prev.confusions,
  };
}

export const median = (xs: number[]): number | undefined => {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

// ───────────── Skill abilities (Elo on the content-difficulty scale) ─────────────
export const pCorrect = (theta: number, difficulty: number): number => 1 / (1 + Math.exp(-1.7 * (theta - difficulty)));

export function updateAbility(a: SkillAbility, difficulty: number, correct: boolean, now: number): SkillAbility {
  const k = Math.max(0.08, 0.5 / (1 + a.n / 20)); // fast early, steady later
  return { ...a, theta: a.theta + k * (+correct - pCorrect(a.theta, difficulty)), n: a.n + 1, updatedAt: now };
}

const BANDS: [number, string][] = [[0.5, 'Starting'], [2, 'Beginner'], [4, 'Elementary'], [6, 'Pre-intermediate'], [Infinity, 'Intermediate']];
/** Coarse label on purpose; `tentative` until 20 observations so the UI doesn't fake precision. */
export const abilityBand = (a: { theta: number; n: number }) => ({
  label: BANDS.find(([max]) => a.theta < max)![1],
  tentative: a.n < 20,
});

// ───────────── Progress ─────────────
/** Expected number of items recalled right now: Σ retrievability over one facet (words known, producible…). */
export const expectedKnown = (states: SRSState[], facet: Facet, now: Date): number =>
  states.reduce((sum, s) => (s.facet === facet ? sum + retrievability(s.card, now) : sum), 0);

/** Success rate of reviews made ≥ 1 day after the previous one. `rate` is null below 10 reviews. */
export function trueRetention(reviews: ReviewRecord[], now: number, days = 30): { rate: number | null; n: number } {
  const rs = reviews.filter((r) => r.at >= now - days * DAY && r.elapsed_days >= 1);
  return { rate: rs.length >= 10 ? rs.filter((r) => r.rating > 1).length / rs.length : null, n: rs.length };
}

/** Items introduced in the last 7 days that are still holding (developing or better). */
export const weeklyVelocity = (items: { introducedAt?: number; status: MasteryStatus }[], now: number): number =>
  items.filter((i) => i.introducedAt && i.introducedAt >= now - 7 * DAY && ['developing', 'strong', 'mastered'].includes(i.status)).length;

/** Consecutive local days with a session, counting from today (or yesterday if today isn't done yet). */
export function streak(sessionTimes: number[], now: number): number {
  const days = new Set(sessionTimes.map((t) => new Date(t).toDateString()));
  const d = new Date(now);
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1);
  let n = 0;
  for (; days.has(d.toDateString()); d.setDate(d.getDate() - 1)) n++;
  return n;
}
