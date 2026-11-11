# Roadmap

> Living document. Update the status column as work lands. Last updated: 2026-10-04.

## Implementation plan (vertical slices)

Each slice ends with: tests → typecheck → lint → build → fix.

| # | Slice | Contents | Status |
|---|-------|----------|--------|
| 0 | Foundations | Docs, scaffold (Vite/React/TS/Tailwind/PWA/Vitest/ESLint), icons, CSP | ✅ |
| 1 | Language core | `lib/pinyin.ts` (syllables, marks, parsing any input format, sandhi, grading with initial/final/tone feedback), `lib/segment.ts` (ICU + lexicon segmentation, coverage); 26 tests | ✅ |
| 2 | Engine core | `srs.ts`, `learner.ts`, `grade.ts`, `planner.ts`: FSRS + rating policy, mastery, facet unlocking, Elo abilities, grading, error classification & patterns, session planner, format choice, scaffold adaptation, progress metrics; 71 tests total | ✅ |
| 3 | Seed curriculum | 12 units (M1 by unit 11): 215 words, 187 sentences, 51 grammar points, 71 characters, 9 tone sets, 13 sound pairs; validation tests (pinyin-pro cross-check, unit ordering, every word in a sentence, all 20 tone pairs covered) | ✅ |
| 4 | **MVP loop** | Onboarding → placement (beginner fast path, tone ear check, adaptive vocab ladder) → Learn Now (planned, interleaved queue) → 16 exercise formats + intros → grading with feedback, overrides and help panels → FSRS/mastery/ability/error updates persisted atomically → summary → dashboard → next session. 114 tests incl. end-to-end loop simulation through IndexedDB; verified in the browser. | ✅ |
| 5 | Pronunciation & listening | `pitch.ts` (YIN pitch tracking, per-syllable tone diagnosis against sandhi tones, actionable feedback, rhythm, voice-range learning), `audio.ts` (voices, speed, speaker variety, recording), recorder with pitch-contour plot and replay of both, tone production + shadowing + spoken recall in sessions, 9 validated listening dialogues, Pronunciation trainer (tone-pair grid with per-pair accuracy, single tones, sound pairs with tips), Settings (voice, speed, pinyin, goal, microphone test). 134 tests. | ✅ |
| 6 | AI layer & tutor | `ai.ts` (Claude via the official SDK, OpenAI, Gemini, any OpenAI-compatible endpoint incl. local Ollama; keys on device only), `tutor.ts` (prompts from the learner model, defensive parsing, unknown-word check with one rewrite, locally computed pinyin, corrections → error bank, AI "explain it another way", request log without keys), Talk screen (5 modes, 16 scenarios, inline or end-of-conversation corrections, review), offline roleplay from the dialogues, AI settings with consent and connection test, opt-in browser speech recognition for voice chat and clarity scores. 148 tests; full tutor flow verified in the browser against a mock local model. | ✅ |
| 7 | Comprehensible input | 12 graded stories (units 1–12, machine-checked: lexicon words only, labelled with the unit they need), Read screen ordered by fit, reader with every word tappable (pinyin, meaning, audio, character components, how well it's known, "practise this"), fading ruby pinyin, read-aloud, English per paragraph, comprehension questions; lookups count as forgetting (§3); stories in longer sessions; AI stories written to the coverage target, checked on the device with one rewrite, stored with their report; tutor replies and roleplay lines tappable too. 160 tests; reader, sessions and AI stories verified in the browser (mock local model). | ✅ |
| 8 | Analytics & personalisation | Progress screen: capability achievements (unit goals, M1, words recognised/said, stories, conversation, missions, a fixed recurring mistake; unlock dates stored), fixed-form benchmarks A/B/C with per-skill history comparison, meta-learning (intro modality, batch size with a ±1 daily experiment, tone hearing vs saying, per-format calibration applied to format choice, time of day, retention vs target; P ≥ 0.9 and n ≥ 15 per arm before anything is reported), knowledge map with per-facet drill-down. 9 missions (tutor-checked or self-reported). Plain-English commands with an optional AI fallback restricted to the same commands. Immersion slider (tutor language, translations, button labels), memory-target setting. 178 tests; all of it checked in the browser. | ✅ |
| 9 | Data & ops | JSON backup/restore (all learner tables; never API keys; recordings and AI log stay on the device), CSV and Anki exports of taught words, importing a word list (Anki/CSV/text) as already known (course words only), monthly backup reminder, erase everything, Diagnostics screen (integrity check, storage and eviction status, planner input and decisions, memory-card table, error patterns, meta-learning, AI request log, AI-story validation). Files go through the iPhone share sheet (Files, iCloud Drive, AirDrop). CSP (slice 6) and the iOS install hint (slice 8) were already in place. 184 tests; all flows checked in the browser at 440×956. | ✅ |

## After the MVP

| Priority | Item | Notes |
|----------|------|-------|
| High | Personal FSRS parameter optimisation | Needs ~1,000 reviews; use the FSRS optimiser (WASM) on the stored review log. |
| High | Units 15–30 | Toward M2–M4: past experiences (过), comparisons (比), 把, resultative complements, travel/emergency sets. |
| High | Native-speaker audio for core items | Replace TTS for the ~300 core words with recorded audio (AudioAsset already abstracts source). |
| Medium | Optional sync | Self-hostable sync (e.g. CRDT over a tiny server) or file-based via iCloud Drive; keep local-first. |
| Medium | Full offline dictionary | Optional CC-CEDICT import (CC BY-SA), user-triggered. |
| Medium | Local STT | Whisper via transformers.js/WebGPU as an opt-in download for private intelligibility scoring. |
| Medium | In-browser LLM | WebLLM + small Qwen model for $0 offline tutor on capable devices. |
| Low | Handwriting (optional) | Only if the learner asks; stroke-order data from an open dataset. |
| Low | Traditional characters toggle | |

## Known limitations (kept honest)

- Tone diagnosis is heuristic pitch-contour analysis; it is reliable for clear isolated syllables and
  two-syllable words, less so for fast multi-syllable speech. Confidence is shown; low-confidence
  results fall back to self-assessment.
- Segmental (initial/final) pronunciation scoring requires STT (optional) — without it the app
  does not pretend to score it.
- TTS quality and voice variety depend on the device. iPhone voices are good; some desktop browsers
  have only one zh-CN voice.
- Frequency bands in the seed lexicon are approximate (author judgement informed by common
  frequency lists), not exact corpus ranks.
- Curated content was authored with AI assistance and machine-validated (pinyin cross-check,
  segmentation, coverage); a native-speaker review pass is recommended and tracked here.

## Changelog

- 2026-10-04 — Project started. Docs written.
- 2026-10-04 — Slice 0–1 done. Adopted ponytail engineering style: consolidated the pinyin library from 7 files to 1, replaced a hand-rolled bidirectional segmenter with native `Intl.Segmenter` + lexicon split, deleted unused helpers. Content validation (pinyin-pro cross-check) moves to slice 3 where curated data exists.
- 2026-10-04 — Slice 2 done (4 files instead of the ~10-module `engine/` sketch). Decisions: wrong tone = Again; patterns derived from the error log (no table); `ponytail-review` cut a scheduler cache, a renaming wrapper, an uncalled JSON reviver and a duplicate helper. Found that ts-fsrs silently returns NaN/Invalid Date for a corrupt card, so `review()` guards it. Slice 4 must not schedule `produce` facets without a microphone.
- 2026-10-05 — Slice 3 done, sized to milestone M1 (12 units, 215 words) instead of 14 units / 300. Stories, dialogues, roleplays and missions move to the slices that consume them (5–8); the hand-made confusables list was dropped because grading already records confused pairs. Slice 4: particles (pos `part`) should only get multiple-choice meaning exercises.
- 2026-10-05 — Slice 4 done: the app is usable end to end. Browser testing found and fixed: retries got *harder* after a miss (FSRS predicts ~100 % recall right after any review; learning facets now get the supportive format), sessions without a Chinese voice planned only ~2.5 of 10 minutes (idle time now goes to new items), the priority claimed "tones first" with no audio, and Chinese punctuation in pinyin. Not yet: secondary-facet evidence, alternative representation after two misses, persistent scaffold commands (slice 8).
- 2026-10-05 — Slice 5 done. Tests found two real problems: interest ordering put all seven pronouns first (no sentence readable for days), so new words are now ordered greedily by how many sentences they unlock (interests break ties); and a production drill activated with the mic on still ran after the mic was turned off. Speech-to-text intelligibility moved to slice 6 (AI provider transcription works in iPhone home-screen apps; browser STT does not and sends audio to Google/Apple). Tone templates in `pitch.ts` are hand-set and need tuning on real recordings.
- 2026-10-05 — Slice 6 done. Browser testing found a crash: an effect implicitly returned `scrollIntoView()`, which returns a Promise in current Chrome (effects with expression bodies are now avoided). A pinyin test exposed a segmentation bug: an unknown word containing a known character (熊猫 ∋ 猫) was split, overstating comprehension coverage; ICU words are now split only when every piece is a lexicon word. Claude requests enable server-side refusal fallback and low effort on current models; older models get a plain request.
- 2026-10-08 — Slice 7 done. Browser testing found: the browser's word segmenter splits names it doesn't know (李华 → 李 + 华), so AI stories counted a known name as two new words; pieces that together form a lexicon word are now rejoined. Ties between equally readable stories went to the easiest (unit 1 for a unit 7 learner); the most advanced now wins. Punctuation could start a line because each word is its own button; it is now glued to the word before. Chrome holds back a `<dialog>` close event while the page is hidden, so the word sheet closes itself instead of waiting for it. Lookups in the reader are rated Again per the spec, which also feeds "are recent words sticking?": five lookups of new words can pause new words for a day. Watch this with real use.
- 2026-11-11 — Slice 8 done. Browser testing found: the Home "Learn now" button had white text on white since slice 4 (a colour class in `className` lost to the variant's, decided by stylesheet order), so `Button` got an `inverse` variant and colours now come only from variants; a benchmark compared its result with itself (the live history already held it); overlapping achievement syncs (StrictMode) both tried to add the same rows, now one transaction. Insights and the planner policy are derived from history on read, so the planned `policy`/`insights` tables were dropped. Not yet: an alternative representation after two misses, secondary-facet evidence.
- 2026-11-11 — The target is now the learner's iPhone 16 Pro Max (iOS 26). iPhone pass: status bar style `default` with per-scheme `theme-color` (was the deprecated `black-translucent`, white text over the light theme), iOS novelty voices filtered out, no autocorrect on tutor/roleplay inputs, tutor input clear of the home indicator, install hint in Safari tabs, no tap highlight. Layout checked at 440×956 in light and dark. Still to check on the phone itself: status bar, voices, microphone.
- 2026-11-11 — Slice 9 done. Importing words from elsewhere only marks *course* words as known (seeded like placement, so they come back soon to check); others are listed but never added, so the trust model holds without a separate custom-vocabulary system. Backups replace rather than merge: merging two learners' histories has no single right answer. No Android/desktop install prompt: the target is an iPhone. Next: put the app on a free HTTPS host so it can be installed on the phone.
