// Turns a queue slot into a concrete exercise, picking the format from the current recall
// probability (planner.chooseFormat), and grades the learner's response with grade.ts.

import { characters, dialogues, grammar, pinyinText, sentences, sentenceWords, soundPairs, stories, surface, targetFor, tonePairWords, toneSets, units, wordById, words } from './curriculum';
import { classifyError, gradeChinese, gradeEnglish, type ChineseTarget, type GradeResult, type Verdict } from './grade';
import { masteryStatus } from './learner';
import { formatWord, markSyllable, parseNumbered, surfaceTones, type Syllable } from './pinyin';
import type { ExpectedSpeech, ToneAnalysis } from './pitch';
import { chooseFormat } from './planner';
import { segment, splitTokenised } from './segment';
import { facetsOf, isIntroduced, ITEMS, PRIMARY, type LearnerState, type Slot } from './session';
import { createEmptyCard, retrievability, type Card } from './srs';
import type { Facet, Sentence, VocabularyItem } from './types';

export interface Choice {
  label: string;
  sub?: string;
  itemId?: string;
  tones?: number[];
}
export interface Example {
  zh: string;
  pinyin: string;
  en: string;
}

export interface Exercise {
  slot: Slot;
  itemId: string;
  facet?: Facet;
  /** 'intro' for introductions, otherwise a planner format id. */
  format: string;
  instruction: string;
  prompt?: string; // English prompt
  emoji?: string;
  zh?: string; // Chinese on screen; ＿＿ marks a blank
  pinyin?: string;
  showPinyin: boolean;
  highlight?: string;
  audio?: string; // what the speaker button says
  autoplay?: boolean;
  hideZh?: boolean; // listening: hidden until answered
  choices?: Choice[];
  answer?: number;
  tiles?: string[];
  order?: string[];
  accepted?: string[]; // English answers
  targets?: ChineseTarget[]; // Chinese answers
  pinyinOnly?: boolean;
  reveal: Example; // the full answer, shown after answering
  filled?: Example; // a blanked sentence, completed (shown after answering)
  intro?: { heading: string; lines: string[]; examples: Example[]; audioFirst?: boolean };
  context?: string; // sentence id
  /** "I'm confused" (breakdown + notes) and "Why am I learning this?" without needing AI. */
  help: { why: string; breakdown: Example[]; notes: string[] };
  /** Answer by speaking. `selfCheck`: pitch analysis can't tell which word was said, so the learner judges that. */
  speak?: { expected: ExpectedSpeech; selfCheck?: boolean };
  /** Listening dialogue, played line by line in alternating voices; transcript shown after answering. */
  dialogue?: (Example & { speaker: 'A' | 'B' })[];
  /** Content difficulty for practice activities (ability scale). */
  level?: number;
  /** Voice index for listening items, so learners hear more than one speaker. */
  voice?: number;
}

export interface MakeOptions {
  now: Date;
  audio: boolean;
  mic: boolean;
  scaffold: number;
  rng?: () => number;
  /** Force a format (tests, benchmarks): the slot's facet is then used even if it isn't active. */
  format?: string;
  /** Meta-learning policy: chance of an audio-first introduction, per-format difficulty calibration. */
  audioFirst?: number;
  kScale?: Record<string, number>;
}

const AUDIO_FORMATS = new Set(['audio_to_meaning_mc', 'audio_to_meaning_typed', 'dictation', 'minimal_pair', 'tone_id']);
const TONE_SHAPE = ['light and short', 'high and level', 'rising', 'low and dipping', 'sharply falling'];
const TONE_TIPS = ['', 'Hold it high and flat, like singing a note: mā.', 'Rise, like a surprised "huh?": má.', 'Go low, and dip back up only when it ends a phrase: mǎ.', 'Drop sharply, like a firm "No!": mà.'];
const FREQ = ['', 'one of the most common words in Mandarin', 'a very common word', 'a common word', 'a useful word', 'a less common word'];
const TONES_WHY = 'Tones change meaning: mā (mom), má (hemp), mǎ (horse), mà (scold). Hearing them reliably comes before saying them, and habits set in the first weeks last.';

