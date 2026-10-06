// Content validation (LEARNING_ENGINE.md §9): curated Mandarin must pass these before it can be taught.
import { pinyin, polyphonic } from 'pinyin-pro';
import { describe, expect, it } from 'vitest';
import { characters, dialogues, grammar, sentences, sentenceWords, soundPairs, tonePairWords, toneSets, units, wordById, words } from './curriculum';
import { parseNumbered } from './pinyin';
import { splitTokenised } from './segment';

const split = (p: string) => {
  const m = /^([a-zü]+)([0-5])$/.exec(p.replace(/v/g, 'ü'));
  return m ? { base: m[1], tone: Number(m[2]) } : null;
};
const readings = (char: string) => (polyphonic(char, { toneType: 'num', type: 'array' })[0] as string[]).map(split);
/** Is base+tone one of the character's dictionary readings? Neutral (0) only needs the base to match. */
const isReading = (char: string, base: string, tone: number) =>
  (char === '儿' && base === 'r') || readings(char).some((r) => r && r.base === base && (tone === 0 || r.tone === tone));

/**
 * Places where our citation pinyin differs from pinyin-pro's in-context reading, each checked by hand.
 * The test fails if a new difference appears or a listed one disappears, so this list can't rot.
 */
const REVIEWED: string[] = [];

describe('lexicon', () => {
  it('has unique ids and exactly one valid syllable per character', () => {
    expect(new Set(words.map((w) => w.id)).size).toBe(words.length);
    for (const w of words) expect(parseNumbered(w.pinyin).length, w.hanzi).toBe(Array.from(w.hanzi).length);
  });

  it('gives every character a reading it really has (pinyin-pro polyphone data)', () => {
    const bad = words.flatMap((w) => {
      const syls = parseNumbered(w.pinyin);
      return Array.from(w.hanzi)
        .filter((ch, i) => !isReading(ch, syls[i].base, syls[i].tone ?? 0))
        .map((ch) => `${w.hanzi}: ${ch} is not ${w.pinyin}`);
    });
    expect(bad).toEqual([]);
  });

  it('agrees with pinyin-pro in context, apart from hand-reviewed differences', () => {
    const diffs = words.flatMap((w) => {
      const theirs = pinyin(w.hanzi, { toneType: 'num', type: 'array', toneSandhi: false }) as string[];
      const differs = parseNumbered(w.pinyin).some((s, i) => {
        if (s.tone === 0 || s.base === 'r') return false; // neutral tones: pinyin-pro often gives the full tone
        const t = split(theirs[i] ?? '');
        return !t || t.base !== s.base || t.tone !== s.tone;
      });
      return differs ? [`${w.hanzi} ${w.pinyin} / pinyin-pro ${theirs.join(' ')}`] : [];
    });
    expect(diffs).toEqual(REVIEWED);
  });

  it('has a gloss, part of speech and frequency band for every word', () => {
    for (const w of words) {
      expect(w.meanings.every((m) => m.trim().length > 0), w.hanzi).toBe(true);
      expect(w.pos, w.hanzi).toBeTruthy();
      expect([1, 2, 3, 4, 5], w.hanzi).toContain(w.freq);
    }
  });
});

describe('sentences', () => {
  it('only use words the learner has already been taught', () => {
    const problems = sentences.flatMap((s) =>
      splitTokenised(s.zh)
        .filter((t) => t.kind === 'han')
        .flatMap((t) => {
          const w = wordById.get(`w:${t.ref}`);
          if (!w) return [`${s.zh}: "${t.ref}" is not in the lexicon`];
          return w.unit > s.unit ? [`${s.zh} (unit ${s.unit}) uses ${t.ref} from unit ${w.unit}`] : [];
        }),
    );
    expect(problems).toEqual([]);
  });

  it('are unique, translated, and tagged with grammar already taught', () => {
    expect(new Set(sentences.map((s) => s.id)).size).toBe(sentences.length);
    const grammarById = new Map(grammar.map((g) => [g.id, g]));
    for (const s of sentences) {
      expect(s.en.every(Boolean), s.zh).toBe(true);
      for (const g of s.grammar) {
        expect(grammarById.get(g), `${s.zh} → ${g}`).toBeDefined();
        expect(grammarById.get(g)!.unit, `${s.zh} → ${g}`).toBeLessThanOrEqual(s.unit);
      }
    }
  });

  it('give every word an example sentence in its own unit (new words are taught in context)', () => {
    const missing = words
      .filter((w) => !w.incidental && !sentences.some((s) => s.unit === w.unit && sentenceWords(s).includes(w.id)))
      .map((w) => `${w.hanzi} (unit ${w.unit})`);
    expect(missing).toEqual([]);
  });
});

