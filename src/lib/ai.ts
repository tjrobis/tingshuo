// Swappable AI providers. Entirely optional: the rest of the app never needs one.
// Keys live in this device's IndexedDB (`secrets`), go only to their own provider, and are never
// logged or exported. Deterministic work (scheduling, grading, lookups) never calls an LLM.

import type { AIProviderId } from './types';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  purpose: 'tutor' | 'review' | 'explain' | 'story' | 'command' | 'test';
  system: string;
  messages: ChatMessage[];
  /** JSON schema the reply must follow (enforced where the provider supports it, requested otherwise). */
  schema?: Record<string, unknown>;
}

export interface ProviderSettings {
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

export interface ChatResult {
  text: string;
  usage?: Record<string, unknown>;
}

export type Provider = Exclude<AIProviderId, 'none'>;

export const PROVIDERS: Record<Provider, { label: string; model: string; needsKey: boolean; baseUrl?: string; note: string }> = {
  anthropic: {
    label: 'Claude (Anthropic)', model: 'claude-opus-5-5', needsKey: true,
    note: 'Paid API (pay per use). Runs at low effort for chat to keep costs down; the model is editable.',
  },
  gemini: {
    label: 'Google Gemini', model: '', needsKey: true,
    note: 'Has a free tier. Enter a current model name from Google AI Studio.',
  },
  openai: {
    label: 'OpenAI', model: '', needsKey: true, baseUrl: 'https://api.openai.com/v1',
    note: 'Paid API. Enter a current chat model name.',
  },
  'openai-compatible': {
    label: 'Local or other (Ollama, LM Studio, OpenRouter, Groq…)', model: '', needsKey: false, baseUrl: 'http://localhost:11434/v1',
    note: 'Free and private with a local model; Qwen models are strong at Chinese. Ollama must allow this site: set OLLAMA_ORIGINS.',
  },
};

class ProviderError extends Error {}

async function httpError(res: Response, provider: string): Promise<ProviderError> {
  const body = await res.text().catch(() => '');
  if (res.status === 401 || res.status === 403) return new ProviderError(`${provider} rejected the API key.`);
  if (res.status === 429) return new ProviderError(`${provider} says you've hit a rate limit or quota. Try again later.`);
  return new ProviderError(`${provider} returned an error (${res.status}): ${body.slice(0, 200)}`);
}

/** Claude through the official SDK, loaded only when used. */
export async function anthropicChat(req: ChatRequest, cfg: ProviderSettings, signal?: AbortSignal): Promise<ChatResult> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  // Bring-your-own-key, browser-direct: the key never touches any server but Anthropic's.
  const client = new Anthropic({ apiKey: cfg.apiKey, dangerouslyAllowBrowser: true });
  // Effort and server-side refusal fallback exist on current models; older ones would reject them.
  const current = /^claude-(opus|sonnet|fable|mythos)-5/.test(cfg.model);
  try {
    const res = await client.beta.messages.create(
      {
        model: cfg.model,
        max_tokens: 16000,
        system: req.system,
        messages: req.messages,
        cache_control: { type: 'ephemeral' }, // the long system prompt repeats every turn
        ...(current ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
        output_config: {
          ...(current ? { effort: 'low' as const } : {}),
          ...(req.schema ? { format: { type: 'json_schema' as const, schema: req.schema } } : {}),
        },
      },
      { signal },
    );
    if (res.stop_reason === 'refusal') {
      throw new ProviderError(`Claude declined this request${res.stop_details?.explanation ? `: ${res.stop_details.explanation}` : '.'}`);
    }
    return {
      text: res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join(''),
      usage: { input: res.usage.input_tokens, output: res.usage.output_tokens, cacheRead: res.usage.cache_read_input_tokens ?? 0 },
    };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw new ProviderError('Anthropic rejected the API key.');
    if (e instanceof Anthropic.RateLimitError) throw new ProviderError("Anthropic says you've hit a rate limit. Try again in a minute.");
    if (e instanceof Anthropic.APIConnectionError) throw new ProviderError("Couldn't reach Anthropic. Check your connection.");
    throw e;
  }
}

/** OpenAI and every server that speaks its Chat Completions dialect (Ollama, LM Studio, OpenRouter, Groq…). */
export async function openaiChat(req: ChatRequest, cfg: ProviderSettings, signal?: AbortSignal): Promise<ChatResult> {
  const res = await fetch(`${(cfg.baseUrl ?? PROVIDERS.openai.baseUrl!).replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}) },
    body: JSON.stringify({
      model: cfg.model,
      messages: [{ role: 'system', content: req.system }, ...req.messages],
      ...(req.schema ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  if (!res.ok) throw await httpError(res, 'The AI server');
  const data = await res.json();
  return { text: data.choices?.[0]?.message?.content ?? '', usage: data.usage };
}

/** Google Gemini (the key goes in a header, never the URL). */
export async function geminiChat(req: ChatRequest, cfg: ProviderSettings, signal?: AbortSignal): Promise<ChatResult> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.apiKey ?? '' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: req.system }] },
      contents: req.messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      ...(req.schema ? { generationConfig: { responseMimeType: 'application/json' } } : {}),
    }),
  });
  if (!res.ok) throw await httpError(res, 'Gemini');
  const data = await res.json();
  const parts: { text?: string }[] = data.candidates?.[0]?.content?.parts ?? [];
  return { text: parts.map((p) => p.text ?? '').join(''), usage: data.usageMetadata };
}

const ADAPTERS: Record<Provider, typeof openaiChat> = {
  anthropic: anthropicChat,
  openai: openaiChat,
  'openai-compatible': openaiChat,
  gemini: geminiChat,
};

/** Call a provider, turning network failures into messages a learner can act on. */
export async function chat(provider: Provider, req: ChatRequest, cfg: ProviderSettings, signal?: AbortSignal): Promise<ChatResult> {
  try {
    return await ADAPTERS[provider](req, cfg, signal);
  } catch (e) {
    if (e instanceof ProviderError || (e as Error).name === 'AbortError') throw e;
    if (e instanceof TypeError) {
      throw new ProviderError(provider === 'openai-compatible'
        ? "Couldn't reach the AI server. Check it's running and allows this site (CORS)."
        : `Couldn't reach ${PROVIDERS[provider].label}. Check your connection.`);
    }
    throw e;
  }
}
