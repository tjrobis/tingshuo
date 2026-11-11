import { afterEach, describe, expect, it, vi } from 'vitest';
import { anthropicChat, chat, geminiChat, openaiChat, type ChatRequest } from './ai';
import { db } from './db';
import { charOverlap } from './grade';
import { commit, emptyState, newProfile, seedKnown } from './session';
import { words } from './curriculum';
import { missions } from './curriculum';
import { ask, correctionsToErrors, generateStory, missionChecks, MODES, parseReply, parseStory, REPLY_SCHEMA, storyBrief, storyRequest, systemPrompt, unknownWords } from './tutor';

// ── A stand-in for the Anthropic SDK that records what it was asked ──
const sdk = vi.hoisted(() => {
  class APIError extends Error {}
  const state = { opts: undefined as unknown, params: undefined as Record<string, unknown> | undefined, response: undefined as unknown, throws: undefined as Error | undefined };
  class Anthropic {
    static AuthenticationError = class extends APIError {};
    static PermissionDeniedError = class extends APIError {};
    static RateLimitError = class extends APIError {};
    static APIConnectionError = class extends APIError {};
    beta = {
      messages: {
        create: async (params: Record<string, unknown>) => {
          state.params = params;
          if (state.throws) throw state.throws;
          return state.response;
        },
      },
    };
    constructor(opts: unknown) {
      state.opts = opts;
    }
  }
  return { state, Anthropic };
});
vi.mock('@anthropic-ai/sdk', () => ({ default: sdk.Anthropic }));

const req: ChatRequest = { purpose: 'tutor', system: 'SYSTEM', messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'yo' }], schema: REPLY_SCHEMA };
const okMessage = (text: string, stop = 'end_turn') => ({
  content: [{ type: 'thinking', thinking: '' }, { type: 'text', text }],
  stop_reason: stop, stop_details: stop === 'refusal' ? { explanation: 'policy' } : null,
  usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0 },
});

afterEach(() => {
  vi.unstubAllGlobals();
  sdk.state.throws = undefined;
});

describe('Anthropic provider (official SDK)', () => {
  it('calls the Messages API browser-direct with structured output, caching, low effort and refusal fallback', async () => {
    sdk.state.response = okMessage('{"reply":"你好"}');
    const r = await anthropicChat(req, { model: 'claude-opus-5-5', apiKey: 'sk-test' });
    expect(r.text).toBe('{"reply":"你好"}');
    expect(sdk.state.opts).toEqual({ apiKey: 'sk-test', dangerouslyAllowBrowser: true });
    expect(sdk.state.params).toMatchObject({
      model: 'claude-opus-5-5', system: 'SYSTEM', messages: req.messages, cache_control: { type: 'ephemeral' },
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: REPLY_SCHEMA } },
    });
  });

  it('leaves out options older models would reject', async () => {
    sdk.state.response = okMessage('hi');
    await anthropicChat({ ...req, schema: undefined }, { model: 'claude-haiku-4-5', apiKey: 'k' });
    expect(sdk.state.params).not.toHaveProperty('fallbacks');
    expect(sdk.state.params!.output_config).toEqual({});
  });

  it('turns refusals and bad keys into readable errors', async () => {
    sdk.state.response = okMessage('', 'refusal');
    await expect(anthropicChat(req, { model: 'claude-opus-5-5', apiKey: 'k' })).rejects.toThrow(/declined.*policy/);
    sdk.state.throws = new sdk.Anthropic.AuthenticationError('401');
    await expect(anthropicChat(req, { model: 'claude-opus-5-5', apiKey: 'bad' })).rejects.toThrow('Anthropic rejected the API key.');
  });
});

describe('fetch-based providers', () => {
  const stub = (status: number, body: unknown) => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };
  const call = (m: ReturnType<typeof stub>) => {
    const [url, init] = m.mock.calls[0] as unknown as [string, RequestInit];
    return { url, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) };
  };

  it('OpenAI-compatible: system first, JSON mode, bearer key only when there is one', async () => {
    const m = stub(200, { choices: [{ message: { content: 'ok' } }] });
    expect((await openaiChat(req, { model: 'qwen2.5', baseUrl: 'http://localhost:11434/v1/' })).text).toBe('ok');
    const c = call(m);
    expect(c.url).toBe('http://localhost:11434/v1/chat/completions');
    expect(c.headers.Authorization).toBeUndefined();
    expect(c.body.messages[0]).toEqual({ role: 'system', content: 'SYSTEM' });
    expect(c.body.response_format).toEqual({ type: 'json_object' });
    const m2 = stub(200, { choices: [{ message: { content: 'ok' } }] });
    await openaiChat(req, { model: 'gpt', apiKey: 'sk-1' });
    expect(call(m2).headers.Authorization).toBe('Bearer sk-1');
  });

  it('Gemini: key in a header (never the URL), assistant turns sent as "model"', async () => {
    const m = stub(200, { candidates: [{ content: { parts: [{ text: 'a' }, { text: 'b' }] } }] });
    expect((await geminiChat(req, { model: 'gemini-x', apiKey: 'g-key' })).text).toBe('ab');
    const c = call(m);
    expect(c.url).not.toContain('g-key');
    expect(c.headers['x-goog-api-key']).toBe('g-key');
    expect(c.body.contents.map((x: { role: string }) => x.role)).toEqual(['user', 'model']);
    expect(c.body.generationConfig).toEqual({ responseMimeType: 'application/json' });
  });

  it('explains failures in terms the learner can act on', async () => {
    stub(401, { error: 'bad key' });
    await expect(chat('gemini', req, { model: 'm', apiKey: 'x' })).rejects.toThrow('Gemini rejected the API key.');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(chat('openai-compatible', req, { model: 'm' })).rejects.toThrow(/allows this site \(CORS\)/);
  });
});