describe('grammar and units', () => {
  it('every grammar point has an example, units run 1..N with words and grammar', () => {
    expect(new Set(grammar.map((g) => g.id)).size).toBe(grammar.length);
    for (const g of grammar) expect(sentences.some((s) => s.grammar.includes(g.id)), g.id).toBe(true);
    expect(units.map((u) => u.n)).toEqual(units.map((_, i) => i + 1));
    for (const u of units) {
      expect(words.some((w) => w.unit === u.n), `unit ${u.n} words`).toBe(true);
      expect(grammar.some((g) => g.unit === u.n), `unit ${u.n} grammar`).toBe(true);
    }
    expect(units.filter((u) => u.milestone)).toHaveLength(1);
  });
});

describe('characters and pronunciation drills', () => {
  it('characters are real readings and appear in words being taught', () => {
    expect(new Set(characters.map((c) => c.id)).size).toBe(characters.length);
    for (const c of characters) {
      const [s] = parseNumbered(c.pinyin);
      expect(isReading(c.char, s.base, s.tone ?? 0), `${c.char} ${c.pinyin}`).toBe(true);
      expect(words.some((w) => w.hanzi.includes(c.char)), c.char).toBe(true);
    }
  });

  it('tone sets carry the tone they claim', () => {
    for (const { base, chars } of toneSets) {
      chars.forEach((ch, i) => expect(isReading(ch, base, i + 1), `${ch} = ${base}${i + 1}`).toBe(true));
    }
  });

  it('sound pairs are real readings that differ', () => {
    for (const { id, pair } of soundPairs) {
      for (const { char, pinyin: p } of pair) {
        const [s] = parseNumbered(p);
        expect(isReading(char, s.base, s.tone ?? 0), `${id}: ${char} ${p}`).toBe(true);
      }
      expect(pair[0].pinyin, id).not.toBe(pair[1].pinyin);
    }
  });

  it('every tone pair (1-1 … 4-0) has example words', () => {
    const pairs = tonePairWords();
    const missing = [1, 2, 3, 4].flatMap((a) => [1, 2, 3, 4, 0].map((b) => `${a}-${b}`)).filter((k) => !pairs.get(k)?.length);
    expect(missing).toEqual([]);
  });
});

describe('dialogues', () => {
  it('only use words taught by their unit, and each has lines, translations and questions', () => {
    expect(dialogues.length).toBeGreaterThanOrEqual(8);
    expect(new Set(dialogues.map((d) => d.id)).size).toBe(dialogues.length);
    const problems = dialogues.flatMap((d) =>
      d.lines.flatMap((l) =>
        splitTokenised(l.zh).filter((t) => t.kind === 'han').flatMap((t) => {
          const w = wordById.get(`w:${t.ref}`);
          if (!w) return [`${d.id}: "${t.ref}" is not in the lexicon`];
          return w.unit > d.unit ? [`${d.id} (unit ${d.unit}) uses ${t.ref} from unit ${w.unit}`] : [];
        }),
      ),
    );
    expect(problems).toEqual([]);
    for (const d of dialogues) {
      expect(d.lines.length, d.id).toBeGreaterThanOrEqual(4);
      expect(d.lines.every((l) => (l.speaker === 'A' || l.speaker === 'B') && l.en), d.id).toBe(true);
      expect(d.questions.length, d.id).toBeGreaterThan(0);
      for (const q of d.questions) expect(new Set(q.options).size, `${d.id}: ${q.q}`).toBe(3);
    }
  });
});
