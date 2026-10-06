# Database Schema

> Living document. Source of truth in code: `src/lib/db/schema.ts` (Dexie) and
> `src/lib/types.ts`. Last updated: 2026-10-04. Current DB version: **1**.

Two kinds of data:

1. **Curated curriculum** — static, validated TypeScript data bundled with the app (read-only,
   versioned with the code): `VocabularyItem`, `Character`, `GrammarConcept`, `Sentence`,
   `Dialogue`, `Story`, `Unit`, `Mission`, tone/sound items, confusable sets, benchmark banks.
2. **Learner data** — IndexedDB (Dexie database `tingshuo`), on device only.

Item ids are stable strings: `w:<hanzi>[#disambiguator]`, `c:<char>`, `g:<slug>`, `t:<n>`,
`tp:<a>-<b>`, `s:<slug>`. Custom/generated items use `u:<uuid>` / `x:<uuid>`.

## Curated types (src/lib/types.ts)

Authored as pipe tables in `src/data/curriculum.ts`, parsed by `src/lib/curriculum.ts`.
Relationships are derived, not stored: a word's unit comes from its section, a sentence's pinyin
from its tokens, a grammar point's examples from sentences tagged with its id.

```ts
VocabularyItem { id /* w:<hanzi> */; hanzi; pinyin /* tone numbers, one syllable per char */;
  meanings: string[] /* first = display gloss, all accepted */; pos; unit;
  freq: 1..5 /* approximate band */; topics: string[]; emoji?; note?; incidental? /* names */ }
CharacterInfo { id /* c:<char> */; char; pinyin; meaning; components?: string; mnemonic? }
GrammarConcept { id /* g:<slug> */; title; pattern; explanation; why /* the "Why?" button */; unit }
Sentence { id /* s:<surface text> */; zh /* tokens separated by spaces */;
  en: string[] /* accepted translations, first displayed */; unit; grammar: grammarId[] }
Unit { n; title; titleZh; goal /* "After this unit you can…" */; milestone? }
toneSets { base; chars /* one per tone */ }   soundPairs { id /* s:zh-j */; label; pair }
```

Dialogue, Story, Roleplay and Mission types land with the slices that use them (5–8).

## Learner tables (Dexie)

Version 3 (slice 6) adds `secrets` (API keys: never exported or logged), `conversations`, `messages`
and `aiLog` (every AI request and response, without keys). Version 2 (slice 5) adds `pronunciation` (every analysed spoken attempt) and `recordings` (the learner's
audio, pruned to the newest `privacy.keepRecordings`, default 50). Version 1 creates the tables the learning loop uses: `profile`, `srs`, `mastery`, `events`, `reviews`,
`errors`, `sessions`, `abilities`, `assessments`. The others below are added (Dexie version bump) by
the slice that first needs them. `patterns` is not a table: patterns are derived from `errors`.

| Table | Primary key | Indexes | Purpose |
|-------|-------------|---------|---------|
| `profile` | `id` (`'me'`) | — | **User** + preferences + **Interest**[] + **Goal**[] + AI config (non-secret) |
| `policy` | `id` (`'me'`) | — | Parameters tuned by meta-learning (new-item cap, intro modality, k_format…) |
| `srs` | `id` = `itemId|facet` | `itemId`, `facet`, `due`, `[facet+due]` | **SRSState** — FSRS card per facet |
| `mastery` | `itemId` | `kind`, `lastSeen` | **MasteryState** — per-item statistics |
| `events` | `++id` | `at`, `type`, `itemId`, `sessionId` | **LearningEvent** — append-only granular log |
| `reviews` | `++id` | `srsId`, `at` | **Review** — FSRS review log (optimiser-compatible) |
| `errors` | `++id` | `at`, `category`, `itemId`, `patternKey` | **ErrorRecord** |
| `pronunciation` | `++id` | `at`, `itemId` | **PronunciationAttempt** (scores, per-syllable diagnosis, contour) |
| `recordings` | `++id` | `at` | **AudioAsset** (learner audio blobs; pruned to retention setting) |
| `sessions` | `++id` | `startedAt` | **Lesson** — planned blocks, rationale, outcome summary |
| `conversations` | `++id` | `startedAt` | **Conversation** (mode, scenario, provider, duration, review) |
| `messages` | `++id` | `conversationId` | **ConversationMessage** |
| `assessments` | `++id` | `at`, `kind` | **Assessment** (placement / benchmark) with item-level results |
| `abilities` | `skill` | — | Elo skill ratings θ, n |
| `generated` | `++id` | `kind`, `createdAt` | AI-generated stories/sentences + validation report |
| `customItems` | `id` | — | User-added / imported vocabulary (`verified:false`) |
| `aiLog` | `++id` | `at` | AI request/response log (keys redacted) |
| `insights` | `id` | — | Meta-learning insights with evidence |
| `achievements` | `id` | — | Unlocked achievements |
| `secrets` | `provider` | — | API keys. **Never exported, never logged.** |