describe('tutor', () => {
  const learner = () => {
    const s = emptyState(newProfile({ name: 'Sam', goals: [], interests: [], sessionMinutes: 20, pinyinMode: 'new' }, new Date()));
    commit(s, seedKnown(s, ['w:你好', 'w:你', 'w:我', 'w:是', 'w:学生', 'w:吗', 'w:呢'], new Date()));
    return s;
  };

  it('builds a system prompt from what the learner knows, the mode and the scenario', () => {
    const p = systemPrompt({ name: 'Sam', known: ['你好', '学生'], grammar: ['Yes/no questions with 吗'], weak: ['Mixing up 是 and 有'], goal: 'Unit 1' }, 'challenge', 'At a café.');
    expect(p).toMatch(/你好 学生/);
    expect(p).toMatch(/At most 3 new word/);
    expect(p).toMatch(/Mixing up 是 and 有/);
    expect(p).toMatch(/At a café\./);
    expect(p).toMatch(/JSON only/);
    expect(MODES.learning.newWords).toBe(1);
  });

  it('uses less English as immersion rises', () => {
    const ctx = { name: 'Sam', known: ['你好'], grammar: [], weak: [], goal: 'Unit 1' };
    expect(systemPrompt({ ...ctx, immersion: 1 }, 'conversation', 'x')).not.toMatch(/Chinese only/);
    expect(systemPrompt({ ...ctx, immersion: 5 }, 'conversation', 'x')).toMatch(/Use Chinese only, always/);
  });

  it('checks missions against what the learner wrote, on the device', () => {
    const order = missions.find((m) => m.id === 'order')!;
    expect(missionChecks(order, ['我要一碗面', '谢谢'])).toEqual([true, true, false]);
    expect(missionChecks(order, ['我要一碗面', '服务员，买单！'])).toEqual([true, true, true]);
  });

  it('parses replies defensively', () => {
    const fenced = '```json\n{"reply":"你好！","translation":"Hi!","corrections":[{"said":"我是好","better":"我很好","why":"No 是 before adjectives.","category":"grammar","severity":9},{"said":"x","better":"x","why":"","category":"bogus","severity":1}],"newWords":[{"word":"咖啡","meaning":"coffee"}]}\n```';
    const r = parseReply(fenced);
    expect(r.reply).toBe('你好！');
    expect(r.corrections).toEqual([{ said: '我是好', better: '我很好', why: 'No 是 before adjectives.', category: 'grammar', severity: 3 }]);
    expect(r.newWords).toEqual([{ word: '咖啡', meaning: 'coffee' }]);
    expect(parseReply('你好！你叫什么名字？').reply).toBe('你好！你叫什么名字？');
    expect(parseReply('Sorry, I cannot help.').reply).toBe('');
  });

  it('finds words the learner has not been taught, ignoring names', () => {
    const s = learner();
    expect(unknownWords(s, '你好！你是学生吗？')).toEqual({ unknown: [], coverage: 1 });
    const r = unknownWords(s, '我是小明，你喜欢咖啡吗？');
    expect(r.unknown).toEqual(['喜欢', '咖啡']);
    expect(r.coverage).toBeCloseTo(5 / 7);
  });

  it('turns conversation corrections into error-bank records tied to words', () => {
    const [e] = correctionsToErrors([{ said: '我有学生', better: '我是学生', why: '是 links nouns.', category: 'other', severity: 2 }], 1);
    expect(e).toMatchObject({ category: 'similar_word', itemId: 'w:是', confusedWith: 'w:有', source: 'conversation', note: '是 links nouns.' });
    expect(e.patternKey).toBe('similar_word:w:是|w:有'); // same key whichever way round the mix-up happens
  });

  it('logs every AI call, and never the API key', async () => {
    const s = learner();
    s.profile.ai = { provider: 'openai-compatible', model: 'qwen2.5', baseUrl: 'http://localhost:11434/v1', consent: true };
    await db.secrets.put({ provider: 'openai-compatible', apiKey: 'sk-secret-123' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"reply":"好"}' } }] }))));
    expect(await ask(s.profile, req)).toBe('{"reply":"好"}');
    const log = await db.aiLog.orderBy('at').last();
    expect(log).toMatchObject({ provider: 'openai-compatible', model: 'qwen2.5', purpose: 'tutor', ok: true });
    expect(JSON.stringify(log)).not.toContain('sk-secret-123');
  });

  it('scores clarity as the share of expected characters recognised, in order', () => {
    expect(charOverlap('你好吗', '你好')).toBeCloseTo(2 / 3);
    expect(charOverlap('我是学生。', '我是学生')).toBe(1);
    expect(charOverlap('你好', 'hello')).toBe(0);
  });
});

describe('pinyin for AI text', () => {
  it('uses lexicon pinyin for known words (neutral tones intact) and attaches ASCII punctuation', async () => {
    const { pinyinOf } = await import('./tutor');
    expect(await pinyinOf('你好！你是学生吗？')).toBe('nǐhǎo! nǐ shì xuésheng ma?');
    expect(await pinyinOf('我喜欢熊猫。')).toMatch(/^wǒ xǐhuan xióngmāo\.$/); // 熊猫 isn't in the lexicon
  });
});

describe('AI stories', () => {
  const learner = () => {
    const s = emptyState(newProfile({ name: 'Sam', goals: [], interests: [], sessionMinutes: 20, pinyinMode: 'new' }, new Date()));
    commit(s, seedKnown(s, words.filter((w) => !w.incidental && w.unit <= 2).map((w) => w.id), new Date()));
    s.profile.ai = { provider: 'openai-compatible', model: 'qwen2.5', baseUrl: 'http://localhost:11434/v1', consent: true };
    return s;
  };
  const questions = [{ q: 'Who?', options: ['A', 'B', 'C'], answer: 0 }, { q: 'Where?', options: ['A', 'B', 'C'], answer: 2 }];

  it('briefs the model with known words, words to practise, the topic and the coverage target', () => {
    const b = storyBrief(learner(), 'school');
    expect(b.known).toContain('学生');
    expect(b.known).not.toContain('喜欢'); // unit 5, not learned
    expect(b).toMatchObject({ topic: 'school', sentences: 6, target: 0.92 });
    expect(b.practise.length).toBe(6);
    expect(storyRequest(b).system).toMatch(/Topic: school/);
  });

  it('parses stories defensively, dropping broken questions and non-Chinese lines', () => {
    const text = '```json\n' + JSON.stringify({
      title: 'Cats', titleZh: '猫', paragraphs: [[{ zh: '我有猫。', en: 'I have a cat.' }, { zh: 'hello', en: 'x' }], []],
      questions: [questions[0], { q: 'Bad', options: ['A'], answer: 0 }, { q: 'Out of range', options: ['A', 'B'], answer: 5 }],
      newWords: [{ word: '猫', meaning: 'cat' }],
    }) + '\n```';
    const p = parseStory(text)!;
    expect(p.paragraphs).toEqual([[{ zh: '我有猫。', en: 'I have a cat.' }]]);
    expect(p.questions).toEqual([questions[0]]);
    expect(parseStory('Sorry, no story.')).toBeNull();
    expect(parseStory('{"paragraphs": [[{"zh": "hello"}]]}')).toBeNull();
  });

  it('checks every word on the device, asks for one rewrite naming the unknown ones, and stores the report', async () => {
    const s = learner();
    const story = (zh: string) => JSON.stringify({ title: 'T', titleZh: '学生', paragraphs: [[{ zh, en: 'e' }]], questions, newWords: [{ word: '熊猫', meaning: 'panda' }] });
    const replies = [story('我喜欢熊猫，熊猫喜欢竹子。'), story('我是学生，她是老师。我叫小明。')];
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ choices: [{ message: { content: replies.shift() } }] })));
    vi.stubGlobal('fetch', fetchMock);
    const st = await generateStory(s, 'school');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retry = JSON.parse(fetchMock.mock.calls[1][1].body as string) as { messages: { content: string }[] };
    expect(retry.messages.at(-1)!.content).toMatch(/喜欢.*熊猫|熊猫.*喜欢/);
    expect(st.ai!.validation).toMatchObject({ passed: true, coverage: 1, attempts: 2, unknown: [] });
    expect(st.paragraphs[0][0].tokens.filter((t) => t.kind === 'han').map((t) => t.text)).toEqual(['我', '是', '学生', '她', '是', '老师', '我', '叫', '小明']);
    expect(st.id).toMatch(/^ai:\d+$/);
    const saved = await db.generated.get(Number(st.id.slice(3)));
    expect(saved).toMatchObject({ kind: 'story', topic: 'school', provider: 'openai-compatible', validation: { passed: true, attempts: 2 } });
  });

  it('keeps a story that still misses the target, with the problem stated', async () => {
    const s = learner();
    const reply = JSON.stringify({ title: 'T', titleZh: 'T', paragraphs: [[{ zh: '我喜欢熊猫。', en: 'I like pandas.' }]], questions, newWords: [] });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: reply } }] }))));
    const st = await generateStory(s, 'food');
    expect(st.ai!.validation.passed).toBe(false);
    expect(st.ai!.validation.issues[0]).toMatch(/33% of the words are ones you know/);
  });
});
