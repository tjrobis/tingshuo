# Learning Engine

> Living document — the source of truth for how the app decides what to teach.
> Every rule here is deterministic and unit-tested unless marked *(AI)*. Last updated: 2026-10-04.

## 1. Principles → mechanisms

| Principle | Mechanism |
|-----------|-----------|
| Retrieval practice | Default exercise formats require producing an answer; recognition formats are scaffolds, not the goal. |
| Spacing | FSRS per facet (§3). |
| Comprehensible input | Stories/dialogues gated by known-word coverage (§10). |
| Listening-first | Every Chinese item has audio; new items are (by default) heard before seen; listening has its own facet & ability. |
| Production ≠ recognition | Separate facets; mastery requires recall facet (§4). |
| Interleaving | Session queue interleaves blocks and item types; new items are re-tested after 2–4 other exercises. |
| Desirable difficulty | Format chosen so predicted success ≈ 80–85 % (§7). |
| Mastery learning | Units unlock when their core items reach "Developing" — not when "completed". |
| Corrective feedback | Every wrong answer shows the right answer, a categorised diagnosis, and (when useful) a contrast. |
| Personalisation from evidence | Error bank (§8) and meta-learning (§11) change future sessions. |
| Gradual scaffold removal | Pinyin visibility, English, word banks and audio speed are faded per item and per skill. |

## 2. Knowledge components (items)

| Kind | Example id | Facets |
|------|-----------|--------|
| `word` (incl. multi-character phrases/chunks) | `w:你好`, `w:了#le` | `meaning`, `listening`, `recall`, `reading` |
| `char` | `c:好` | `char` |
| `grammar` | `g:shi-de`, `g:ma-question` | `grammar` (comprehension), `grammarProd` (production) |
| `tone` (single tone) | `t:3` | `perceive`, `produce` |
| `tonepair` | `tp:3-4` | `perceive`, `produce` |
| `sound` (initial/final contrast) | `s:zh-j` | `perceive` |

Facet meanings:

- `meaning` — see characters → know meaning (reading recognition).
- `listening` — hear it → know meaning (listening recognition).
- `recall` — given meaning/context → produce the Chinese (typed pinyin/characters or spoken). **Production.**
- `reading` — see characters → produce pinyin with correct tones.
- `char` — recognise a single character's sound & meaning (taught through known words).
- `perceive` / `produce` — tone or sound discrimination / production.

### Facet unlocking (controls review load)

- Word introduced → `listening` + `meaning` active.
- `recall` activates after the first successful `meaning` or `listening` retrieval (usually same session).
- `reading` activates once `recall` has stability ≥ 2 days (tones are trained earlier through tone drills
  and `recall` answers typed in pinyin, which are tone-checked).
- `char` facet for a character activates when ≥ 1 word containing it has `meaning` stability ≥ 3 days.
- Grammar: `grammar` on introduction; `grammarProd` after first success.

## 3. Scheduling (FSRS)

- Library: `ts-fsrs` (FSRS-6), default parameters, `request_retention = 0.90` (setting: 0.80–0.95),
  `enable_fuzz = true`, maximum interval 365 days. Short-term learning steps handled by FSRS.
- One `SRSState` per (item, facet).
- Personal parameter optimisation from the review log is on the roadmap; review logs are stored in
  the format the optimiser needs.

### Rating policy (evidence → FSRS rating)

`rateOutcome()` in `lib/srs/rating.ts`:

| Evidence | Rating |
|----------|--------|
| Wrong, or "show answer", or gave up | Again (1) |
| Correct but used a hint/scaffold (word bank, first letter, replay > 2, pinyin shown when normally hidden), or tone-only error accepted as "close", or very slow (> 2.5× personal median RT for that format) | Hard (2) |
| Correct, normal speed | Good (3) |
| Correct, fast (< 0.6× median RT), production format, no scaffold | Easy (4) |
| Correct on **multiple choice** | Good at most, and only for recognition facets |

