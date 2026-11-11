// AI features on the learner model: the conversation tutor, explanations, and graded stories. Prompts
// carry what the learner knows; replies are parsed defensively and checked on the device against
// that knowledge; corrections become error-bank records. Nothing the model writes becomes curriculum.

import { chat, type ChatMessage, type ChatRequest, type Provider } from './ai';
import { grammar, joinPinyin, wordById, words } from './curriculum';
import { db } from './db';
import type { Exercise } from './exercise';
import { classifyError, errorPatterns, patternKey, type GradeResult } from './grade';
import { masteryStatus } from './learner';
import { formatWord, parseNumbered } from './pinyin';
import { segment, type Token } from './segment';
import { coverageTarget, facetsOf, isIntroduced, ITEMS, knowsWord, storyCoverage, type LearnerState } from './session';
import type { CorrectionItem, ErrorCategory, ErrorRecord, GeneratedContent, Mission, Question, Story, TutorMode, UserProfile, ValidationReport } from './types';

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
  /** 1–5: how much of the conversation should be Chinese (Settings). */
  immersion?: number;
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
    immersion: s.profile.immersion,
  };
}

/** Levels 1–2 change only what the app shows; from 3 the tutor itself uses less English. */
const IMMERSION_RULES = [
  '', '', '',
  'Explain things in simple Chinese; use English only if they are clearly stuck.',
  'Use Chinese only, even for explanations, unless they write to you in English.',
  'Use Chinese only, always. If they write English, answer in simple Chinese.',
];

export function systemPrompt(ctx: TutorContext, mode: TutorMode, scenario: string): string {
  const m = MODES[mode];
  return [
    `You are 李老师, a friendly, patient Mandarin conversation partner for ${ctx.name}, an English speaker learning Mandarin from the beginning.`,
    'Be concise and direct. Encourage without flattering: never praise by default. When something is wrong, say so plainly. Distinguish "understandable" from "natural".',
    `Use ONLY words from this list, plus names and numbers: ${ctx.known.join(' ') || '你好 谢谢 再见'}. At most ${m.newWords} new word(s) per message; list each one in "newWords" with its English meaning.`,
    `Grammar they know: ${ctx.grammar.join('; ') || 'very basic sentences'}.`,
    ctx.weak.length ? `They are working on: ${ctx.weak.join('; ')}. Create natural chances to practise these.` : '',
    `Mode: ${m.label}. ${m.rules}`,
    IMMERSION_RULES[ctx.immersion ?? 1],
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
/** Arbitrary Chinese (AI text) as tokens, lexicon words carrying their ref. */
export const tokensOf = (text: string) => segment(text, inLexicon);

/** Which Chinese words in a reply the learner hasn't been taught (names and numbers are fine). */
export function unknownWords(s: LearnerState, text: string): { unknown: string[]; coverage: number } {
  const han = segment(text, inLexicon).filter((t) => t.kind === 'han');
  const known = (w: string) => isIntroduced(s, `w:${w}`) || (inLexicon(w) && !ITEMS.has(`w:${w}`));
  const unknown = [...new Set(han.filter((t) => !known(t.text)).map((t) => t.text))];
  return { unknown, coverage: han.length ? han.filter((t) => known(t.text)).length / han.length : 1 };
}

/** Pinyin per token: the validated lexicon for course words (neutral tones included), pinyin-pro, loaded only when needed, for the rest. */
export async function tokenPinyin(tokens: Token[]): Promise<string[]> {
  const lexical = (t: Token) => !!t.ref && inLexicon(t.ref);
  const lib = tokens.some((t) => t.kind === 'han' && !lexical(t)) ? await import('pinyin-pro') : undefined;
  return tokens.map((t) =>
    t.kind !== 'han' ? t.text
    : lexical(t) ? formatWord(parseNumbered(wordById.get(`w:${t.ref}`)!.pinyin))
    : lib!.pinyin(t.text, { type: 'array' }).join(''));
}

/** Pinyin for AI text is computed here, never taken from the model. */
export const pinyinOf = async (text: string): Promise<string> => joinPinyin(await tokenPinyin(segment(text, inLexicon).filter((t) => t.kind !== 'space')));

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

// ───────────── Graded stories (LEARNING_ENGINE §10) ─────────────
export const STORY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'titleZh', 'paragraphs', 'questions', 'newWords'],
  properties: {
    title: { type: 'string' },
    titleZh: { type: 'string' },
    paragraphs: {
      type: 'array',
      items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['zh', 'en'], properties: { zh: { type: 'string' }, en: { type: 'string' } } } },
    },
    questions: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['q', 'options', 'answer'], properties: { q: { type: 'string' }, options: { type: 'array', items: { type: 'string' } }, answer: { type: 'integer' } } },
    },
    newWords: REPLY_SCHEMA.properties.newWords,
  },
} as const;

