// Spaced repetition: FSRS-6 via ts-fsrs, plus the policy that turns exercise evidence into a grade.

import { createEmptyCard, fsrs, Rating, State, type Card, type FSRS, type Grade, type ReviewLog } from 'ts-fsrs';

export { createEmptyCard, Rating, State, type Card, type Grade };

const schedulers: Record<number, FSRS> = {};
const scheduler = (retention: number) =>
  (schedulers[retention] ??= fsrs({ request_retention: retention, maximum_interval: 365, enable_fuzz: true }));

/** Apply a grade. Throws rather than ever persisting a corrupt card. */
export function review(card: Card, grade: Grade, now: Date, retention = 0.9): { card: Card; log: ReviewLog } {
  const result = scheduler(retention).next(card, now, grade);
  const c = result.card;
  if (!(c.stability > 0) || !Number.isFinite(c.difficulty) || Number.isNaN(c.due.getTime())) {
    throw new Error(`FSRS produced an invalid card: ${JSON.stringify(c)}`);
  }
  return result;
}

/** Probability of recall right now; 0 for a card never reviewed. */
export const retrievability = (card: Card, now: Date): number =>
  card.state === State.New ? 0 : scheduler(0.9).get_retrievability(card, now, false);

export interface Evidence {
  correct: boolean;
  /** Near miss: typo, missing tones, or the learner gave up partway. */
  close?: boolean;
  /** Any scaffold the learner normally wouldn't get: hint, word bank, revealed pinyin, extra replays. */
  assisted?: boolean;
  /** Recognition format (multiple choice, picture pick): a correct answer is worth Good at most. */
  recognition?: boolean;
  rtMs?: number;
  /** The learner's median response time for this format. */
  medianRtMs?: number;
}

/** LEARNING_ENGINE.md §3 rating policy. Wrong tone = wrong word, so it arrives here as incorrect. */
export function rate(e: Evidence): Grade {
  if (!e.correct) return Rating.Again;
  if (e.close || e.assisted) return Rating.Hard;
  const speed = e.rtMs && e.medianRtMs ? e.rtMs / e.medianRtMs : 1;
  if (speed > 2.5) return Rating.Hard;
  if (speed < 0.6 && !e.recognition) return Rating.Easy;
  return Rating.Good;
}