Other signals:

- **Lookup during reading** of an item whose `meaning` facet is active → Again on `meaning`
  (unless reviewed in the last 10 minutes — avoids double penalty).
- **Secondary evidence:** an exercise has one primary facet. If it also exercises another facet
  that is currently due (R < target), that facet receives the same rating (implicit review);
  otherwise only an exposure is logged.
- Exposures (seeing a known word in a story) are logged as events but are **not** reviews.

## 4. Mastery model

Per item, derived (never stored as permanent truth) from facet states at time *now*:

| Status | Rule (first match wins) |
|--------|-------------------------|
| `new` | no active facet has been reviewed |
| `at_risk` | status would be ≥ developing, but some active facet has R(now) < 0.70 |
| `mastered` | meaning S ≥ 30 d **and** recall S ≥ 21 d **and** (listening S ≥ 21 d if active) **and** ≥ 1 successful review at an interval ≥ 21 d |
| `strong` | meaning S ≥ 7 d **and** recall S ≥ 3 d |
| `developing` | max facet S ≥ 1 d |
| `learning` | otherwise |

Recognition-only items (recall never succeeded) are capped at `developing` — recognising 你好 is
not mastering it. (S = FSRS stability in days, R = retrievability.)

Item statistics tracked in `MasteryState`: encounters, correct/incorrect by facet, recognition
accuracy, production accuracy, listening accuracy, pronunciation score (rolling), median RT, last
confidence signal, contexts encountered (sentence ids), common mistakes, confusions (item ids).

## 5. Skill abilities (Elo)

Per skill `s ∈ {vocab, listening, reading, speaking, tones, pronunciation, grammar, characters}` a
rating θₛ on the content-difficulty scale *d* (0 ≈ first lesson, 1 ≈ end of unit 2, … ~10 ≈
upper-intermediate). For a non-SRS task of difficulty *d*:

```
P(correct) = 1 / (1 + exp(-(θ − d) · 1.7))
θ ← θ + K · (outcome − P),  K = max(0.08, 0.5 / (1 + n/20))
```

Content difficulty *d* is computed deterministically (unit level, sentence length, audio speed,
unknown-word share, scaffold level). Skill bands shown to the learner are coarse
(Starting · Beginner · Elementary · Pre-intermediate · Intermediate) with an uncertainty note when
n < 20 — no fake percentages.

## 6. Exercise types

| Type | Primary facet | Format difficulty k |
|------|---------------|---------------------|
| `intro` (word in a sentence, audio-first or text-first) | — (teaching) | — |
| `hanzi_to_meaning_mc` | meaning | 0.45 |
| `hanzi_to_meaning_typed` | meaning | 0.9 |
| `audio_to_meaning_mc` | listening | 0.55 |
| `audio_to_meaning_typed` | listening | 1.0 |
| `meaning_to_chinese_bank` (tiles) | recall | 0.7 |
| `meaning_to_chinese_typed` (pinyin or hanzi) | recall | 1.0 |
| `meaning_to_chinese_spoken` | recall (+ produce tone) | 1.15 |
| `picture_to_chinese` (emoji) | recall | 1.0 |
| `chinese_to_picture` | listening | 0.5 |
| `hanzi_to_pinyin` (typed with tones) | reading | 1.0 |
| `audio_to_pinyin` (dictation of syllables) | listening + reading | 1.1 |
| `dictation` (sentence → characters/pinyin) | listening | 1.2 |
| `tone_id` (hear → choose tone(s)) | tone perceive | 0.6 |
| `minimal_pair` (hear → which of two) | sound/tone perceive | 0.5 |
| `tone_production` (say → pitch analysis) | tone produce | 1.1 |
| `shadow` (repeat sentence) | speaking | 1.0 |
| `sentence_build` (order tiles) | grammarProd | 0.8 |
| `cloze` (fill blank, typed) | grammar / recall | 0.9 |
| `error_correction` | grammar | 1.0 |
| `dialogue_completion` | recall | 1.0 |
| `translate_to_chinese` (free) | grammarProd + recall | 1.3 |
| `listening_comprehension` (dialogue + question) | listening ability | — (Elo) |
| `reading_comprehension` / story | reading ability | — (Elo) |
| `contrast_drill` (from error bank) | the confused items | 1.0 |