const shuffle = <T,>(xs: T[], rng: () => number): T[] => xs.map((x) => [rng(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x);
const wordPinyin = (w: VocabularyItem) => formatWord(parseNumbered(w.pinyin));
const wordExample = (w: VocabularyItem): Example => ({ zh: w.hanzi, pinyin: wordPinyin(w), en: w.meanings[0] });
const sentenceExample = (x: Sentence): Example => ({ zh: surface(x.zh), pinyin: pinyinText(x.zh), en: x.en[0] });
const breakdown = (zh: string): Example[] =>
  splitTokenised(zh).filter((t) => t.kind === 'han').map((t) => wordExample(wordById.get(`w:${t.ref}`)!));
const readable = (s: LearnerState, x: Sentence, except?: string) =>
  sentenceWords(x).every((id) => id === except || isIntroduced(s, id) || wordById.get(id)?.incidental);
/** What the pitch analysis should expect for a target: citation tones and the tones actually said. */
export const speechTarget = (t: ChineseTarget): ExpectedSpeech => ({
  syllables: t.pinyin.map((x) => ({ base: x.base, tone: x.tone ?? 0 })),
  surface: t.surface ?? t.pinyin.map((x) => x.tone ?? 0),
});
const grammarNotes = (x: Sentence) => x.grammar.map((id) => grammar.find((g) => g.id === id)!).map((g) => `${g.title}: ${g.explanation}`);

/** Sentence with one token blanked, and its pinyin with the same blank. */
function blank(zh: string, ref: string) {
  const refs = splitTokenised(zh).map((t) => t.ref!);
  const i = refs.indexOf(ref);
  const blanked = refs.map((r, k) => (k === i ? '＿＿' : r)).join(' '); // ＿ is punctuation, so it passes through
  return { zh: surface(blanked), pinyin: pinyinText(blanked) };
}

/** Three plausible wrong answers: words the learner knows first, same part of speech first. */
function wordChoices(s: LearnerState, w: VocabularyItem, label: (x: VocabularyItem) => Choice, rng: () => number) {
  const avoid = new Set(w.meanings.map((m) => m.toLowerCase()));
  const pool = words.filter((x) => x.id !== w.id && !x.incidental && x.hanzi !== w.hanzi && !avoid.has(x.meanings[0].toLowerCase()));
  const posFirst = (xs: VocabularyItem[]) => [...xs.filter((x) => x.pos === w.pos), ...xs.filter((x) => x.pos !== w.pos)];
  const known = shuffle(pool.filter((x) => isIntroduced(s, x.id)), rng);
  const near = shuffle(pool.filter((x) => !known.includes(x) && x.unit <= w.unit + 1), rng);
  const options = shuffle([w, ...[...posFirst(known), ...posFirst(near)].slice(0, 3)], rng);
  return { choices: options.map(label), answer: options.indexOf(w) };
}

/** Pinyin renderings with other tones; drops any that would *sound* identical after sandhi. */
function toneChoices(hanzi: string, syl: Syllable[], count: number, rng: () => number) {
  const chars = Array.from(hanzi);
  const right = syl.map((x) => x.tone ?? 0);
  const sounds = (tones: number[]) => surfaceTones(chars.map((h, i) => ({ hanzi: h, tone: tones[i] }))).join();
  const variants = right.reduce<number[][]>((acc, t) => acc.flatMap((v) => (t === 0 ? [[...v, 0]] : [1, 2, 3, 4].map((n) => [...v, n]))), [[]]);
  const wrong = shuffle(variants.filter((v) => sounds(v) !== sounds(right)), rng).slice(0, count - 1);
  const options = shuffle([right, ...wrong], rng);
  return {
    choices: options.map((tones) => ({ label: formatWord(syl.map((x, i) => ({ base: x.base, tone: tones[i] }))), tones })),
    answer: options.indexOf(right),
  };
}

export function makeExercise(s: LearnerState, slot: Slot, opts: MakeOptions): Exercise | null {
  const rng = opts.rng ?? Math.random;

  // ── Practice (not spaced-repetition reviews) ──
  if (slot.practice === 'dialogue') {
    const d = dialogues.find((x) => x.id === slot.ref);
    if (!d || !opts.audio) return null;
    const q = d.questions[Math.floor(rng() * d.questions.length)];
    const options = shuffle(q.options, rng);
    const words = [...new Map(d.lines.flatMap((l) => breakdown(l.zh)).map((b) => [b.zh, b])).values()];
    return {
      slot, itemId: d.id, format: 'dialogue', instruction: `Listen: ${d.title}`, prompt: q.q, showPinyin: false, level: 0.4 * d.unit,
      dialogue: d.lines.map((l) => ({ speaker: l.speaker, zh: surface(l.zh), pinyin: pinyinText(l.zh), en: l.en })),
      choices: options.map((label) => ({ label })), answer: options.indexOf(q.options[q.answer]),
      reveal: { zh: '', pinyin: '', en: q.options[q.answer] },
      help: { why: 'Following a real back-and-forth, at speed, is most of what conversation is.', breakdown: words, notes: [] },
    };
  }
  if (slot.practice === 'story') {
    // Rendered by the reader (every word tappable, questions at the end); this only carries the slot.
    const st = stories.find((x) => x.id === slot.ref);
    return st ? {
      slot, itemId: st.id, format: 'story', instruction: `Read: ${st.title}`, showPinyin: false, level: 0.4 * st.unit,
      reveal: { zh: st.titleZh, pinyin: '', en: st.title },
      help: { why: 'Stories made almost entirely of words you know turn vocabulary into understanding.', breakdown: [], notes: [] },
    } : null;
  }
  if (slot.practice === 'shadow') {
    const x = sentences.find((y) => y.id === slot.ref);
    if (!x || !opts.mic) return null;
    return {
      slot, itemId: slot.itemId, format: 'shadow', instruction: 'Listen, then say it the same way', zh: surface(x.zh), pinyin: pinyinText(x.zh), showPinyin: true,
      audio: surface(x.zh), autoplay: opts.audio, speak: { expected: speechTarget(targetFor(x.zh)) }, level: 0.4 * x.unit, reveal: sentenceExample(x),
      help: { why: 'Copying whole sentences trains rhythm and the tone changes that single words cannot.', breakdown: breakdown(x.zh), notes: grammarNotes(x) },
    };
  }

  const item = ITEMS.get(slot.itemId);
  if (!item) return null;
  const active = facetsOf(s, item.id);
  const kind = item.kind;
  const base = { slot, itemId: item.id, showPinyin: showPinyin(s, slot.itemId, opts.now) };

  // ── Introductions ──
  if (slot.intro) {
    const make = (heading: string, lines: (string | undefined)[], examples: Example[], why: string, extra: Partial<Exercise> = {}): Exercise => ({
      ...base, format: 'intro', instruction: 'New', intro: { heading, lines: lines.filter((l): l is string => !!l), examples },
      reveal: examples[0] ?? { zh: heading, pinyin: '', en: '' }, help: { why, breakdown: [], notes: [] }, audio: examples[0]?.zh, ...extra,
    });
    if (kind === 'word') {
      const w = wordById.get(item.id)!;
      const unknown = (x: Sentence) => sentenceWords(x).filter((id) => id !== w.id && !isIntroduced(s, id) && !wordById.get(id)?.incidental).length;
      const [first, ...more] = sentences.filter((x) => x.unit <= w.unit && sentenceWords(x).includes(w.id)).sort((a, b) => unknown(a) - unknown(b) || a.zh.length - b.zh.length);
      const ex = make(w.hanzi, [`${wordPinyin(w)}: ${w.meanings.slice(0, 3).join('; ')}`, w.note], [first, ...more.slice(0, 1)].map(sentenceExample), whyWord(w), {
        emoji: w.emoji, highlight: w.hanzi, zh: surface(first.zh), context: first.id,
        help: { why: whyWord(w), breakdown: breakdown(first.zh), notes: [w.note, ...grammarNotes(first)].filter((n): n is string => !!n) },
      });
      ex.intro!.audioFirst = opts.audio && rng() < (opts.audioFirst ?? 0.5); // randomised for meta-learning (LEARNING_ENGINE §11)
      return ex;
    }
    if (kind === 'grammar') {
      const g = grammar.find((x) => x.id === item.id)!;
      const examples = sentences.filter((x) => x.grammar.includes(g.id)).sort((a, b) => +readable(s, b) - +readable(s, a)).slice(0, 3);
      return make(g.title, [g.pattern, g.explanation], examples.map(sentenceExample), g.why, { help: { why: g.why, breakdown: breakdown(examples[0].zh), notes: [g.why] } });
    }
    if (kind === 'char') {
      const c = characters.find((x) => x.id === item.id)!;
      const inWords = words.filter((w) => !w.incidental && w.hanzi.includes(c.char)).sort((a, b) => +isIntroduced(s, b.id) - +isIntroduced(s, a.id));
      return make(c.char, [`${formatWord(parseNumbered(c.pinyin))}: ${c.meaning}`, c.components, c.mnemonic], inWords.slice(0, 4).map(wordExample), whyChar(c.char, inWords));
    }
    if (kind === 'tone') {
      const n = Number(item.id.slice(2));
      return make(`${['', '1st', '2nd', '3rd', '4th'][n]} tone: ${TONE_SHAPE[n]}`, [TONE_TIPS[n]],
        toneSets.slice(0, 3).map((t) => ({ zh: t.chars[n - 1], pinyin: markSyllable(t.base, n), en: '' })), TONES_WHY);
    }
    if (kind === 'tonepair') {
      const [a, b] = item.id.slice(3).split('-').map(Number);
      const examples = (tonePairWords().get(`${a}-${b}`) ?? []).sort((x, y) => +isIntroduced(s, y.id) - +isIntroduced(s, x.id)).slice(0, 3);
      return make(`Tone pair ${a}–${b}`, [`${TONE_SHAPE[a]}, then ${TONE_SHAPE[b]}.`, a === 3 && b === 3 ? 'Two 3rd tones: the first one rises, so 你好 is said ní hǎo.' : undefined],
        examples.map(wordExample), TONES_WHY);
    }
    const p = soundPairs.find((x) => x.id === item.id)!;
    return make(p.label, [p.tip], p.pair.map((x) => ({ zh: x.char, pinyin: formatWord(parseNumbered(x.pinyin)), en: '' })),
      `English speakers often merge ${p.label}, but in Mandarin they make different words.`);
  }

  // ── Tests ──
  const isActive = (f?: Facet) => !!f && (f === 'produce' ? opts.mic : active.some((x) => x.facet === f)); // speaking needs the mic, now
  const facet = opts.format && slot.facet ? slot.facet : isActive(slot.facet) ? slot.facet! : isActive(PRIMARY[kind]) ? PRIMARY[kind] : undefined;
  if (!facet) return null;
  const card = active.find((x) => x.facet === facet)?.card ?? createEmptyCard<Card>(opts.now);
  const w = kind === 'word' ? wordById.get(item.id)! : undefined;
  const allowed = (id: string) =>
    (opts.mic || (!id.endsWith('_spoken') && id !== 'tone_production')) && (opts.audio || !AUDIO_FORMATS.has(id)) && !(w?.pos === 'part' && id.endsWith('meaning_typed')) && !(kind === 'sound' && id === 'tone_id');
  // Right after any review FSRS predicts ~100 % recall, even after a miss. While a facet is still being
  // learned (never succeeded, or just failed), use the most supportive format instead.
  const learning = card.stability < 1 || s.mastery.get(item.id)?.byFacet[facet]?.lastResult === false;
  const format = opts.format ?? chooseFormat(facet, learning ? 0 : retrievability(card, opts.now), opts.scaffold, opts.kScale, allowed);
  if (AUDIO_FORMATS.has(format) && !opts.audio) return null;
  const t = { ...base, facet, format, voice: facet === 'listening' ? Math.floor(rng() * 4) : undefined };

  if (w) {
    const key = w.id.slice(2);
    const help = { why: whyWord(w), breakdown: [wordExample(w)], notes: w.note ? [w.note] : [] };
    const reveal = { zh: w.hanzi, pinyin: wordPinyin(w), en: w.meanings.slice(0, 3).join('; ') };
    const gloss = (x: VocabularyItem): Choice => ({ label: x.meanings[0], sub: x.emoji, itemId: x.id });
    const chinese = (x: VocabularyItem): Choice => ({ label: x.hanzi, sub: wordPinyin(x), itemId: x.id });
    const ctx = shuffle(sentences.filter((x) => sentenceWords(x).includes(w.id) && readable(s, x, w.id)), rng)[0];
    const prompt = ctx ? ctx.en[0] : w.meanings[0];
    const blanked = ctx ? blank(ctx.zh, key) : undefined;
    const withContext = { prompt, emoji: w.emoji, zh: blanked?.zh, pinyin: blanked?.pinyin, context: ctx?.id, filled: ctx && sentenceExample(ctx) };
    if (ctx) help.breakdown = breakdown(ctx.zh);
    switch (format) {
      case 'hanzi_to_meaning_mc':
        return { ...t, instruction: 'What does this mean?', zh: w.hanzi, pinyin: wordPinyin(w), audio: w.hanzi, ...wordChoices(s, w, gloss, rng), reveal, help };
      case 'hanzi_to_meaning_typed':
        return { ...t, instruction: 'What does this mean? (in English)', zh: w.hanzi, pinyin: wordPinyin(w), audio: w.hanzi, accepted: w.meanings, reveal, help };
      case 'audio_to_meaning_mc':
        return { ...t, instruction: 'Listen. What does it mean?', zh: w.hanzi, pinyin: wordPinyin(w), audio: w.hanzi, autoplay: true, hideZh: true, ...wordChoices(s, w, gloss, rng), reveal, help };
      case 'audio_to_meaning_typed':
        return { ...t, instruction: 'Listen. What does it mean? (in English)', zh: w.hanzi, pinyin: wordPinyin(w), audio: w.hanzi, autoplay: true, hideZh: true, accepted: w.meanings, reveal, help };
      case 'dictation':
        return { ...t, instruction: 'Type what you hear (pinyin or characters)', zh: w.hanzi, audio: w.hanzi, autoplay: true, hideZh: true, showPinyin: false, targets: [targetFor(key)], reveal, help };
      case 'meaning_to_chinese_bank':
        return { ...t, instruction: ctx ? 'Choose the missing word' : 'Choose the Chinese', ...withContext, ...wordChoices(s, w, chinese, rng), reveal, help };
      case 'meaning_to_chinese_typed':
        return { ...t, instruction: ctx ? 'Type the missing word (pinyin or characters)' : 'Say it in Chinese (pinyin or characters)', ...withContext, targets: [targetFor(key)], reveal, help };
      case 'meaning_to_chinese_spoken':
        return { ...t, instruction: ctx ? 'Say the missing word' : 'Say it in Chinese', ...withContext, audio: w.hanzi, speak: { expected: speechTarget(targetFor(key)), selfCheck: true }, reveal, help };
      case 'hanzi_to_pinyin':
        return { ...t, instruction: 'Type the pinyin with tones (e.g. ni3 hao3)', zh: w.hanzi, showPinyin: false, pinyinOnly: true, targets: [targetFor(key)], reveal, help };
    }
    return null;
  }

  if (kind === 'char') {
    const c = characters.find((x) => x.id === item.id)!;
    const inWords = words.filter((x) => !x.incidental && x.hanzi.includes(c.char));
    const reveal = { zh: c.char, pinyin: formatWord(parseNumbered(c.pinyin)), en: c.meaning };
    const help = { why: whyChar(c.char, inWords), breakdown: inWords.filter((x) => isIntroduced(s, x.id)).slice(0, 4).map(wordExample), notes: [c.components, c.mnemonic].filter((n): n is string => !!n) };
    if (format === 'char_typed') {
      return { ...t, instruction: "Type this character's pinyin", zh: c.char, showPinyin: false, pinyinOnly: true, targets: [{ hanzi: c.char, tokens: [c.char], pinyin: parseNumbered(c.pinyin) }], reveal, help };
    }
    const options = shuffle([c, ...shuffle(characters.filter((x) => x.id !== c.id && x.meaning !== c.meaning), rng).slice(0, 3)], rng);
    return { ...t, instruction: 'What does this character mean?', zh: c.char, choices: options.map((x) => ({ label: x.meaning, itemId: x.id })), answer: options.indexOf(c), reveal, help };
  }

  if (kind === 'grammar') {
    const g = grammar.find((x) => x.id === item.id)!;
    const examples = sentences.filter((x) => x.grammar.includes(g.id));
    const sent = shuffle(examples.filter((x) => readable(s, x)), rng)[0] ?? examples[0];
    const toks = splitTokenised(sent.zh).filter((x) => x.kind === 'han');
    const reveal = sentenceExample(sent);
    const help = { why: g.why, breakdown: breakdown(sent.zh), notes: [`${g.pattern}: ${g.explanation}`] };
    const common = { prompt: sent.en[0], context: sent.id, reveal, help, filled: reveal };
    if (format === 'sentence_build' && toks.length > 1) {
      const order = toks.map((x) => x.text);
      let tiles = shuffle(order, rng);
      if (tiles.join() === order.join()) tiles = [...order].reverse();
      return { ...t, instruction: 'Put the words in order', tiles, order, ...common };
    }
    if (format === 'translate_to_chinese') {
      return { ...t, instruction: 'Say this in Chinese (pinyin or characters)', targets: [targetFor(sent.zh)], ...common };
    }
    // ponytail: the blanked word is the longest non-pronoun token the pattern mentions; tag key words in
    // the grammar table if this picks badly.
    const inPattern = toks.filter((x) => g.pattern.includes(x.text) || g.title.includes(x.text))
      .sort((a, b) => +(wordById.get(`w:${a.ref}`)?.pos === 'pron') - +(wordById.get(`w:${b.ref}`)?.pos === 'pron') || b.text.length - a.text.length);
    const key = inPattern[0] ?? toks[toks.length - 1];
    const blanked = blank(sent.zh, key.ref!);
    if (format === 'cloze_typed') {
      return { ...t, instruction: 'Fill in the blank (pinyin or characters)', zh: blanked.zh, pinyin: blanked.pinyin, targets: [targetFor(key.ref!)], ...common };
    }
    const right = wordById.get(`w:${key.ref}`)!;
    const FUNCTION = new Set(['part', 'adv', 'q', 'prep', 'conj', 'mw', 'v']);
    const distractors = shuffle(words.filter((x) => x.id !== right.id && FUNCTION.has(x.pos) && x.pos === right.pos && isIntroduced(s, x.id)), rng)
      .concat(shuffle(words.filter((x) => x.id !== right.id && FUNCTION.has(x.pos) && x.unit <= g.unit), rng))
      .filter((x, i, xs) => xs.indexOf(x) === i)
      .slice(0, 3);
    const options = shuffle([right, ...distractors], rng);
    return { ...t, instruction: 'Fill in the blank', zh: blanked.zh, pinyin: blanked.pinyin, choices: options.map((x) => ({ label: x.hanzi, sub: wordPinyin(x), itemId: x.id })), answer: options.indexOf(right), ...common };
  }

  // Pronunciation (production): hear it, say it, get per-syllable tone feedback.
  if (format === 'tone_production') {
    let reveal: Example;
    let expected: ExpectedSpeech;
    if (kind === 'tone') {
      const n = Number(item.id.slice(2));
      const set = toneSets[Math.floor(rng() * toneSets.length)];
      reveal = { zh: set.chars[n - 1], pinyin: markSyllable(set.base, n), en: '' };
      expected = { syllables: [{ base: set.base, tone: n }], surface: [n] };
    } else {
      const pairWords = tonePairWords().get(item.id.slice(3)) ?? [];
      const x = shuffle(pairWords.filter((y) => isIntroduced(s, y.id)), rng)[0] ?? shuffle(pairWords, rng)[0];
      reveal = wordExample(x);
      expected = speechTarget(targetFor(x.id.slice(2)));
    }
    return {
      ...t, instruction: 'Listen, then say it', zh: reveal.zh, pinyin: reveal.pinyin, showPinyin: true, audio: reveal.zh, autoplay: opts.audio,
      speak: { expected }, reveal, help: { why: TONES_WHY, breakdown: [], notes: [] },
    };
  }

  // Pronunciation (perception): hear it, pick what you heard.
  const count = format === 'tone_id' ? 4 : 2;
  const help = { why: TONES_WHY, breakdown: [] as Example[], notes: [] as string[] };
  if (kind === 'tone') {
    const n = Number(item.id.slice(2));
    const set = toneSets[Math.floor(rng() * toneSets.length)];
    const others = shuffle([1, 2, 3, 4].filter((x) => x !== n), rng).slice(0, count - 1);
    const tones = count === 4 ? [1, 2, 3, 4] : shuffle([n, ...others], rng);
    help.notes = [TONE_TIPS[n]];
    return {
      ...t, instruction: 'Which tone did you hear?', zh: set.chars[n - 1], audio: set.chars[n - 1], autoplay: true, hideZh: true, showPinyin: false,
      choices: tones.map((x) => ({ label: markSyllable(set.base, x), sub: `${['', '1st', '2nd', '3rd', '4th'][x]} tone`, tones: [x] })), answer: tones.indexOf(n),
      reveal: { zh: set.chars[n - 1], pinyin: markSyllable(set.base, n), en: '' }, help,
    };
  }
  if (kind === 'tonepair') {
    const pairWords = tonePairWords().get(item.id.slice(3)) ?? [];
    const x = shuffle(pairWords.filter((y) => isIntroduced(s, y.id)), rng)[0] ?? shuffle(pairWords, rng)[0];
    const { choices, answer } = toneChoices(x.hanzi, parseNumbered(x.pinyin), count, rng);
    return { ...t, instruction: 'Which tones did you hear?', zh: x.hanzi, audio: x.hanzi, autoplay: true, hideZh: true, showPinyin: false, choices, answer, reveal: wordExample(x), help };
  }
  const p = soundPairs.find((y) => y.id === item.id)!;
  const target = p.pair[Math.floor(rng() * 2)];
  help.notes = [p.tip];
  return {
    ...t, format: 'minimal_pair', instruction: 'Which did you hear?', zh: target.char, audio: target.char, autoplay: true, hideZh: true, showPinyin: false,
    choices: p.pair.map((y) => ({ label: formatWord(parseNumbered(y.pinyin)) })), answer: p.pair.indexOf(target),
    reveal: { zh: target.char, pinyin: formatWord(parseNumbered(target.pinyin)), en: '' }, help,
  };
}


function showPinyin(s: LearnerState, itemId: string, now: Date): boolean {
  const mode = s.profile.pinyinMode;
  if (mode === 'always') return true;
  if (mode !== 'new') return false;
  const item = ITEMS.get(itemId);
  return !item || !['strong', 'mastered'].includes(masteryStatus(item.kind, facetsOf(s, itemId), now));
}

function whyWord(w: VocabularyItem): string {
  const unit = units[w.unit - 1];
  return `${w.hanzi} is ${FREQ[w.freq]}.${w.topics.length ? ` Useful for: ${w.topics.join(', ')}.` : ''} Unit ${unit.n} goal: ${unit.goal}`;
}
const whyChar = (char: string, inWords: VocabularyItem[]) =>
  `${char} appears in ${inWords.length} word${inWords.length === 1 ? '' : 's'} you're learning (${inWords.map((w) => w.hanzi).join(', ')}). Recognising it makes all of them easier to read.`;

// ───────────── Grading ─────────────
export type Response = { choice: number } | { text: string } | { order: string[] } | { speech: ToneAnalysis; self?: 'good' | 'close' | 'off' };

const lexSegment = (text: string) => segment(text, (w) => wordById.has(`w:${w}`)).map((t) => t.text);

export function gradeExercise(ex: Exercise, r: Response): GradeResult {
  if ('choice' in r) {
    if (r.choice === ex.answer) return { verdict: 'correct', notes: [] };
    const picked = ex.choices![r.choice];
    const right = ex.choices![ex.answer!];
    const notes = [`Answer: ${right.label}`];
    if (picked.tones && right.tones) {
      const i = right.tones.findIndex((x, k) => x !== picked.tones![k]);
      return { verdict: 'wrong', notes, category: 'tone', toneSwaps: [`${right.tones[i]}>${picked.tones[i]}`], expected: right.label, given: picked.label };
    }
    const heard = ex.facet === 'listening' || ex.format === 'minimal_pair';
    return { verdict: 'wrong', notes, category: heard ? 'listening_confusion' : 'similar_word', confusedWith: picked.itemId, expected: right.label, given: picked.label };
  }
  if ('speech' in r) return gradeSpeech(r.speech, r.self);
  if ('order' in r) {
    return r.order.join('') === ex.order!.join('')
      ? { verdict: 'correct', notes: [] }
      : { verdict: 'wrong', notes: [`Answer: ${ex.order!.join('')}`], ...classifyError(ex.order!, r.order) };
  }
  if (ex.accepted) return gradeEnglish(r.text, ex.accepted);
  if (ex.pinyinOnly && /\p{Script=Han}/u.test(r.text)) {
    return { verdict: 'wrong', notes: ['Type the pinyin (e.g. ni3 hao3), not the characters.'], category: 'other' };
  }
  return gradeChinese(r.text, ex.targets!, lexSegment);
}

/**
 * Spoken answers: the pitch analysis judges tones; when it can't hear clearly it says "unsure" and the
 * learner self-assesses. For spoken recall the learner also judges whether it was the right word.
 */
export function gradeSpeech(a: ToneAnalysis, self?: 'good' | 'close' | 'off'): GradeResult {
  const swaps = a.syllables.filter((x) => x.detected !== null && x.detected !== x.expected).map((x) => `${x.expected}>${x.detected}`);
  const heard: Verdict = !a.ok || a.toneScore === null || a.confidence < 0.15 ? 'unsure' : a.toneScore === 1 ? 'correct' : a.toneScore >= 0.5 ? 'close' : 'wrong';
  const verdict: Verdict = !self ? heard : self === 'off' ? 'wrong' : self === 'close' || heard === 'close' || heard === 'wrong' ? 'close' : 'correct';
  return { verdict, notes: a.feedback, ...(swaps.length && verdict !== 'correct' ? { category: 'tone' as const, toneSwaps: swaps } : {}) };
}

/** The text to log as "expected" for an exercise. */
export const expectedOf = (ex: Exercise) => ex.order?.join('') || ex.reveal.zh || ex.reveal.en || ex.accepted?.[0] || '';
