// The AI conversation tutor: prompts built from the learner model, replies parsed defensively and
// checked against what the learner actually knows, and corrections turned into error-bank records.

import { chat, type ChatMessage, type ChatRequest, type Provider } from './ai';
import { grammar, joinPinyin, wordById } from './curriculum';
import { db } from './db';
import type { Exercise } from './exercise';
import { classifyError, errorPatterns, patternKey, type GradeResult } from './grade';
import { masteryStatus } from './learner';
import { formatWord, parseNumbered } from './pinyin';
import { segment } from './segment';
import { facetsOf, isIntroduced, ITEMS, type LearnerState } from './session';
import type { CorrectionItem, ErrorCategory, ErrorRecord, TutorMode, UserProfile } from './types';

export const MODES: Record<TutorMode, { label: string; blurb: string; rules: string; newWords: number }> = {
  learning: { label: 'Learning', blurb: 'Corrects important mistakes as you go.', newWords: 1, rules: 'Keep the conversation going; the app shows your corrections right after each learner message.' },
  conversation: { label: 'Conversation', blurb: 'Keeps the flow; corrections at the end.', newWords: 1, rules: 'Prioritise natural flow. Never interrupt to correct; just record corrections (shown at the end).' },
  immersion: { label: 'Immersion', blurb: 'Chinese only unless you ask.', newWords: 1, rules: 'Write only Chinese. Leave "translation" empty unless the learner writes English or asks for help.' },
  roleplay: { label: 'Roleplay', blurb: 'Act out a real situation.', newWords: 1, rules: 'Stay in character for the scenario the whole time; record corrections for the end.' },
  challenge: { label: 'Challenge', blurb: 'Pushes a little past your level.', newWords: 3, rules: 'Stretch them: up to three new words or one slightly harder structure per message, still mostly known words.' },
};

export const SCENARIOS: { id: string; title: string; setup: string }[] = [
  { id: 'meet', title: 'Meeting someone new', setup: 'You meet the learner at a friend\'s party. Get to know each other.' },
  { id: 'hobbies', title: 'Hobbies & gaming', setup: 'You are a new friend who loves games, movies and the outdoors. Chat about what you both like.' },
  { id: 'restaurant', title: 'Restaurant', setup: 'You are a waiter in a small noodle restaurant. Take their order.' },
  { id: 'coffee', title: 'Coffee shop', setup: 'You are a barista. Take their order and make small talk.' },
  { id: 'shopping', title: 'Shopping & bargaining', setup: 'You run a market stall selling clothes. Let them ask prices and bargain.' },
  { id: 'directions', title: 'Asking directions', setup: 'You are a local on the street; they are lost and ask the way.' },
  { id: 'taxi', title: 'Taxi', setup: 'You are a chatty taxi driver taking them to their hotel.' },
  { id: 'hotel', title: 'Hotel check-in', setup: 'You are a hotel receptionist checking them in.' },
  { id: 'airport', title: 'Airport & train station', setup: 'You are staff at a station information desk helping with tickets and times.' },
  { id: 'dating', title: 'A first date', setup: 'You are on a relaxed first date at a café. Be warm and curious about them.' },
  { id: 'friends', title: 'Making plans with a friend', setup: 'You are their Chinese friend. Make weekend plans together.' },
  { id: 'school', title: 'School & studying', setup: 'You are a classmate. Talk about classes, teachers and studying.' },
  { id: 'texting', title: 'Casual texting', setup: 'You are texting with a friend: short, casual messages.' },
  { id: 'living', title: 'Living in China', setup: 'You are a neighbour helping them settle into life in China.' },
  { id: 'interview', title: 'Job interview', setup: 'You are interviewing them for a job at your company. Polite but friendly.' },
  { id: 'emergency', title: 'Getting help', setup: 'They need help (lost, unwell, lost phone). You are a helpful passer-by.' },
];

const CATEGORIES: ErrorCategory[] = ['tone', 'word_order', 'classifier', 'particle', 'similar_word', 'grammar', 'vocab_forgotten', 'other'];

/** Structured-output schema for tutor replies. */
export const REPLY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'translation', 'corrections', 'newWords'],
  properties: {
    reply: { type: 'string' },
    translation: { type: 'string' },
    corrections: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['said', 'better', 'why', 'category', 'severity'],
        properties: { said: { type: 'string' }, better: { type: 'string' }, why: { type: 'string' }, category: { type: 'string', enum: CATEGORIES }, severity: { type: 'integer' } },
      },
    },
    newWords: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['word', 'meaning'], properties: { word: { type: 'string' }, meaning: { type: 'string' } } },
    },
  },
} as const;

export interface TutorContext {
  name: string;
  known: string[]; // hanzi the learner has been taught
  grammar: string[];
  weak: string[];
  goal: string;
}

