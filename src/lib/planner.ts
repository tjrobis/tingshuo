// Session planning and in-session difficulty (LEARNING_ENGINE.md §7). Pure, deterministic, explained.

import type { Facet, FocusBoost, PlanBlock, Skill } from './types';

const REVIEW_SEC = 12;
const NEW_SEC = 50; // intro in a sentence + immediate retrieval + spaced re-tests

export interface PlanInput {
  minutes: number;
  now: number;
  daysActive: number;
  dueCount: number;
  /** First-review success of items introduced in the last 3 days; null = no data yet. */
  retentionHealth: number | null;
  abilities: Partial<Record<Skill, { theta: number; n: number }>>;
  toneAccuracy: number | null;
  /** A Chinese speech voice exists; without one, tone and listening practice can't run. */
  audio: boolean;
  micAvailable: boolean;
  knownWords: number;
  /** A text exists at the learner's target coverage. */
  inputAvailable: boolean;
  recurringPatterns: number;
  /** An open tone-pair confusion pattern (e.g. 2~3). */
  toneConfusion: boolean;
  focus: FocusBoost[];
  newItemCap: number;
  newAvailable: number;
  /** Batch-size experiment: −1, 0 or +1 new words today. */
  explore?: number;
}

export interface SessionPlan {
  blocks: PlanBlock[];
  newItems: number;
  reviews: number;
  /** One-sentence "today's highest priority" for the home screen. */
  priority: string;
  rationale: string[];
}

