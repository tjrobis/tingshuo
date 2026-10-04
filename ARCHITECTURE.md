# Architecture

> Living document. Last updated: 2026-10-04.

## 1. Platform decision: local-first PWA

**Chosen:** React 19 + TypeScript (strict) + Vite, installed as a Progressive Web App.

| Option | Verdict |
|--------|---------|
| **PWA (chosen)** | One codebase for iPhone + desktop, $0 hosting (any static host), offline via service worker, mic via `getUserMedia`, TTS via `speechSynthesis`, storage via IndexedDB. Fast iteration. |
| React Native / Expo | Better native audio APIs, but iPhone install needs an Apple developer account ($99/yr) or weekly re-signing; two build pipelines; no real learning benefit. |
| Native Swift | Best iOS audio/STT, but no desktop, slowest to build. |
| Server-rendered web app | Needs a running server (cost) and is weak offline. |

### Known iOS constraints and mitigations

| Constraint | Mitigation |
|------------|------------|
| Web Speech **recognition** is unavailable in home-screen (standalone) web apps ([WebKit bug 225298](https://bugs.webkit.org/show_bug.cgi?id=225298)) | Pronunciation/tone feedback runs on **local pitch analysis**, which works everywhere. STT is an optional enhancer (works in a Safari tab; or via an optional AI provider). The iOS keyboard's dictation mic also works in any text field. |
| Safari may evict script storage for sites not used for 7 days unless installed to the Home Screen | Install prompt + `navigator.storage.persist()` + one-tap JSON backup + backup reminder. |
| `speechSynthesis` needs a user gesture on iOS before first use | Audio is always triggered from taps; voices are primed on first tap. |
| Microphone requires a secure context (HTTPS) | Deploy to any HTTPS static host; for LAN testing `npm run dev:https` uses a self-signed cert. |

## 2. High-level structure

```
┌───────────────────────────── Browser / PWA ─────────────────────────────┐
│ UI (React, Tailwind)                                                     │
│   features/: home, onboarding, calibration, session, exercises,          │
│   pronunciation, reader, tutor, dashboard, map, missions, settings, debug│
├──────────────────────────────────────────────────────────────────────────┤
│ Learning engine (pure TS, deterministic, unit-tested — no LLM)          │
│   srs/ (FSRS via ts-fsrs) · engine/mastery · engine/ability (Elo)        │
│   engine/planner · engine/selector · engine/evaluate · engine/errors     │
│   engine/metalearning · engine/progress · engine/commands                │
├──────────────────────────────────────────────────────────────────────────┤
│ Language layer (pure TS)                                                 │
│   pinyin/ (parse, tone marks, sandhi, validation) · content/segment      │
│   content/validate (pinyin-pro cross-check, coverage)                    │
├──────────────────────────────────────────────────────────────────────────┤
│ Media layer (browser APIs, all local)                                    │
│   audio/tts (speechSynthesis) · audio/recorder (MediaRecorder)           │
│   audio/pitch (YIN) · audio/tones (contour → tone diagnosis)             │
│   audio/stt (optional Web Speech recognition — third-party processing)   │
├──────────────────────────────────────────────────────────────────────────┤
│ AI layer (optional, swappable)                                           │
│   ai/provider interface → anthropic | openai | gemini | openai-compatible│
│   (Ollama, LM Studio, OpenRouter, Groq…) · ai/tutor · ai/generate        │
│   Every AI output passes through content/validate before display/storage │
├──────────────────────────────────────────────────────────────────────────┤
│ Persistence: IndexedDB via Dexie (all learner data on device)            │
│ Curated curriculum: static TS data bundled with the app (read-only)      │
└──────────────────────────────────────────────────────────────────────────┘
          │ optional, user-configured only
          ▼
   AI provider HTTPS endpoint (Anthropic / OpenAI / Google / local Ollama)
   Browser STT service (Google in Chrome, Apple in Safari) — opt-in
```

There is **no backend**. Operating cost is $0 unless the learner configures a paid AI provider.

## 3. Directory layout

```
src/
  main.tsx, App.tsx, router.ts         app shell + tiny hash router
  styles/index.css                     Tailwind v4 + design tokens (light/dark)
  data/                                curated, validated curriculum (read-only)
    lexicon.ts  characters.ts  grammar.ts  sentences.ts  units.ts
    tones.ts  dialogues.ts  stories.ts  missions.ts  confusables.ts  benchmark.ts
  lib/
    pinyin/      tone-mark ↔ number, syllable parsing/validation, sandhi, input normalisation
    content/     curriculum index, segmentation, validation, coverage
    srs/         FSRS wrapper, rating policy
    engine/      learner model, mastery, ability, planner, selector, evaluation,
                 errors, progress, meta-learning, commands, achievements
    audio/       tts, recorder, pitch (YIN), tone analysis, stt
    ai/          provider abstraction + adapters, prompts, tutor, generation
    db/          Dexie schema, repositories, migrations, import/export
    i18n/        UI strings with immersion-level variants
  components/    UI primitives (Button, Card, Sheet, HanziText, AudioButton…)
  features/      screens
```

## 4. Key technical choices

| Concern | Choice | Why |
|---------|--------|-----|
| Spaced repetition | `ts-fsrs` (FSRS-6, MIT) | Evidence-based, the reference TS implementation of FSRS; parameters optimisable later from our review logs. |
| Storage | Dexie 4 over IndexedDB | Mature, small, works on iOS Safari, live queries for reactive UI. |
| Pinyin for arbitrary text | `pinyin-pro` (MIT) | Context-aware polyphone handling; used to (a) cross-validate curated pinyin in tests and (b) generate pinyin for AI text instead of trusting the model. |
| Word segmentation | Longest-match on lexicon, fallback `Intl.Segmenter('zh', {granularity:'word'})` | Free, local, built into Safari/Chrome/Node. |
| Pitch detection | Own YIN implementation | ~100 lines, deterministic, testable with synthetic signals, no dependency. |
| TTS | `speechSynthesis` with best zh-CN voice ranking | Free; iOS voices are on-device; Edge/Chrome have good voices. AudioAsset abstraction allows pre-recorded/native audio later. |
| Styling | Tailwind CSS v4 | Fast to build a consistent, polished mobile-first UI with dark mode. |
| PWA | `vite-plugin-pwa` (Workbox) | Precaches app shell + curriculum for offline use. |
| Tests | Vitest + fake-indexeddb | Fast; same Vite transform pipeline. |
| Lint | ESLint 9 flat config + typescript-eslint + react-hooks | Standard. |

## 5. AI provider abstraction

```ts
interface AIProvider {
  id: 'anthropic' | 'openai' | 'gemini' | 'openai-compatible';
  chat(req: ChatRequest, signal?: AbortSignal): Promise<ChatResult>;          // full reply
  stream?(req: ChatRequest, onText: (t: string) => void, signal?): Promise<ChatResult>;
}
```

- **Anthropic** adapter uses the official `@anthropic-ai/sdk` (lazy-loaded so it costs nothing when
  unused) with `dangerouslyAllowBrowser: true` — required for browser-direct, bring-your-own-key use.
  Default model `claude-opus-5-5` at low effort for chat (editable in Settings), automatic prompt
  caching, refusal handling, and server-side refusal fallback enabled.
- **OpenAI** and **OpenAI-compatible** (Ollama, LM Studio, OpenRouter, Groq, etc.) share the Chat
  Completions shape via `fetch`.
- **Gemini** uses the `generateContent` REST endpoint (has a free tier).
- Recommended $0 options: local **Ollama** with a Qwen model (strong Chinese) on desktop, or the
  Gemini free tier.

Deterministic work never calls an LLM: scheduling, lookups, planning, grading of structured
answers, coverage estimation, pinyin, sandhi, error classification for structured answers.

AI is used for: open conversation, flexible explanations ("I'm confused", "Why?"), story/dialogue
generation, grading free-form translations when deterministic matching is inconclusive,
conversation corrections, and NL-command fallback.

## 6. Security & privacy

| Data | Where it lives | Leaves the device? |
|------|----------------|--------------------|
| Learning history, SRS, errors, profile | IndexedDB on device | Only in exports the learner makes |
| Voice recordings | IndexedDB (optional retention, default keep last 50) | Never, except optional STT/AI transcription (opt-in, labelled) |
| API keys | `secrets` table in IndexedDB on device | Sent only to the provider it belongs to. Excluded from exports, redacted in AI logs, never hard-coded. |
| AI prompts | Built on device | Sent to the configured provider only when an AI feature is used; each AI feature is labelled "Third-party AI" in the UI |

- Production build ships a Content-Security-Policy (`script-src 'self'`) to reduce XSS risk to
  stored keys. AI output is rendered as text only (never `innerHTML`).
- Every feature that sends data off-device carries a visible badge: **On device** /
  **Browser speech service** / **Your AI provider**.

## 7. Content trust model

```
curated (bundled, validated by automated tests)  ── trusted, schedulable
user-added (import, "add word")                   ── validated by pinyin-pro; flagged "unverified meaning"
ai-generated (stories, sentences, glosses)        ── never becomes curated; pinyin recomputed locally;
                                                     unknown-word density checked; marked "generated"
```

See LEARNING_ENGINE.md §9 for validation rules.

## 8. Build, test, run

```
npm run dev         # local dev server
npm run dev:https   # LAN testing on iPhone (self-signed cert)
npm test            # vitest
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm run build       # production PWA in dist/
npm run check       # all of the above
```

Deployment: `dist/` is static; deploy to GitHub Pages, Cloudflare Pages or Netlify (free tiers).
