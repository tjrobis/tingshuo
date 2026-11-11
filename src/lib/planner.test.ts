import { describe, expect, it } from 'vitest';
import { adaptScaffold, chooseFormat, planSession, type PlanInput } from './planner';

const now = new Date('2026-10-04T12:00:00').getTime();
const base: PlanInput = {
  minutes: 20, now, daysActive: 30, dueCount: 20, retentionHealth: 0.85, abilities: {}, toneAccuracy: 0.85,
  audio: true, micAvailable: true, knownWords: 120, inputAvailable: true, recurringPatterns: 0, toneConfusion: false,
  focus: [], newItemCap: 8, newAvailable: 50,
};
const plan = (p: Partial<PlanInput>) => planSession({ ...base, ...p });
const minutes = (pl: ReturnType<typeof planSession>, kind: string) => pl.blocks.find((b) => b.kind === kind)?.minutes ?? 0;
const total = (pl: ReturnType<typeof planSession>) => pl.blocks.reduce((s, b) => s + b.minutes, 0);

describe('planSession', () => {
  it('fills the requested time', () => {
    for (const m of [5, 10, 20, 45]) expect(total(plan({ minutes: m }))).toBeCloseTo(m, 0);
  });

  it('day one: new words and lots of tone work, no reviews', () => {
    const p = plan({ daysActive: 0, dueCount: 0, retentionHealth: null, toneAccuracy: null, knownWords: 0, inputAvailable: false });
    expect([p.reviews, p.newItems]).toEqual([0, 5]);
    expect(minutes(p, 'warmup')).toBeGreaterThan(minutes(p, 'listening'));
    expect(p.priority).toMatch(/Tones first/);
    expect(p.blocks.some((b) => b.kind === 'input')).toBe(false);
  });

  it('stops adding new words when recent ones are being forgotten', () => {
    const p = plan({ retentionHealth: 0.5 });
    expect(p.newItems).toBe(0);
    expect(p.priority).toMatch(/aren't sticking/);
    expect(p.rationale[0]).toMatch(/50%/);
    expect(plan({ retentionHealth: 0.7 }).newItems).toBeLessThan(plan({}).newItems);
  });

  it("doesn't let a review backlog swallow the session", () => {
    const p = plan({ dueCount: 500 });
    expect(minutes(p, 'review')).toBeCloseTo(12, 0); // 60% of 20
    expect(p.priority).toMatch(/piled up/);
    expect(p.blocks.find((b) => b.kind === 'review')!.reason).toMatch(/more wait/);
  });

  it('gives listening more time when it lags vocabulary (once there is enough evidence)', () => {
    const lagging = { vocab: { theta: 3, n: 50 }, listening: { theta: 1.5, n: 40 }, speaking: { theta: 3, n: 40 } };
    const p = plan({ abilities: lagging });
    expect(minutes(p, 'listening')).toBeGreaterThan(minutes(p, 'speaking'));
    expect(p.priority).toMatch(/listening/);
    expect(minutes(plan({ abilities: { ...lagging, listening: { theta: 1.5, n: 3 } } }), 'listening')).toBe(minutes(plan({}), 'listening'));
  });

  it('honours a "more listening" request until it expires', () => {
    const focus = [{ kind: 'skill' as const, key: 'listening', factor: 1.5, until: now + 1000 }];
    expect(minutes(plan({ focus }), 'listening')).toBeGreaterThan(minutes(plan({}), 'listening'));
    expect(minutes(plan({ focus: [{ ...focus[0], until: now - 1 }] }), 'listening')).toBe(minutes(plan({}), 'listening'));
  });

  it('skips speaking without a microphone and adds error drills for recurring mistakes', () => {
    expect(plan({ micAvailable: false }).blocks.some((b) => b.kind === 'speaking')).toBe(false);
    expect(plan({ recurringPatterns: 2 }).blocks.some((b) => b.kind === 'errors')).toBe(true);
  });
});

describe('chooseFormat', () => {
  it('scaffolds fresh items and stretches well-known ones', () => {
    expect(chooseFormat('recall', 0)).toBe('meaning_to_chinese_bank');
    expect(chooseFormat('recall', 0.99)).toBe('meaning_to_chinese_spoken');
    expect(chooseFormat('recall', 0.99, 0, {}, (id) => !id.endsWith('spoken'))).toBe('meaning_to_chinese_typed');
  });

  it('moves with the scaffold level and the learner calibration', () => {
    const R = 0.7; // typed predicts 0.7^0.9 ≈ 0.73, just under the 0.75 target
    expect(chooseFormat('meaning', R, 0)).toBe('hanzi_to_meaning_mc');
    expect(chooseFormat('meaning', R, -2)).toBe('hanzi_to_meaning_typed');
    expect(chooseFormat('meaning', R, 0, { hanzi_to_meaning_typed: 0.6 })).toBe('hanzi_to_meaning_typed');
  });
});

describe('adaptScaffold', () => {
  it('makes it harder after a streak of successes and easier after a run of failures', () => {
    expect(adaptScaffold(Array(8).fill(true), 0)).toBe(-1);
    expect(adaptScaffold([true, false, false, true, false, false, true, false], 0)).toBe(1);
    expect(adaptScaffold([true, true, false, true, true, false, true, true], 0)).toBe(0);
    expect(adaptScaffold(Array(8).fill(true), -2)).toBe(-2);
    expect(adaptScaffold([true, true], 0)).toBe(0);
  });
});

describe('planSession without a Chinese voice', () => {
  it('drops tone and listening time and never claims tones are the priority', () => {
    const p = plan({ audio: false, daysActive: 0 });
    expect(p.blocks.some((b) => b.kind === 'warmup' || b.kind === 'listening')).toBe(false);
    expect(p.priority).not.toMatch(/Tones/);
    expect(total(p)).toBeCloseTo(20, 0);
  });
});

describe('planSession when nothing else can use the time', () => {
  it('lets new items take it, within the cap and the retention gate', () => {
    const idle = { audio: false, micAvailable: false, inputAvailable: false, recurringPatterns: 0, dueCount: 0, retentionHealth: null };
    expect(plan(idle).newItems).toBe(8);
    expect(plan({ ...idle, retentionHealth: 0.5 }).newItems).toBe(0);
    expect(plan(idle).priority).toMatch(/8 new item/);
  });
  it('varies new words by ±1 for the batch-size experiment, never past the cap or when the gate says none', () => {
    const p = plan({ minutes: 20 });
    expect(plan({ minutes: 20, explore: 1 }).newItems).toBe(p.newItems + 1);
    expect(plan({ minutes: 20, explore: -1 }).newItems).toBe(p.newItems - 1);
    expect(plan({ minutes: 45, dueCount: 0, newItemCap: 8, explore: 1 }).newItems).toBe(8);
    expect(plan({ retentionHealth: 0.5, explore: 1 }).newItems).toBe(0);
  });

  it('"more tones" lengthens the warm-up', () => {
    const later = now + 86_400_000;
    expect(minutes(plan({ focus: [{ kind: 'skill', key: 'tones', factor: 1.5, until: later }] }), 'warmup')).toBeGreaterThan(minutes(plan({}), 'warmup'));
  });
});