export interface StoryBrief {
  known: string[]; // the ≤ 400 most stable known words
  practise: string[]; // known but least stable: worth meeting again
  topic: string;
  sentences: number;
  target: number; // known-word coverage to hit
}

export function storyBrief(s: LearnerState, topic: string, now = new Date()): StoryBrief {
  const stability = (id: string) => s.srs.get(`${id}|meaning`)?.card.stability ?? 0;
  const known = words.filter((w) => !w.incidental && knowsWord(s, w.id, now)).sort((a, b) => stability(b.id) - stability(a.id));
  return {
    known: known.slice(0, 400).map((w) => w.hanzi),
    practise: known.slice(-6).map((w) => w.hanzi),
    topic,
    sentences: known.length < 60 ? 6 : known.length < 150 ? 9 : 12,
    target: coverageTarget(s),
  };
}

export function storyRequest(b: StoryBrief): ChatRequest {
  const allowed = Math.max(1, Math.round(b.sentences * 6 * (1 - b.target)));
  return {
    purpose: 'story',
    system: [
      'You write short graded reading stories for an adult English speaker learning Mandarin (Simplified characters, Mainland usage).',
      `Use ONLY these words, plus numbers and the names 小明 and 李华: ${b.known.join(' ')}.`,
      `At most ${allowed} words not on that list in the whole story; list each in "newWords" with its English meaning.`,
      `Use some of these words they are still learning: ${b.practise.join(' ')}.`,
      `Topic: ${b.topic}. About ${b.sentences} short sentences in 2–3 paragraphs: a small story with a point, natural and concrete, not a word list.`,
      'Translate each sentence into natural English. Add 3 comprehension questions in English, each with 3 short options and the index of the right one.',
      'Reply with JSON only: {"title": "English title", "titleZh": "Chinese title", "paragraphs": [[{"zh": "...", "en": "..."}]], "questions": [{"q": "...", "options": ["...", "...", "..."], "answer": 0}], "newWords": [{"word": "...", "meaning": "..."}]}.',
    ].join('\n'),
    messages: [{ role: 'user', content: 'Write the story.' }],
    schema: STORY_SCHEMA,
  };
}

export interface AiStory {
  title: string;
  titleZh: string;
  paragraphs: { zh: string; en: string }[][];
  questions: Question[];
  newWords: { word: string; meaning: string }[];
}

const list = (x: unknown): Record<string, unknown>[] => (Array.isArray(x) ? x : []);

/** Tolerant parse; null when there is no Chinese story in it. Malformed questions are dropped. */
export function parseStory(text: string): AiStory | null {
  try {
    const raw = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as Record<string, unknown>;
    const paragraphs = list(raw.paragraphs)
      .map((p) => list(p).flatMap((l) => (/\p{Script=Han}/u.test(str(l?.zh)) ? [{ zh: str(l.zh), en: str(l.en) }] : [])))
      .filter((p) => p.length);
    if (!paragraphs.length) return null;
    return {
      title: str(raw.title) || 'A story',
      titleZh: str(raw.titleZh),
      paragraphs,
      questions: list(raw.questions).flatMap((q) => {
        const options = (Array.isArray(q?.options) ? q.options : []).map(str).filter(Boolean);
        const answer = Number(q?.answer);
        return str(q?.q) && options.length >= 2 && Number.isInteger(answer) && options[answer] ? [{ q: str(q.q), options, answer }] : [];
      }),
      newWords: list(raw.newWords).flatMap((w) => (str(w?.word) ? [{ word: str(w.word), meaning: str(w.meaning) }] : [])),
    };
  } catch {
    return null;
  }
}

