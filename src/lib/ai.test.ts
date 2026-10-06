import { afterEach, describe, expect, it, vi } from 'vitest';
import { anthropicChat, chat, geminiChat, openaiChat, type ChatRequest } from './ai';
import { db } from './db';
import { charOverlap } from './grade';
import { commit, emptyState, newProfile, seedKnown } from './session';
import { ask, correctionsToErrors, MODES, parseReply, REPLY_SCHEMA, systemPrompt, unknownWords } from './tutor';

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
