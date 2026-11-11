// Natural-language requests ("too easy", "more listening", "less pinyin") → persistent preferences.
// A deterministic parser does the work; the AI, when set up, only maps odd phrasing onto one of the
// same canonical commands, so every outcome is one this file knows how to apply.

import type { ChatRequest } from './ai';
import type { PinyinMode, UserProfile } from './types';

const DAY = 86_400_000;

/** Interest topics; ids match the lexicon's topic tags. */
export const TOPICS: [string, string][] = [
  ['gaming', 'Gaming'], ['travel', 'Travel'], ['food', 'Food'], ['dating', 'Dating & relationships'], ['people', 'Meeting people'],
  ['school', 'School'], ['outdoors', 'Outdoors'], ['tech', 'Technology'], ['culture', 'Chinese culture'], ['hobbies', 'Hobbies'],
  ['family', 'Family'], ['shopping', 'Shopping'],
];
const TOPIC_WORDS: [RegExp, string][] = [
  [/game|gaming/, 'gaming'], [/travel|trip/, 'travel'], [/food|eat|cook|restaurant/, 'food'], [/dat(e|ing)|love|relationship/, 'dating'],
  [/people|friend|social/, 'people'], [/school|stud|class/, 'school'], [/outdoor|hik|nature|sport/, 'outdoors'], [/tech|computer|phone/, 'tech'],
  [/culture|histor/, 'culture'], [/hobb/, 'hobbies'], [/family|parent|kid/, 'family'], [/shop|buy|market/, 'shopping'],
];

export const IMMERSION_LEVELS = [
  '',
  'English support everywhere.',
  'Translations hidden until you ask for them.',
  'The tutor speaks mostly Chinese; buttons show Chinese and English.',
  'The tutor and buttons use Chinese only; English when you ask.',
  'Chinese only, everywhere it can be.',
];

// Immersion levels 3–5 (Settings) put common button labels in Chinese: 3 shows both, 4–5 Chinese only.
const ZH: Record<string, string> = {
  'Learn now': '开始学习', Talk: '聊天', Read: '阅读', Tones: '声调', Progress: '进度', Continue: '继续', 'Got it': '懂了', Check: '检查',
  Done: '完成', "I'm confused": '我不懂', 'Why this?': '为什么学这个？', 'Start talking': '开始聊天', 'End & review': '结束',
};
let immersion = 1;
export const setImmersion = (level: number) => void (immersion = level);
export const t = (en: string) => (immersion < 3 || !ZH[en] ? en : immersion === 3 ? `${ZH[en]} · ${en}` : ZH[en]);

export type Skill = 'listening' | 'speaking' | 'reading' | 'tones';
export type Command =
  | { kind: 'difficulty'; delta: -1 | 1 } // −1: harder (scaffold down)
  | { kind: 'focus'; skill: Skill }
  | { kind: 'pinyin'; mode?: PinyinMode; delta?: -1 | 1 }
  | { kind: 'speed'; delta: number }
  | { kind: 'immersion'; level?: number; delta?: -1 | 1 }
  | { kind: 'newWords'; delta: number }
  | { kind: 'minutes'; minutes: number }
  | { kind: 'topic'; topic: string };

const SKILLS: [RegExp, Skill][] = [[/listen|hearing|ear/, 'listening'], [/speak|speech|pronunc|talk/, 'speaking'], [/read/, 'reading'], [/tone/, 'tones']];