Predicted success of an SRS exercise: `P = R(now) ^ k_format` (k < 1 → easier than recall from
memory alone). `k` per format is **re-calibrated per learner** from predicted-vs-actual outcomes
(meta-learning §11). Multiple choice is used only as scaffold when predicted typed success is low.

## 7. Session planner ("what is the highest-value thing to do next?")

`planSession(model, minutes, now)` — pure function returning blocks + rationale strings.

1. **Load:** due facets (R < target) sorted by priority = `(target − R) × importance`, importance =
   frequency band × learner-goal relevance × (1.5 if item is in a recurring error).
2. **Retention health:** first-review success rate of items introduced in the last 3 days.
3. **New-item budget:** `base = minutes / 4` (≈ 5 at 20 min), × 0 if retention health < 0.6,
   × 0.5 if < 0.75, × 0.5 if due backlog > 3× session capacity; × policy multiplier from
   meta-learning; capped by the learner's best batch size (default 8).
4. **Block weights** (normalised to the time budget):
   - tones/pronunciation: 0.25 in the first 14 days or if tone accuracy < 0.7, else 0.10; +0.1 if a
     tone-confusion pattern is open.
   - review: minutes needed for due items (≈ 12 s each), capped at 60 % of the session.
   - new: budget × 50 s.
   - listening: 0.15, +0.10 if θ_listening < θ_vocab − 0.5 or the learner asked for more listening.
   - speaking: 0.15 if a mic is available, +0.10 if θ_speaking lags.
   - input (story/dialogue): 0.10 once ≥ 30 words known and a text with ≥ 90 % coverage exists.
   - error drills: 0.10 if open recurring patterns exist.
   - learner focus requests ("more listening", topic boosts) multiply relevant weights by 1.5 for 7 days.
5. **Queue construction:** warm-up (2–3 tone items) → interleaved review + new (each new item:
   intro → immediate retrieval → re-test after 2–4 other exercises → end-of-session retest) →
   listening → speaking → input → error drills → closing retrieval of today's new items.
6. Each block carries a human-readable reason, e.g. *"Listening is lagging your vocabulary by about
   one level, so listening gets 25 % of today's session."* Shown in "Why this session?" and the debug view.

### In-session adaptation (`selector.ts`)

- Rolling success over the last 8 graded exercises:
  > 0.92 → scaffold level −1 (harder formats, faster audio, hide pinyin), allow +1 new item;
  < 0.65 → scaffold +1, insert an easier review, defer remaining new items.
- Format choice per exercise: pick the hardest format whose predicted P ≥ 0.75 (target band 0.75–0.90).
- An item failed twice in a session gets a different representation (contrast, mnemonic, breakdown)
  and is re-queued once; failed 3× → parked until next session (leech protection).
- "Too easy" / "too hard" commands shift the scaffold level persistently by ±1.

## 8. Error model ("error bank")

Deterministic classification of structured answers (`errors.ts`):

| Category | Detection |
|----------|-----------|
| `tone` | pinyin syllables match ignoring tone; tones differ (records expected→given tone pairs) |
| `pronunciation` | pitch analysis tone mismatch, or STT pinyin initial/final mismatch |
| `vocab_forgotten` | blank / "don't know" / unrelated answer on recall |
| `word_order` | same multiset of tokens, different order |
| `classifier` | difference is only a measure word (个/杯/块/本/张…) |
| `particle` | missing/extra 了/吗/呢/的/吧 |
| `similar_word` | substituted item is in the confusables list or shares the expected item's meaning field |
| `character_confusion` | same pinyin, different characters (homophone) or shared component |
| `listening_confusion` | listening exercise wrong where the chosen item differs by tone/initial/final only |
| `grammar` | other structural difference on grammar exercises |
| `other` | none of the above |