export function planSession(p: PlanInput): SessionPlan {
  const T = p.minutes;
  const theta = (s: Skill) => p.abilities[s]?.theta ?? 0;
  const boost = (key: string) =>
    p.focus.filter((f) => f.key === key && f.until > p.now).reduce((m, f) => m * f.factor, 1);
  const lags = (s: Skill) => (p.abilities[s]?.n ?? 0) >= 10 && theta(s) < theta('vocab') - 0.5;
  const rationale: string[] = [];

  // 1. Due reviews first, capped so a backlog can't eat the whole session.
  const reviewMin = Math.min((p.dueCount * REVIEW_SEC) / 60, 0.6 * T);
  const reviews = Math.floor((reviewMin * 60) / REVIEW_SEC);
  const backlog = (p.dueCount * REVIEW_SEC) / 60 > 3 * T;

  // 2. Time for everything else, weighted toward weaknesses.
  const early = p.daysActive < 14;
  const weakTones = p.toneAccuracy !== null && p.toneAccuracy < 0.7;
  const weights: [PlanBlock['kind'], number, string][] = [
    ['warmup', p.audio ? ((early || weakTones ? 0.25 : 0.1) + (p.toneConfusion ? 0.1 : 0)) * boost('tones') : 0,
      weakTones ? `Tone accuracy is ${pct(p.toneAccuracy!)}, so tones get extra time.`
      : early ? 'First two weeks: tones get extra time so bad habits never form.'
      : 'Tone and pronunciation warm-up.'],
    ['listening', p.audio ? (lags('listening') ? 0.25 : 0.15) * boost('listening') : 0,
      lags('listening') ? 'Listening lags your vocabulary, so it gets extra time.' : 'Listening practice with words you know.'],
    ['speaking', p.micAvailable ? (lags('speaking') ? 0.25 : 0.15) * boost('speaking') : 0,
      lags('speaking') ? 'Speaking lags your vocabulary, so it gets extra time.' : 'Speaking: say it, hear it back, fix it.'],
    ['input', p.inputAvailable && p.knownWords >= 30 ? 0.1 * boost('reading') : 0, 'You know enough words for a short story at your level.'],
    ['errors', p.recurringPatterns ? 0.1 : 0, `${p.recurringPatterns} mistake pattern(s) keep coming back; targeted drills.`],
  ];

  // 3. New items, gated by whether recent ones are sticking. If nothing else can use the time
  //    (no audio, no mic, no stories yet), new items may take it, still within the cap.
  let mult = 1;
  if (p.retentionHealth !== null && p.retentionHealth < 0.6) {
    mult = 0;
    rationale.push(`No new words today: only ${pct(p.retentionHealth)} of recently learned words were remembered at first review.`);
  } else if (p.retentionHealth !== null && p.retentionHealth < 0.75) {
    mult = 0.5;
    rationale.push(`Fewer new words: ${pct(p.retentionHealth)} of recent words were remembered, so they get reinforced first.`);
  }
  if (backlog) mult *= 0.5;
  const budget = weights.some(([, w]) => w > 0) ? Math.round((T / 4) * mult) : Math.floor(p.newItemCap * mult);
  const planned = Math.max(0, Math.min(p.newAvailable, p.newItemCap, budget, Math.floor(((T - reviewMin) * 60) / NEW_SEC)));
  const newItems = planned ? Math.max(0, Math.min(p.newAvailable, p.newItemCap, planned + (p.explore ?? 0))) : 0;
  const newMin = (newItems * NEW_SEC) / 60;

  const rest = Math.max(0, T - reviewMin - newMin);
  // Blocks under half a minute aren't worth switching to; their time goes to the rest.
  const all = weights.reduce((s, [, w]) => s + w, 0);
  const kept = all ? weights.filter(([, w]) => (rest * w) / all >= 0.5) : [];
  const survivors = kept.length ? kept : [...weights].sort((a, b) => b[1] - a[1]).slice(0, 1);
  const total = survivors.reduce((s, [, w]) => s + w, 0);

  const blocks: PlanBlock[] = [];
  if (reviews) {
    blocks.push({ kind: 'review', minutes: round(reviewMin), reason: `${reviews} item(s) are due: reviewing just before you'd forget is the cheapest retention there is.${p.dueCount > reviews ? ` ${p.dueCount - reviews} more wait for the next session.` : ''}` });
  }
  if (newItems) blocks.push({ kind: 'new', minutes: round(newMin), reason: `${newItems} new item(s), introduced in sentences and re-tested within the session.` });
  for (const [kind, w, reason] of survivors) {
    if (w && rest >= 0.05) blocks.push({ kind, minutes: round((rest * w) / total), reason });
  }

  const priority =
    p.retentionHealth !== null && p.retentionHealth < 0.6 ? "Recent words aren't sticking yet, so today reinforces them instead of adding more."
    : backlog ? 'Reviews have piled up; today clears the most at-risk ones first.'
    : p.audio && (weakTones || early) ? 'Tones first: getting them right now prevents months of bad habits.'
    : p.audio && lags('listening') ? 'Your vocabulary is ahead of your listening, so today emphasises listening.'
    : lags('speaking') ? 'You understand more than you can say, so today emphasises speaking.'
    : p.recurringPatterns ? 'A few mistakes keep coming back; today targets them.'
    : p.dueCount ? `Steady progress: ${reviews} review(s), then ${newItems} new item(s) in context.`
    : `${newItems} new item(s) today, each taught in a sentence and practised until it sticks.`;

  return { blocks, newItems, reviews, priority, rationale: [...rationale, ...blocks.map((b) => b.reason)] };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const round = (x: number) => Math.round(x * 10) / 10;

// ───────────── Exercise format choice ─────────────
/** Formats per facet, easiest → hardest. k: predicted success = R^k (k < 1 is easier than free recall). */
export const FORMATS: Record<Facet, { id: string; k: number }[]> = {
  meaning: [{ id: 'hanzi_to_meaning_mc', k: 0.45 }, { id: 'hanzi_to_meaning_typed', k: 0.9 }],
  listening: [{ id: 'audio_to_meaning_mc', k: 0.55 }, { id: 'audio_to_meaning_typed', k: 1 }, { id: 'dictation', k: 1.2 }],
  recall: [{ id: 'meaning_to_chinese_bank', k: 0.7 }, { id: 'meaning_to_chinese_typed', k: 1 }, { id: 'meaning_to_chinese_spoken', k: 1.15 }],
  reading: [{ id: 'hanzi_to_pinyin', k: 1 }],
  char: [{ id: 'char_mc', k: 0.5 }, { id: 'char_typed', k: 1 }],
  grammar: [{ id: 'cloze_mc', k: 0.6 }, { id: 'cloze_typed', k: 0.9 }],
  grammarProd: [{ id: 'sentence_build', k: 0.8 }, { id: 'translate_to_chinese', k: 1.3 }],
  perceive: [{ id: 'minimal_pair', k: 0.5 }, { id: 'tone_id', k: 0.6 }],
  produce: [{ id: 'tone_production', k: 1.1 }],
};

/**
 * Hardest format whose predicted success clears the target band. Scaffold +1/+2 raises the bar
 * (easier formats), −1/−2 lowers it (harder). `kScale` = per-learner calibration from meta-learning.
 */
export function chooseFormat(
  facet: Facet,
  R: number,
  scaffold = 0,
  kScale: Record<string, number> = {},
  allowed: (id: string) => boolean = () => true,
): string {
  const ladder = FORMATS[facet].filter((f) => allowed(f.id));
  const target = 0.75 + 0.05 * scaffold;
  let pick = ladder[0] ?? FORMATS[facet][0];
  for (const f of ladder) if (R ** (f.k * (kScale[f.id] ?? 1)) >= target) pick = f;
  return pick.id;
}

/** Rolling success over the last 8 answers moves the scaffold level (−2 hardest … +2 easiest). */
export function adaptScaffold(recent: boolean[], current: number): number {
  const window = recent.slice(-8);
  if (window.length < 6) return current;
  const rate = window.filter(Boolean).length / window.length;
  if (rate > 0.92) return Math.max(-2, current - 1);
  if (rate < 0.65) return Math.min(2, current + 1);
  return current;
}
