# Roadmap

> Living document. Update the status column as work lands. Last updated: 2026-10-04.

## Implementation plan (vertical slices)

Each slice ends with: tests → typecheck → lint → build → fix.

| # | Slice | Contents | Status |
|---|-------|----------|--------|
| 0 | Foundations | Docs, scaffold (Vite/React/TS/Tailwind/PWA/Vitest/ESLint), icons, CSP | ✅ |
| 1 | Language core | `lib/pinyin.ts` (syllables, marks, parsing any input format, sandhi, grading with initial/final/tone feedback), `lib/segment.ts` (ICU + lexicon segmentation, coverage); 26 tests | ✅ |
| 2 | Engine core | FSRS wrapper + rating policy, mastery, Elo abilities, answer evaluation, error classification, planner, selector, progress metrics | ⏳ |
| 3 | Seed curriculum | Units 1–14 (~300 words, chunks, ~25 grammar patterns, sentences, dialogues, stories, tones, confusables) + validation tests | ⏳ |
| 4 | **MVP loop** | DB, onboarding → calibration → Learn Now session → exercises → evaluation → mastery/SRS update → dashboard → next session | ⏳ |
| 5 | Pronunciation & listening | TTS voice ranking/speeds, recorder, YIN pitch, tone diagnosis, contour plot, tone-pair grid, listening exercise family | ⏳ |
| 6 | AI layer & tutor | Provider abstraction (Anthropic SDK, OpenAI, Gemini, OpenAI-compatible), tutor modes, scripted offline roleplays, conversation review → error bank | ⏳ |
| 7 | Comprehensible input | Reader with tappable words, curated stories, AI stories with coverage validation | ⏳ |
| 8 | Analytics & personalisation | Knowledge map, error-pattern drills, benchmarks, meta-learning, achievements, missions, NL commands, immersion levels | ⏳ |
| 9 | Data & ops | Export/import (JSON/CSV/Anki TSV), debug dashboard, CSP, install prompt, persistence | ⏳ |

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
