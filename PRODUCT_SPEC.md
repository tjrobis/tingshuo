# 听说 Tīngshuō — Product Spec

> Living document. Update when behaviour changes. Last updated: 2026-10-04.

## 1. Purpose

A private Mandarin teacher for one learner (English speaker, beginner) that remembers everything
practised, decides what to practise next, and optimises for one outcome:

**What Mandarin can the learner understand and produce spontaneously?**

Not lessons completed, XP, streaks, or taps.

## 2. North-star milestones (curriculum is designed backward from these)

| # | Milestone | How the app verifies it |
|---|-----------|-------------------------|
| M1 | Hold a basic **5-minute conversation** using language you genuinely understand (introductions, likes, plans, food, asking questions back, repairing breakdowns) | Complete the "First real conversation" scripted roleplay chain (or an AI conversation) of ≥ 5 min with ≤ 1 English hint and every core exchange answered |
| M2 | 10-minute conversation on familiar topics | AI or scripted conversation ≥ 10 min, ≥ 80 % of turns understood without English |
| M3 | Basic independent travel (transport, hotel, ordering, directions, emergencies) | Travel mission set passed |
| M4 | Basic social interaction (making friends, hobbies, texting, dating small talk) | Social mission set passed |
| M5 | 30-minute conversation | Long AI conversation |
| M6 | Understand increasingly natural speech | Listening benchmark at 1.0× natural speed ≥ 80 % |

## 3. Learner profile (initial)

- L1 English, beginner, goal: conversational Mandarin (Simplified characters, Mainland standard).
- Interests pre-selected: gaming, travel, food, relationships/dating, meeting people, school,
  outdoors, technology, everyday conversation, Chinese culture, living abroad.
- Interests only change **what content is about**, never the instructional method.
  "Learning styles" are deliberately **not** used to change pedagogy (no evidence they help).

## 4. Core experience

1. Open app → **Learn Now** is the primary action. One tap starts a session that the engine builds.
2. Session length presets: 5 / 10 / 20 (default) / 30 / 45 / custom minutes.
3. The session is a dynamic mix of: tone/pronunciation warm-up, due retrieval, new material
   (introduced in sentences), listening, speaking, reading/comprehensible input, targeted error drills.
   Proportions adapt to weaknesses — the plan and its reasons are visible ("Why this session?").
4. After every answer: immediate, specific feedback; mastery & scheduling update instantly.
5. Session summary → dashboard shows what changed and what's next.

Every exercise screen has: **I'm confused**, **Why am I learning this?**, audio replay, speed
control, pinyin toggle (per visibility setting), and a command box for natural-language requests
("too easy", "more listening", "stop showing pinyin so much"…).

## 5. Feature list and status

Status: ✅ built · 🟡 partial / limited · ⏳ planned (see ROADMAP.md). Nothing marked ✅ is a
placeholder; limited features say so in the UI.