/** What the tutor is allowed to know about the learner: taught words, grammar, weak spots. */
export function tutorContext(s: LearnerState, now = new Date()): TutorContext {
  const taught = [...s.mastery.values()].filter((m) => m.introducedAt !== undefined && m.itemId.startsWith('w:'));
  const weakWords = taught.filter((m) => masteryStatus('word', facetsOf(s, m.itemId), now) === 'at_risk').map((m) => wordById.get(m.itemId)!.hanzi);
  const patterns = errorPatterns(s.errors, [], +now).filter((p) => p.status === 'recurring').map((p) => p.label);
  const unit = Math.max(1, ...taught.map((m) => wordById.get(m.itemId)!.unit));
  return {
    name: s.profile.name,
    known: taught.map((m) => wordById.get(m.itemId)!.hanzi),
    grammar: grammar.filter((g) => isIntroduced(s, g.id)).map((g) => `${g.title} (${g.pattern})`),
    weak: [...patterns, ...weakWords.slice(0, 8).map((w) => `remembering ${w}`)],
    goal: `Unit ${unit}`,
  };
}

export function systemPrompt(ctx: TutorContext, mode: TutorMode, scenario: string): string {
  const m = MODES[mode];
  return [
    `You are 李老师, a friendly, patient Mandarin conversation partner for ${ctx.name}, an English speaker learning Mandarin from the beginning.`,
    'Be concise and direct. Encourage without flattering: never praise by default. When something is wrong, say so plainly. Distinguish "understandable" from "natural".',
    `Use ONLY words from this list, plus names and numbers: ${ctx.known.join(' ') || '你好 谢谢 再见'}. At most ${m.newWords} new word(s) per message; list each one in "newWords" with its English meaning.`,
    `Grammar they know: ${ctx.grammar.join('; ') || 'very basic sentences'}.`,
    ctx.weak.length ? `They are working on: ${ctx.weak.join('; ')}. Create natural chances to practise these.` : '',
    `Mode: ${m.label}. ${m.rules}`,
    `Scenario: ${scenario}`,
    'Each reply: 1–3 short sentences in Simplified Chinese (Mainland usage), usually ending with a question so they must answer. No pinyin in "reply"; the app adds it.',
    'In "corrections", list only mistakes in their LAST message that matter: changed meaning, unnatural phrasing, repeated mistakes, important grammar. Skip trivia. "said" is their words, "better" the natural version, "why" one short English sentence. severity 3 = blocks understanding, 1 = minor.',
    'Reply with JSON only: {"reply": "...", "translation": "English translation", "corrections": [...], "newWords": [{"word": "...", "meaning": "..."}]}.',
  ].filter(Boolean).join('\n');
}

export interface TutorReply {
  reply: string;
  translation: string;
  corrections: CorrectionItem[];
  newWords: { word: string; meaning: string }[];
}

const str = (x: unknown) => (typeof x === 'string' ? x.trim() : '');

/** Tolerant parse: JSON (fenced or not), else treat Chinese text as the reply. Never throws. */
export function parseReply(text: string): TutorReply {
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    const reply = str(raw.reply);
    if (reply) {
      return {
        reply,
        translation: str(raw.translation),
        corrections: (Array.isArray(raw.corrections) ? raw.corrections : []).flatMap((c: Record<string, unknown>) => {
          const [said, better, why] = [str(c?.said), str(c?.better), str(c?.why)];
          if (!said || !better || said === better) return [];
          const category = CATEGORIES.includes(c.category as ErrorCategory) ? (c.category as ErrorCategory) : 'other';
          const severity = Math.min(3, Math.max(1, Math.round(Number(c.severity) || 2))) as 1 | 2 | 3;
          return [{ said, better, why, category, severity }];
        }),
        newWords: (Array.isArray(raw.newWords) ? raw.newWords : []).flatMap((w: Record<string, unknown>) => (str(w?.word) ? [{ word: str(w.word), meaning: str(w.meaning) }] : [])),
      };
    }
  } catch {
    // fall through
  }
  const plain = text.replace(/```[a-z]*|```/g, '').trim();
  return { reply: /\p{Script=Han}/u.test(plain) ? plain : '', translation: '', corrections: [], newWords: [] };
}

const inLexicon = (w: string) => wordById.has(`w:${w}`);

/** Which Chinese words in a reply the learner hasn't been taught (names and numbers are fine). */
export function unknownWords(s: LearnerState, text: string): { unknown: string[]; coverage: number } {
  const han = segment(text, inLexicon).filter((t) => t.kind === 'han');
  const known = (w: string) => isIntroduced(s, `w:${w}`) || (inLexicon(w) && !ITEMS.has(`w:${w}`));
  const unknown = [...new Set(han.filter((t) => !known(t.text)).map((t) => t.text))];
  return { unknown, coverage: han.length ? han.filter((t) => known(t.text)).length / han.length : 1 };
}