/** An AI story as a readable Story: segmented on the device, labelled with the latest unit its course words come from. */
export function aiStory(p: AiStory, g: Partial<Pick<GeneratedContent, 'id' | 'topic' | 'validation'>>): Story {
  const paragraphs = p.paragraphs.map((para) => para.map((l) => ({ tokens: segment(l.zh, inLexicon), en: l.en })));
  const units = paragraphs.flat().flatMap((l) => l.tokens).flatMap((t) => (t.ref ? [wordById.get(`w:${t.ref}`)!.unit] : []));
  return {
    id: `ai:${g.id ?? 0}`, title: p.title, titleZh: p.titleZh, unit: Math.max(1, ...units), topics: g.topic ? [g.topic] : [],
    paragraphs, questions: p.questions,
    ai: g.validation && { glosses: Object.fromEntries(p.newWords.map((w) => [w.word, w.meaning])), validation: g.validation },
  };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Coverage and sanity checks; a story passes within 5 points of the coverage target. */
export function checkStory(s: LearnerState, p: AiStory, target: number, now = new Date()): ValidationReport {
  const cov = storyCoverage(s, aiStory(p, {}), now);
  const passed = cov.coverage >= target - 0.05;
  const issues = [
    !passed && `${pct(cov.coverage)} of the words are ones you know (aim: ${pct(target)}).`,
    p.questions.length < 2 && 'Too few usable comprehension questions.',
    p.paragraphs.flat().some((l) => !l.en) && 'Some sentences have no translation.',
  ].filter((x): x is string => !!x);
  return { coverage: cov.coverage, unknown: cov.unknown, issues, passed, attempts: 1 };
}

/** Write a story at the learner's level: one rewrite if it misses the target, then stored with its report. */
export async function generateStory(s: LearnerState, topic: string, signal?: AbortSignal): Promise<Story> {
  const brief = storyBrief(s, topic);
  const req = storyRequest(brief);
  const first = await ask(s.profile, req, signal);
  let story = parseStory(first);
  let report = story && checkStory(s, story, brief.target);
  let attempts = 1;
  if (!report?.passed) {
    attempts = 2;
    const nudge = report ? `[App: too many words they don't know: ${report.unknown.join(', ')}. Rewrite it with the allowed words. Same JSON format.]` : '[App: that was not the required JSON. Try again.]';
    const retry = parseStory(await ask(s.profile, { ...req, messages: [...req.messages, { role: 'assistant', content: first }, { role: 'user', content: nudge }] }, signal));
    const retryReport = retry && checkStory(s, retry, brief.target);
    if (retry && retryReport && (!report || retryReport.coverage >= report.coverage)) [story, report] = [retry, retryReport];
  }
  if (!story || !report) throw new Error("Couldn't read the story the AI wrote. Try again.");
  const g = { kind: 'story' as const, createdAt: Date.now(), provider: s.profile.ai.provider, topic, payload: story, validation: { ...report, attempts } };
  return aiStory(story, { ...g, id: await db.generated.add(g) });
}

// ───────────── Missions ─────────────
/** Which checks the learner's messages meet: plain substring matches on the device, no AI judgement. */
export const missionChecks = (m: Mission, said: string[]) => m.checks.map((c) => said.some((t) => c.any.some((x) => t.includes(x))));

export const missionSetup = (m: Mission, scenario: string) =>
  `${scenario} The learner's mission: ${m.brief} Give them natural chances to do it, but never do it for them.`;