Pattern detection: group by (category, item) and confusion pairs (A↔B); **recurring** = ≥ 2
occurrences in 14 days. Recurring patterns spawn targeted drills (e.g. 是 vs 有 contrast sentences;
T2↔T3 discrimination sets). A pattern is **resolved** after 3 correct targeted drills on ≥ 2
different days. *(AI)* free-text and conversation errors are categorised by the AI into the same
categories, then pass through the same pattern detector.

## 9. Content validation

Curated data (`src/data/*`) is checked by `content/validate.ts` in the test suite:

1. Every pinyin syllable is a valid Mandarin syllable; tone count = syllable count = character count
   (with erhua/neutral exceptions explicitly listed).
2. Lexicon pinyin is cross-checked against `pinyin-pro`; mismatches must be listed in an explicit
   reviewed-exceptions table (e.g. polyphones in context).
3. Every curated sentence is pre-segmented and every token resolves to a lexicon entry (or a
   declared name/number/punctuation).
4. Sentence pinyin is **derived** from tokens; sandhi is computed by rule, never typed.
5. Grammar examples reference existing sentences; units reference existing items; no unit uses an
   item before it is introduced (prerequisite order check).

AI-generated content:

1. Segment → known/unknown classification → coverage. If coverage < target − 3 %, ask the model to
   simplify (naming the offending words) up to 2 times; else reject or show with a warning.
2. Pinyin is recomputed locally with `pinyin-pro`; the model's pinyin is ignored.
3. Words outside the curated lexicon may be shown with AI glosses labelled **unverified**, and can be
   added to practice only as `source: 'generated'`, `verified: false`.
4. Generated text is stored in `generated` with `validation` results and never merged into curated data.

## 10. Comprehensible input targeting

- Coverage = known tokens / content tokens (punctuation and declared names excluded); a token is
  "known" if its item status ≥ learning and `meaning` or `listening` R ≥ 0.5.
- Target coverage band 0.90–0.95 (configurable 0.85–0.98). The engine raises the target when
  story comprehension is ≥ 90 % and lowers it when < 60 %.
- Curated stories are offered in order of best fit; AI stories are generated from: known words
  (≤ 400 most stable), 3–6 "developing" target words, interest topic, and target length.

## 11. Meta-learning

Runs after each session on the event log. Each analysis has a minimum sample size and reports
effect size with a Bayesian probability (Beta posteriors, normal approximation). Insights are shown
only when n ≥ threshold **and** P(effect) ≥ 0.9.

| Analysis | Data | Policy adjusted |
|----------|------|-----------------|
| Intro modality (audio-first vs text-first, **randomised** 50/50 while exploring) | first-review success of items by intro arm | `introModality` preference (keeps 10 % exploration) |
| New-item batch size (randomised within ±2 of current cap) | next-day retention by batch bucket | `newItemCap` |
| Tone perception vs production gap | accuracy by facet | tone block weights |
| Format calibration | predicted P vs actual per format | `k_format` per learner |
| Time of day | retention by session hour bucket | suggestion only |
| Retention vs target | true retention over 30 days | suggests desired retention change |

## 12. Progress and honesty rules

- Vocabulary known ≈ Σ R(meaning) over active words (expected number recalled right now), shown
  rounded to a range; "words you can produce" = Σ R(recall).
- Characters recognised ≈ Σ R(char).
- Retention = success rate of reviews with elapsed ≥ 1 day, last 30 days, with n shown.
- Benchmarks use fixed item banks per level so results are comparable over time; comparisons always
  show the sample size ("18/25 sentences").
- No percentage is shown when n < 10; we show "not enough data yet".
