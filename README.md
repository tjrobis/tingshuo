# 听说 Tīngshuō

A personal, adaptive Mandarin teacher that runs entirely on your phone: it schedules reviews with FSRS,
tracks what you can recognise vs produce, trains tones with on-device pitch analysis, and plans each
session from what you actually know. AI (your own provider and key) is optional.

## Install on iPhone

Open the GitHub Pages URL in Safari → Share → **Add to Home Screen**. It then runs full screen and
offline, and your progress stays on the phone (Settings → Your data → Back up to save a copy).

## Develop

```bash
npm install
npm run dev     # local dev server
npm run check   # typecheck, lint, tests, build
```

Pushing to `main` runs the checks and publishes to GitHub Pages.

Design docs: [PRODUCT_SPEC](PRODUCT_SPEC.md) · [ARCHITECTURE](ARCHITECTURE.md) ·
[LEARNING_ENGINE](LEARNING_ENGINE.md) · [DATABASE_SCHEMA](DATABASE_SCHEMA.md) · [ROADMAP](ROADMAP.md)