### Core learner record shapes

```ts
SRSState { id; itemId; facet; activatedAt;
  card: Card /* ts-fsrs type */ { due: Date; stability; difficulty; elapsed_days; scheduled_days; learning_steps;
          reps; lapses; state /* 0 New 1 Learning 2 Review 3 Relearning */; last_review?: Date } }

MasteryState { itemId; kind; firstSeen; lastSeen; encounters;
  byFacet: Record<Facet, { correct; incorrect; lastResult?: boolean }>;
  rtMedianMs?; rtSamples: number[] /* last 10 */; pronunciationScore? /* rolling 0..1 */;
  contexts: string[] /* sentence/story ids, last 20 */; mistakes: { given; count; last }[];
  confusions: { itemId; count }[]; lookups; introModality?: 'audio' | 'text'; introducedAt?;
  introSessionId?; flags: { leech?; keepForgetting?; parkedUntil? } }

LearningEvent { id; at; sessionId?; type /* 'answer'|'intro'|'exposure'|'lookup'|'skip'|
  'confused'|'why'|'command'|'session_start'|'session_end'|'conversation_turn'|'benchmark' */;
  itemId?; facet?; exercise?; correct?; rating?; rtMs?; scaffold?; hintsUsed?;
  predictedP?; given?; expected?; errorCategory?; meta? }

Review { id; srsId; itemId; facet; at; rating; state; due; stability; difficulty;
  elapsed_days; last_elapsed_days; scheduled_days; learning_steps; exercise }

ErrorRecord { id; at; category; itemId?; confusedWith?; expected; given; exercise?; sessionId?;
  source: 'exercise' | 'conversation' | 'pronunciation'; patternKey; note? }

PronunciationAttempt { id; at; itemId; expectedPinyin; surfaceTones: number[];
  detectedTones: (number|null)[]; confidences: number[]; toneScore; rhythmScore;
  intelligibility?: number /* only with STT */; segmentalScore?: number /* only with STT */;
  sttText?; feedback: string[]; contour: number[] /* semitones, downsampled */; recordingId? }

Lesson (sessions) { id; startedAt; endedAt?; plannedMinutes; blocks: PlanBlock[];
  rationale: string[]; stats: { answered; correct; newItems; reviews; minutes }; mode }

Assessment { id; at; kind: 'placement' | 'benchmark'; results: { skill; correct; total; detail }[];
  estimates: Record<string, number>; items: { id; correct; rtMs? }[] }

Conversation { id; startedAt; endedAt?; mode; scenario; provider; minutes;
  review?: { said; better; why; category }[] }
ConversationMessage { id; conversationId; at; role: 'tutor' | 'learner'; zh; en?;
  corrections?; unknownWords?: string[]; coverage?; validation? }

GeneratedContent { id; kind: 'story' | 'sentence' | 'dialogue' | 'gloss'; createdAt; provider;
  payload; validation: { coverage; unknown: string[]; issues: string[]; passed: boolean } }
```

`Exercise` is a runtime type (prompt, expected answers, format, target facet, scaffold, predicted P);
its full content is captured in the `answer` LearningEvent, so history is reproducible.

## Migrations

- Dexie versioned schema; each version bump adds an `upgrade()` that transforms old rows.
- Export files carry `{ app: 'tingshuo', schemaVersion, exportedAt }`; import refuses newer schema
  versions and migrates older ones.
- Curriculum id changes require an id-alias map (`src/data/aliases.ts`) so learner state follows.

## Integrity rules (tested)

- `srs.id === itemId + '|' + facet`; facet must be valid for the item's kind.
- `card.due` is a Date; stability > 0 after first review; no NaN anywhere (guarded in `srs/` with tests).
- Event log is append-only; mastery and abilities can be fully rebuilt from `events` + `reviews`
  (`rebuildLearnerModel()` is used by the debug view and tests).
