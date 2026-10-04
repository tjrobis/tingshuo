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

```ts
VocabularyItem { id; hanzi; pinyin /* tone numbers, space-separated syllables */;
  meanings: string[] /* first = primary gloss */; accept?: string[] /* extra accepted English */;
  pos; unit; freq: 1..5 /* approximate frequency band, 1 = top ~300 */;
  topics: string[]; emoji?; note?; measure?: string /* default classifier */; literal? }
Character { id; char; pinyin; meaning; components?: {part, meaning}[]; mnemonic?; }
GrammarConcept { id; title; pattern; explanation /* ≤ 3 sentences */; why /* deeper "Why?" */;
  unit; examples: sentenceId[]; prereqs: grammarId[] }
Sentence { id; zh /* tokens separated by spaces */; en; unit; items: itemId[] /* derived */;
  grammar: grammarId[]; topics }
Dialogue { id; title; scenario; unit; lines: {speaker, sentenceId | zh, en, expect?: Expect[]}[] }
Story { id; title; unit; topic; paragraphs: sentenceId[][]; questions: Question[] }
Unit { id; n; title; goal /* "After this you can…" */; items: itemId[]; grammar: grammarId[] }
Mission { id; title; description; unit; kind; evaluation }
```

## Learner tables (Dexie)

| Table | Primary key | Indexes | Purpose |
|-------|-------------|---------|---------|
| `profile` | `id` (`'me'`) | — | **User** + preferences + **Interest**[] + **Goal**[] + AI config (non-secret) |
| `policy` | `id` (`'me'`) | — | Parameters tuned by meta-learning (new-item cap, intro modality, k_format…) |
| `srs` | `id` = `itemId|facet` | `itemId`, `facet`, `due`, `[facet+due]` | **SRSState** — FSRS card per facet |
| `mastery` | `itemId` | `kind`, `lastSeen` | **MasteryState** — per-item statistics |
| `events` | `++id` | `at`, `type`, `itemId`, `sessionId` | **LearningEvent** — append-only granular log |
| `reviews` | `++id` | `srsId`, `at` | **Review** — FSRS review log (optimiser-compatible) |
| `errors` | `++id` | `at`, `category`, `itemId`, `patternKey` | **ErrorRecord** |
| `patterns` | `key` | `status` | Aggregated recurring error patterns |
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
  card: { due: Date; stability; difficulty; elapsed_days; scheduled_days; learning_steps;
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
