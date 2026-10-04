import { describe, expect, it } from 'vitest';
import { createEmptyCard as newCard, rate, Rating, retrievability, review, State, type Card } from './srs';

const t0 = new Date('2026-10-01T09:00:00Z');
const DAY = 86_400_000;

/** Review at each due date with the same grade; returns the cards after each review. */
function drill(grade: Rating.Again | Rating.Hard | Rating.Good | Rating.Easy, times: number): Card[] {
  const out: Card[] = [];
  let card = newCard(t0);
  let now = t0;
  for (let i = 0; i < times; i++) {
    card = review(card, grade, now).card;
    out.push(card);
    now = card.due;
  }
  return out;
}

describe('FSRS scheduling', () => {
  it('spaces successful reviews further and further apart', () => {
    const cards = drill(Rating.Good, 6);
    const intervals = cards.slice(1).map((c, i) => c.due.getTime() - cards[i].due.getTime());
    for (let i = 1; i < intervals.length; i++) expect(intervals[i]).toBeGreaterThan(intervals[i - 1]);
    expect(cards.at(-1)!.state).toBe(State.Review);
    expect(cards.at(-1)!.stability).toBeGreaterThan(cards[1].stability);
  });

  it('brings a forgotten item back sooner than a remembered one', () => {
    const base = drill(Rating.Good, 4).at(-1)!;
    const again = review(base, Rating.Again, base.due).card;
    const good = review(base, Rating.Good, base.due).card;
    expect(again.due.getTime()).toBeLessThan(good.due.getTime());
    expect(again.lapses).toBe(base.lapses + 1);
    expect(again.stability).toBeLessThan(base.stability);
  });

  it('schedules a review for when recall probability has fallen to about the target', () => {
    const c = drill(Rating.Good, 5).at(-1)!;
    expect(retrievability(c, c.due)).toBeGreaterThan(0.85);
    expect(retrievability(c, c.due)).toBeLessThan(0.95);
  });

  it('retrievability: 0 when never seen, ~1 just after review, decays with time', () => {
    const fresh = newCard(t0);
    expect(retrievability(fresh, t0)).toBe(0);
    const c = drill(Rating.Good, 3).at(-1)!;
    const at = (days: number) => retrievability(c, new Date(c.last_review!.getTime() + days * DAY));
    expect(at(0)).toBeCloseTo(1, 2);
    expect(at(5)).toBeGreaterThan(at(30));
    expect(at(30)).toBeGreaterThan(at(300));
  });

  it('is deterministic, so history can be replayed exactly', () => {
    expect(drill(Rating.Good, 5)).toEqual(drill(Rating.Good, 5));
  });

  it('refuses to produce a corrupt card (ts-fsrs alone returns NaN stability and an Invalid Date)', () => {
    const corrupt = { ...drill(Rating.Good, 3).at(-1)!, stability: Number.NaN };
    expect(() => review(corrupt, Rating.Good, corrupt.due)).toThrow(/invalid card/);
  });
});

describe('rate (evidence → grade)', () => {
  it('maps outcomes per the rating policy', () => {
    expect(rate({ correct: false })).toBe(Rating.Again);
    expect(rate({ correct: true, assisted: true })).toBe(Rating.Hard);
    expect(rate({ correct: true, close: true })).toBe(Rating.Hard);
    expect(rate({ correct: true, rtMs: 9000, medianRtMs: 3000 })).toBe(Rating.Hard);
    expect(rate({ correct: true, rtMs: 3000, medianRtMs: 3000 })).toBe(Rating.Good);
    expect(rate({ correct: true, rtMs: 1000, medianRtMs: 3000 })).toBe(Rating.Easy);
  });

  it('never rates a fast multiple-choice pick as Easy', () => {
    expect(rate({ correct: true, recognition: true, rtMs: 500, medianRtMs: 3000 })).toBe(Rating.Good);
  });
});
