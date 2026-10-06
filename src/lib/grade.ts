// Answer evaluation and the error model (LEARNING_ENGINE.md §8). Deterministic: no LLM.

import { comparePinyin, parsePinyin, type Syllable } from './pinyin';
import type { ErrorCategory, ErrorPattern, ErrorRecord } from './types';

export type Verdict = 'correct' | 'close' | 'wrong' | 'unsure';

export interface GradeResult {
  verdict: Verdict;
  notes: string[];
  category?: ErrorCategory;
  /** For substitutions: what was expected and what the learner used instead. */
  expected?: string;
  given?: string;
  /** Tone errors as "expected>given", e.g. "3>2". */
  toneSwaps?: string[];
  /** Item the learner picked instead (multiple choice), for confusion tracking. */
  confusedWith?: string;
}

// ───────────── English answers ─────────────
const norm = (s: string) =>
  s.toLowerCase()
    .replace(/\([^)]*\)/g, ' ') // "be (am/is/are)" → "be"
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(to|a|an|the) /, '');

export function editDistance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + +(a[i - 1] !== b[j - 1]));
    row = next;
  }
  return row[b.length];
}

/**
 * Words: exact, or a typo (Hard). Sentences: exact match against accepted translations, otherwise
 * "unsure" — the learner (or an AI provider, if configured) judges against the model answer,
 * because string similarity can't tell "I like coffee" from "I don't like coffee".
 */
export function gradeEnglish(given: string, accepted: string[]): GradeResult {
  const g = norm(given);
  if (!g) return { verdict: 'wrong', notes: [`Answer: ${accepted[0]}`], category: 'vocab_forgotten' };
  const options = accepted.map(norm);
  if (options.includes(g)) return { verdict: 'correct', notes: [] };
  // ponytail: typo = edit distance 1 (2 for 8+ letters) with the same first letter; still lets "rice"
  // pass for "race" — fine for glosses, swap for a synonym list if false accepts show up.
  const typo = options.find((a) => a.length >= 4 && a[0] === g[0] && editDistance(a, g) <= (a.length >= 8 ? 2 : 1));
  if (typo) return { verdict: 'close', notes: [`Accepted as a typo of "${typo}".`] };
  if (options[0].split(' ').length >= 4) return { verdict: 'unsure', notes: [`Model answer: ${accepted[0]}`] };
  return { verdict: 'wrong', notes: [`Answer: ${accepted[0]}`], category: 'vocab_forgotten' };
}

// ───────────── Chinese answers (characters or pinyin) ─────────────
export interface ChineseTarget {
  hanzi: string; // surface, no spaces
  tokens: string[]; // words, for error classification
  pinyin: Syllable[]; // citation syllables
  surface?: number[]; // pronounced tones, so sandhi spellings are accepted
}

const stripPunct = (s: string) => s.replace(/[\s\p{P}]/gu, '');

/** Grade a production answer typed as characters (segmented with `segment`) or as pinyin. */
export function gradeChinese(given: string, targets: ChineseTarget[], segment: (s: string) => string[]): GradeResult {
  const answer = stripPunct(given);
  if (!answer) return { verdict: 'wrong', notes: [`Answer: ${targets[0].hanzi}`], category: 'vocab_forgotten' };

  if (/\p{Script=Han}/u.test(answer)) {
    if (targets.some((t) => stripPunct(t.hanzi) === answer)) return { verdict: 'correct', notes: [] };
    const c = classifyError(targets[0].tokens, segment(answer));
    return { verdict: 'wrong', notes: [`Answer: ${targets[0].hanzi}`], ...c };
  }

  const syllables = parsePinyin(given);
  if (!syllables) return { verdict: 'wrong', notes: ["That isn't readable as pinyin or characters."], category: 'other' };
  const results = targets.map((t) => comparePinyin(t.pinyin, syllables, t.surface));
  const best = results.find((r) => r.correct) ?? results.find((r) => r.segmentsMatch) ?? results[0];
  if (best.correct) return { verdict: 'correct', notes: best.notes };
  if (best.segmentsMatch && !best.toneErrors.length) return { verdict: 'close', notes: best.notes }; // tones missing
  if (best.segmentsMatch) {
    return { verdict: 'wrong', notes: best.notes, category: 'tone', toneSwaps: best.toneErrors.map((e) => `${e.expected}>${e.given}`) };
  }
  const sameSounds = (a: Syllable[]) => a.map((s) => s.base).sort().join();
  const category = sameSounds(targets[0].pinyin) === sameSounds(syllables) ? 'word_order' : 'other';
  return { verdict: 'wrong', notes: [...best.notes, `Answer: ${targets[0].hanzi}`], category };
}