/** Pinyin for AI text is computed here, never taken from the model. Loaded only when needed. */
export async function pinyinOf(text: string): Promise<string> {
  const tokens = segment(text, inLexicon);
  // Known words use the validated lexicon (neutral tones included); pinyin-pro only for the rest.
  const lib = tokens.some((t) => t.kind === 'han' && !inLexicon(t.text)) ? await import('pinyin-pro') : undefined;
  return joinPinyin(tokens.filter((t) => t.kind !== 'space').map((t) =>
    t.kind !== 'han' ? t.text
    : inLexicon(t.text) ? formatWord(parseNumbered(wordById.get(`w:${t.text}`)!.pinyin))
    : lib!.pinyin(t.text, { type: 'array' }).join('')));
}

/** Conversation corrections → error-bank records, tied to lexicon items where the difference is one word. */
export function correctionsToErrors(corrections: CorrectionItem[], at: number): ErrorRecord[] {
  const words = (t: string) => segment(t, inLexicon).filter((x) => x.kind === 'han').map((x) => x.text);
  return corrections.map((c) => {
    const diff = classifyError(words(c.better), words(c.said));
    const item = diff.expected && ITEMS.has(`w:${diff.expected}`) ? `w:${diff.expected}` : undefined;
    const confused = diff.given && ITEMS.has(`w:${diff.given}`) ? `w:${diff.given}` : undefined;
    const e: ErrorRecord = {
      at, category: c.category === 'other' && diff.category ? diff.category : c.category, itemId: item, confusedWith: confused,
      expected: c.better, given: c.said, source: 'conversation', note: c.why, patternKey: '',
    };
    e.patternKey = patternKey(e);
    return e;
  });
}

/** Messages for the API: the hidden opening cue, then turns; tutor turns carry their JSON. */
export function toMessages(turns: { role: 'tutor' | 'learner'; raw: string }[]): ChatMessage[] {
  return [
    { role: 'user', content: '[The learner is ready. Start the conversation in character.]' },
    ...turns.map((t) => ({ role: t.role === 'tutor' ? ('assistant' as const) : ('user' as const), content: t.raw })),
  ];
}

/** "I'm confused" → a different explanation, kept within words the learner knows. */
export function explainRequest(ex: Exercise, ctx: TutorContext, answer?: { given: string; result?: GradeResult }): ChatRequest {
  return {
    purpose: 'explain',
    system: `You are a concise, patient Mandarin teacher. Explain in plain English, under 90 words, a different way than the textbook note. Give one extra example sentence using only these known words where possible: ${ctx.known.join(' ')}. Add a memory hook only if it genuinely helps. Plain text, no markdown headings.`,
    messages: [{
      role: 'user',
      content: [
        `I'm confused by this exercise: ${ex.instruction}.`,
        ex.zh && `Chinese: ${ex.reveal.zh || ex.zh}`,
        ex.reveal.pinyin && `Pinyin: ${ex.reveal.pinyin}`,
        ex.reveal.en && `Meaning: ${ex.reveal.en}`,
        ex.help.notes.length ? `Notes I was shown: ${ex.help.notes.join(' ')}` : '',
        answer?.given && `I answered: ${answer.given}${answer.result ? ` (${answer.result.verdict})` : ''}`,
      ].filter(Boolean).join('\n'),
    }],
  };
}

/** Run a request with the learner's configured provider, logging it (never the key). */
export async function ask(profile: UserProfile, req: ChatRequest, signal?: AbortSignal): Promise<string> {
  const { provider, model, baseUrl } = profile.ai;
  if (provider === 'none') throw new Error('No AI provider is set up. Add one in Settings.');
  const apiKey = (await db.secrets.get(provider))?.apiKey;
  const started = performance.now();
  const log = { at: Date.now(), provider, model, purpose: req.purpose, request: JSON.stringify({ system: req.system.slice(0, 4000), messages: req.messages }).slice(0, 20_000) };
  try {
    const res = await chat(provider as Provider, req, { model, apiKey, baseUrl }, signal);
    void db.aiLog.add({ ...log, response: res.text.slice(0, 20_000), ms: performance.now() - started, ok: true, usage: res.usage as Record<string, number> });
    return res.text;
  } catch (e) {
    void db.aiLog.add({ ...log, response: '', ms: performance.now() - started, ok: false, error: (e as Error).message });
    throw e;
  }
}

/** Ready to use AI: a provider, a model, a key where needed, and the learner's consent. */
export async function aiReady(profile: UserProfile): Promise<boolean> {
  const { provider, model, consent } = profile.ai;
  if (provider === 'none' || !model || !consent) return false;
  return provider === 'openai-compatible' || !!(await db.secrets.get(provider))?.apiKey;
}