/** First matching rule wins; a rule may decline (null) and let later ones try. */
const RULES: [RegExp, (m: RegExpMatchArray) => Command | null][] = [
  [/\b(no|never)\b.*pinyin|pinyin\b.*\b(off|never)\b/, () => ({ kind: 'pinyin', mode: 'never' })],
  [/always.*pinyin|pinyin.*\b(on|always)\b/, () => ({ kind: 'pinyin', mode: 'always' })],
  [/pinyin.*(until|unless).*know/, () => ({ kind: 'pinyin', mode: 'new' })],
  [/(less|fewer|hide|stop|too much|don'?t).*pinyin/, () => ({ kind: 'pinyin', delta: -1 })],
  [/(more|show|need).*pinyin/, () => ({ kind: 'pinyin', delta: 1 })],
  [/(fewer|less|too many|too much) new( words)?|overwhelm/, () => ({ kind: 'newWords', delta: -2 })],
  [/more new( words)?|more words|faster pace/, () => ({ kind: 'newWords', delta: 2 })],
  [/chinese only|only chinese|full immersion|no english/, () => ({ kind: 'immersion', level: 5 })],
  [/(more|all) chinese|less english/, () => ({ kind: 'immersion', delta: 1 })],
  [/more english|less chinese|too much chinese|need english/, () => ({ kind: 'immersion', delta: -1 })],
  [/slower|too fast/, () => ({ kind: 'speed', delta: -0.1 })],
  [/faster|too slow|speed (it )?up/, () => ({ kind: 'speed', delta: 0.1 })],
  [/too easy|harder|challenge me|more challeng|bored/, () => ({ kind: 'difficulty', delta: -1 })],
  [/too hard|too difficult|easier|struggl/, () => ({ kind: 'difficulty', delta: 1 })],
  [/(\d+)\s*-?\s*min/, (m) => ((n) => (n >= 5 && n <= 90 ? { kind: 'minutes', minutes: n } : null))(Number(m[1]))],
  [/(more|practi[cs]e|work on|focus on|improve|better at)\s+(?:my\s+)?(\w+)/, (m) => ((sk) => (sk ? { kind: 'focus', skill: sk[1] } : null))(SKILLS.find(([re]) => re.test(m[2])))],
  [/(more|about|into|like|love|interested in)\s+(.+)/, (m) => ((t) => (t ? { kind: 'topic', topic: t[1] } : null))(TOPIC_WORDS.find(([re]) => re.test(m[2])))],
];

export function parseCommand(text: string): Command | null {
  const t = text.toLowerCase().replace(/[’']/g, "'").trim();
  for (const [re, make] of RULES) {
    const m = t.match(re);
    const c = m && make(m);
    if (c) return c;
  }
  return null;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const PINYIN: PinyinMode[] = ['never', 'tap', 'new', 'always'];
const PINYIN_SAID: Record<PinyinMode, string> = {
  never: 'Pinyin is now hidden everywhere.', tap: 'Pinyin now shows only when you tap for it.',
  new: 'Pinyin now shows until you know each word, then fades.', always: 'Pinyin now shows on everything.',
};
const SKILL_SAID: Record<Skill, string> = { listening: 'listening', speaking: 'speaking', reading: 'reading', tones: 'tone practice' };

/** The profile change a command makes, and a sentence saying what changed. */
export function applyCommand(p: UserProfile, c: Command, now: number): { patch: Partial<UserProfile>; message: string } {
  switch (c.kind) {
    case 'difficulty': {
      const scaffoldOffset = clamp(p.scaffoldOffset + c.delta, -2, 2);
      if (scaffoldOffset === p.scaffoldOffset) return { patch: {}, message: `That's already the ${c.delta < 0 ? 'hardest' : 'easiest'} setting.` };
      return {
        patch: { scaffoldOffset },
        message: c.delta < 0 ? 'Harder from now on: tougher exercise types come sooner, with less support.' : 'Easier from now on: more support, and gentler exercise types first.',
      };
    }
    case 'focus':
      return {
        patch: { focus: [...p.focus.filter((f) => !(f.kind === 'skill' && f.key === c.skill)), { kind: 'skill', key: c.skill, factor: 1.5, until: now + 7 * DAY }] },
        message: `More ${SKILL_SAID[c.skill]} in your sessions for the next 7 days.`,
      };
    case 'pinyin': {
      const pinyinMode = c.mode ?? PINYIN[clamp(PINYIN.indexOf(p.pinyinMode) + c.delta!, 0, 3)];
      return { patch: { pinyinMode }, message: PINYIN_SAID[pinyinMode] };
    }
    case 'speed': {
      const ttsRate = Math.round(clamp(p.ttsRate + c.delta, 0.6, 1.2) * 10) / 10;
      return { patch: { ttsRate }, message: `Audio now plays at ${ttsRate}×.` };
    }
    case 'immersion': {
      const immersion = clamp(c.level ?? p.immersion + c.delta!, 1, 5) as UserProfile['immersion'];
      return { patch: { immersion }, message: `Immersion level ${immersion}: ${IMMERSION_LEVELS[immersion]}` };
    }
    case 'newWords': {
      const newItemCap = clamp((p.newItemCap ?? 8) + c.delta, 2, 12);
      return { patch: { newItemCap }, message: `Up to ${newItemCap} new words per session from now on.` };
    }
    case 'minutes':
      return { patch: { sessionMinutes: c.minutes }, message: `Sessions are now ${c.minutes} minutes long.` };
    case 'topic': {
      const label = TOPICS.find(([id]) => id === c.topic)?.[1] ?? c.topic;
      const has = p.interests.some((i) => i.id === c.topic);
      return { patch: has ? {} : { interests: [...p.interests, { id: c.topic, weight: 1 }] }, message: `${label} words come first when there's a choice, and in stories you ask for.` };
    }
  }
}

/** Every command in a phrasing the parser understands: the AI may only answer with one of these. */
export const CANONICAL = [
  'too easy', 'too hard', 'more listening', 'more speaking', 'more reading', 'more tones', 'less pinyin', 'more pinyin', 'no pinyin',
  'always pinyin', 'slower', 'faster', 'more chinese', 'more english', 'chinese only', 'fewer new words', 'more new words',
  ...[5, 10, 15, 20, 30, 45].map((m) => `${m} minute sessions`),
  ...TOPICS.map(([id]) => `more ${id}`),
];

export function commandRequest(text: string): ChatRequest {
  return {
    purpose: 'command',
    system: `A language-learning app has these settings commands: ${CANONICAL.join('; ')}. Map the learner's request to the one command that best does what they ask, or "none" if none fits. Reply with JSON only: {"command": "..."}.`,
    messages: [{ role: 'user', content: text }],
    schema: { type: 'object', additionalProperties: false, required: ['command'], properties: { command: { type: 'string', enum: [...CANONICAL, 'none'] } } },
  };
}

export function parseAiCommand(raw: string): Command | null {
  try {
    const c = (JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) as { command?: unknown }).command;
    return typeof c === 'string' && CANONICAL.includes(c) ? parseCommand(c) : null;
  } catch {
    return null;
  }
}