const MEASURE_WORDS = new Set('个杯块本张只位件条瓶碗次岁口双辆');
const PARTICLES = new Set('了吗呢的吧过着啊');

/** Deterministic category for a wrong word sequence. */
export function classifyError(expected: string[], given: string[]): Pick<GradeResult, 'category' | 'expected' | 'given'> {
  if (!given.length) return { category: 'vocab_forgotten' };
  if ([...expected].sort().join() === [...given].sort().join()) return { category: 'word_order' };
  const missing = [...expected];
  const extra: string[] = [];
  for (const g of given) {
    const i = missing.indexOf(g);
    if (i >= 0) missing.splice(i, 1);
    else extra.push(g);
  }
  if ([...missing, ...extra].every((w) => PARTICLES.has(w))) return { category: 'particle' };
  if (missing.length === 1 && extra.length === 1) {
    const [e, g] = [missing[0], extra[0]];
    return { category: MEASURE_WORDS.has(e) && MEASURE_WORDS.has(g) ? 'classifier' : 'similar_word', expected: e, given: g };
  }
  return { category: expected.length > 2 ? 'grammar' : 'vocab_forgotten' };
}

// ───────────── Error patterns ─────────────
const DAY = 86_400_000;

/** Errors sharing a key are the same weakness: one item, one confused pair, or one tone pair (either direction). */
export function patternKey(e: Pick<ErrorRecord, 'category' | 'itemId' | 'confusedWith' | 'toneSwaps'>): string {
  if (e.category === 'tone' && e.toneSwaps?.length) return `tone:${e.toneSwaps[0].split('>').sort().join('~')}`;
  if (e.confusedWith) return `${e.category}:${[e.itemId ?? '', e.confusedWith].sort().join('|')}`;
  return `${e.category}:${e.itemId ?? 'general'}`;
}

const label = (key: string): string => {
  const [category, rest] = key.split(/:(.*)/s);
  const items = rest.split('|').map((x) => x.replace(/^\w+:/, ''));
  if (/^\d~\d$/.test(rest)) return `Confusing tones ${rest.replace('~', ' and ')}`;
  if (items.length === 2) return `Mixing up ${items[0]} and ${items[1]}`;
  return `${category.replace('_', ' ')}: ${items[0]}`;
};

/**
 * Derive patterns from the error log (no separate table). Recurring = ≥ 2 in 14 days.
 * Resolved = 3 targeted-drill successes after the last error, on ≥ 2 different days.
 */
export function errorPatterns(errors: ErrorRecord[], drillWins: { key: string; at: number }[], now: number): ErrorPattern[] {
  const groups = new Map<string, ErrorRecord[]>();
  for (const e of errors) groups.set(e.patternKey, [...(groups.get(e.patternKey) ?? []), e]);
  return [...groups].map(([key, es]) => {
    const lastAt = Math.max(...es.map((e) => e.at));
    const wins = drillWins.filter((w) => w.key === key && w.at > lastAt);
    const resolved = wins.length >= 3 && new Set(wins.map((w) => new Date(w.at).toDateString())).size >= 2;
    const recent = es.filter((e) => e.at >= now - 14 * DAY).length;
    return {
      key,
      category: es[0].category,
      itemIds: [...new Set(es.flatMap((e) => [e.itemId, e.confusedWith].filter((x): x is string => !!x)))],
      label: label(key),
      count: es.length,
      firstAt: Math.min(...es.map((e) => e.at)),
      lastAt,
      status: resolved ? 'resolved' : recent >= 2 ? 'recurring' : 'open',
      drillSuccesses: wins.map((w) => ({ at: w.at })),
    };
  });
}

/** Share of the expected Chinese characters a recogniser heard, in order (longest common subsequence). */
export function charOverlap(expected: string, heard: string): number {
  const [a, b] = [Array.from(expected.replace(/[^\p{Script=Han}]/gu, '')), Array.from(heard.replace(/[^\p{Script=Han}]/gu, ''))];
  if (!a.length) return 0;
  let row = new Array(b.length + 1).fill(0);
  for (const x of a) {
    const next = [0];
    for (let j = 1; j <= b.length; j++) next[j] = x === b[j - 1] ? row[j - 1] + 1 : Math.max(row[j], next[j - 1]);
    row = next;
  }
  return row[b.length] / a.length;
}
