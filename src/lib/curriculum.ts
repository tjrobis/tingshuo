// Parses the curated tables in src/data/curriculum.ts into typed, indexed content.

import { CHARACTERS, GRAMMAR, LEXICON, SENTENCES, SOUND_PAIRS, TONE_SETS, UNITS } from '../data/curriculum';
import { parseNumbered } from './pinyin';
import { splitTokenised } from './segment';
import type { CharacterInfo, GrammarConcept, Sentence, Unit, VocabularyItem } from './types';

/** Pipe-table rows, each tagged with the unit of the latest `# N` header. */
function rows(table: string): { unit: number; cols: string[] }[] {
  let unit = 0;
  const out: { unit: number; cols: string[] }[] = [];
  for (const raw of table.split('\n')) {
    const line = raw.trim();
    const header = /^# (\d+)$/.exec(line);
    if (header) unit = Number(header[1]);
    else if (line && !line.startsWith('//')) out.push({ unit, cols: line.split('|').map((c) => c.trim()) });
  }
  return out;
}

export const words: VocabularyItem[] = rows(LEXICON).map(({ unit, cols: [key, pinyin, meanings, pos, freq, topics, emoji, note] }) => ({
  id: `w:${key}`,
  hanzi: key.split('#')[0],
  pinyin,
  meanings: meanings.split(';'),
  pos,
  unit,
  freq: Number(freq) as VocabularyItem['freq'],
  topics: topics ? topics.split(',') : [],
  emoji: emoji || undefined,
  note: note || undefined,
  incidental: pos === 'name' || undefined,
}));

export const wordById = new Map(words.map((w) => [w.id, w]));

/** "我 叫 小明 。" → "我叫小明。" */
export const surface = (zh: string): string => splitTokenised(zh).map((t) => t.text).join('');

export const sentences: Sentence[] = rows(SENTENCES).map(({ unit, cols: [zh, en, grammar] }) => ({
  id: `s:${surface(zh)}`,
  zh,
  en: en.split(' / '),
  unit,
  grammar: grammar ? grammar.split(',') : [],
}));

/** Lexicon ids of a sentence's Chinese words, in order. */
export const sentenceWords = (s: Sentence): string[] =>
  splitTokenised(s.zh).filter((t) => t.kind === 'han').map((t) => `w:${t.ref}`);

export const grammar: GrammarConcept[] = rows(GRAMMAR).map(({ unit, cols: [id, title, pattern, explanation, why] }) => ({
  id, title, pattern, explanation, why, unit,
}));

export const units: Unit[] = rows(UNITS).map(({ cols: [n, title, titleZh, goal, milestone] }) => ({
  n: Number(n), title, titleZh, goal, milestone: milestone || undefined,
}));

export const characters: CharacterInfo[] = rows(CHARACTERS).map(({ cols: [char, pinyin, meaning, components, mnemonic] }) => ({
  id: `c:${char}`, char, pinyin, meaning, components: components || undefined, mnemonic: mnemonic || undefined,
}));

/** One character per tone (index 0 = 1st tone) on the same syllable, for tone perception. */
export const toneSets = rows(TONE_SETS).map(({ cols: [base, ...chars] }) => ({ base, chars }));

/** Minimal pairs for sounds English speakers merge (zh/j, u/ü, -n/-ng…). */
export const soundPairs = rows(SOUND_PAIRS).map(({ cols: [id, label, ...pair] }) => ({
  id: `s:${id}`,
  label,
  pair: pair.map((p) => {
    const [char, pinyin] = p.split(' ');
    return { char, pinyin };
  }),
}));

/** Two-syllable words grouped by citation tones ("3-0" → 我们, 姐姐…), for tone-pair drills. */
export function tonePairWords(): Map<string, VocabularyItem[]> {
  const pairs = new Map<string, VocabularyItem[]>();
  for (const w of words) {
    const s = parseNumbered(w.pinyin);
    if (w.incidental || s.length !== 2 || s[1].base === 'r') continue; // 哪儿 is one syllable, nǎr
    const key = `${s[0].tone}-${s[1].tone}`;
    pairs.set(key, [...(pairs.get(key) ?? []), w]);
  }
  return pairs;
}