| Area | Feature | Status |
|------|---------|--------|
| Onboarding | Questionnaire: name, goals, interests, intensity, session length, travel plans, pinyin preference, immersion level, privacy choices, optional AI provider | ✅ |
| Calibration | Short adaptive placement: tone perception, pinyin reading, vocab (verified by typing meaning, not self-report), characters, listening, optional mic calibration | ✅ |
| Engine | Facet-level FSRS scheduling, mastery model, Elo skill abilities, session planner with rationale, in-session difficulty adaptation | ✅ |
| Exercises | ~20 exercise types (see LEARNING_ENGINE.md §6); production favoured over multiple choice | ✅ |
| Pronunciation | Native (TTS) audio, record, local pitch analysis, per-syllable tone diagnosis, pitch contour plot, replay both, slow audio, tone-pair grid with per-pair tracking | ✅ (tone analysis is heuristic and needs tuning on real voices; intelligibility/segmental scoring waits for slice 6 transcription) |
| Listening | Audio→meaning/pinyin/characters, dictation, tone ID, minimal pairs, dialogue comprehension, 0.6×/0.75×/1×/1.15× speeds, voice rotation | ✅ |
| Input | Graded stories & dialogues, every word tappable (pinyin, meaning, audio, components, mastery, "practise this"), coverage-controlled AI stories | ✅ |
| Tutor | AI conversation partner with Learning / Conversation / Immersion / Roleplay / Challenge modes, constrained to known language; scripted offline roleplays when no AI is configured | ✅ (AI needs a provider) |
| Corrections | Post-conversation review (You said / More natural / Why), errors fed into the error bank | ✅ (AI) |
| Error bank | Categorised errors, recurring-pattern detection, contrastive drills (是/有 etc.), tone-confusion drills | ✅ |
| Dashboard | Skill bands, vocab estimates (Σ retrievability), characters, retention vs target, due count, minutes, conversation minutes, velocity, strongest/needs-work, today's priority | ✅ |
| Knowledge map | Mastery map by category with drill-down to item facets | ✅ |
| Benchmarks | Fixed-form periodic assessments with history comparisons and sample sizes | ✅ |
| Meta-learning | Randomised micro-experiments (intro modality, new-item batch size) + analyses with sample-size gates; adjusts policy | ✅ (needs weeks of data before conclusions appear) |
| Motivation | Streak, daily/weekly goal, capability-based achievements, no XP | ✅ |
| Missions | Real-world challenges with evaluation | ✅ |
| NL commands | Deterministic intent parser + optional AI fallback → persistent preferences | ✅ |
| Immersion | 5-level slider affecting UI language, tutor language ratio, English scaffolding | ✅ |
| Data | JSON backup/restore, CSV, Anki-compatible TSV export/import | ✅ |
| Offline | PWA; reviews, lessons, dictionary, progress offline | ✅ (TTS voice availability depends on device) |
| Debug | Hidden dashboard: learner model, SRS table, planner decisions, AI log, validation report | ✅ |
| Sync | Multi-device sync | ⏳ (export/import is the interim path) |
| STT | Speech-to-text for intelligibility/segmental feedback | ⏳ Slice 6: optional AI-provider transcription (works in iOS home-screen apps; browser STT does not, and sends audio to Google/Apple) |

## 6. Deliberate deviations from the original brief (and why)

1. **No XP at all.** XP invites farming easy items. Motivation comes from capability achievements,
   effortful-retrieval counts and real progress comparisons.
2. **Facet-level scheduling.** "Recognises 你好" and "can say nǐ hǎo from meaning" are separate
   memory traces with separate FSRS states. Mastery requires production.
3. **Speech recognition is optional, pitch analysis is core.** iOS home-screen web apps cannot use
   the Web Speech recognition API, and browser STT sends audio to Google/Apple. Local pitch
   analysis is private, free, offline, and is what tone feedback actually needs.
4. **Sentence pinyin is never hand-typed.** It is derived from the validated lexicon + segmentation,
   removing a whole class of content errors; tone sandhi is computed by rule.
5. **Self-experimentation instead of guesses.** The meta-learning engine randomly varies safe
   parameters (e.g. audio-first vs text-first introduction) so its conclusions are causal, not
   anecdotal, and only reports them past a sample-size threshold.
6. **Placement verifies knowledge** (type the meaning) instead of "do you know this word?" self-report.
7. **"Mastered" is never permanent.** It is derived from current stability/retrievability and can
   fall back to "At risk".
8. **Emoji as pictures** for picture↔Chinese exercises: zero cost, offline, universally rendered.

## 7. Non-goals (for now)

Handwriting practice, Traditional characters, Cantonese, social features, leaderboards.

## 8. Success metrics the app tracks about itself

- True retention on reviews vs target (default 90 %).
- Listening benchmark trend at natural speed.
- Production estimate (Σ R on recall facets) growth per week.
- Conversation minutes and milestone completion.
- Calibration: predicted vs actual accuracy (are difficulty predictions honest?).
