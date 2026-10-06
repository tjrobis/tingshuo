import { describe, expect, it } from 'vitest';
import { analyzeTones, pitchTrack, updateSpeaker, type ExpectedSpeech, type Frame } from './pitch';
import { parseNumbered } from './pinyin';

const SR = 48_000;

/** A voice-like wave (fundamental + 2 harmonics) following an f0 curve. */
function wave(f0: (p: number) => number, seconds: number): Float32Array {
  const out = new Float32Array(Math.round(seconds * SR));
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    phase += (2 * Math.PI * f0(i / out.length)) / SR;
    out[i] = 0.5 * Math.sin(phase) + 0.25 * Math.sin(2 * phase) + 0.12 * Math.sin(3 * phase);
  }
  return out;
}

/** Pitch frames (10 ms) for syllables with given f0 shapes, separated by short silences. */
function frames(...syllables: { f0: (p: number) => number; ms?: number }[]): Frame[] {
  const out: Frame[] = [];
  let t = 0;
  const push = (hz: number | null, rms: number) => out.push({ t: (t += 0.01), hz, rms });
  for (let i = 0; i < 5; i++) push(null, 0.001);
  syllables.forEach(({ f0, ms = 220 }, k) => {
    const n = ms / 10;
    for (let i = 0; i < n; i++) push(f0(i / (n - 1)), 0.3);
    if (k < syllables.length - 1) for (let i = 0; i < 4; i++) push(null, 0.005);
  });
  for (let i = 0; i < 5; i++) push(null, 0.001);
  return out;
}

const lerp = (a: number, b: number) => (p: number) => a + (b - a) * p;
const dip = (a: number, low: number, b: number) => (p: number) => (p < 0.6 ? a + (low - a) * (p / 0.6) : low + (b - low) * ((p - 0.6) / 0.4));
// A male voice, 100–160 Hz.
const T = { 1: lerp(155, 154), 2: lerp(118, 157), 3: dip(118, 100, 124), 3.5: lerp(118, 100), 4: lerp(160, 104) } as const;
const speaker = { floorHz: 100, ceilHz: 160, n: 5 };
const expect_ = (pinyin: string, surface: number[]): ExpectedSpeech => ({
  syllables: parseNumbered(pinyin).map((s) => ({ base: s.base, tone: s.tone ?? 0 })),
  surface,
});

describe('pitchTrack (YIN)', () => {
  it('finds a steady 200 Hz voice', () => {
    const hz = pitchTrack(wave(() => 200, 0.8), SR).flatMap((f) => (f.hz ? [f.hz] : []));
    expect(hz.length).toBeGreaterThan(50);
    const median = hz.sort((a, b) => a - b)[hz.length >> 1];
    expect(median).toBeGreaterThan(197);
    expect(median).toBeLessThan(203);
  });

  it('follows a rising glide', () => {
    const hz = pitchTrack(wave(lerp(140, 240), 0.8), SR).flatMap((f) => (f.hz ? [f.hz] : []));
    const third = Math.floor(hz.length / 3);
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(avg(hz.slice(-third))).toBeGreaterThan(avg(hz.slice(0, third)) + 50);
  });

  it('treats silence as unvoiced', () => {
    expect(pitchTrack(new Float32Array(SR / 2), SR).every((f) => f.hz === null)).toBe(true);
  });
});

describe('analyzeTones', () => {
  it.each([[1, 'ma1'], [2, 'ma2'], [3, 'ma3'], [4, 'ma4']] as const)('recognises tone %i on its own, with and without a known voice range', (tone, p) => {
    for (const sp of [speaker, undefined]) {
      const a = analyzeTones(frames({ f0: T[tone] }), expect_(p, [tone]), sp);
      expect(a.ok).toBe(true);
      expect(a.syllables[0].detected, `${p} speaker=${!!sp}`).toBe(tone);
      expect(a.toneScore).toBe(1);
    }
  });

  it('accepts the low mid-phrase third tone (21) as a third tone', () => {
    const a = analyzeTones(frames({ f0: T[3.5] }, { f0: T[4] }), expect_('mi3 fan4', [3, 4]), speaker);
    expect(a.syllables.map((s) => s.detected)).toEqual([3, 4]);
  });

  it('gives actionable feedback, not just a score', () => {
    const a = analyzeTones(frames({ f0: T[2] }), expect_('mai4', [4]), speaker);
    expect(a.syllables[0].detected).toBe(2);
    expect(a.toneScore).toBe(0);
    expect(a.feedback[0]).toBe('mài: it rose: it should fall. It sounded like mái.');
  });

  it('judges 你好 against the sandhi tones it is really said with (ní hǎo)', () => {
    const right = analyzeTones(frames({ f0: T[2] }, { f0: T[3] }), expect_('ni3 hao3', [2, 3]), speaker);
    expect(right.toneScore).toBe(1);
    const literal = analyzeTones(frames({ f0: T[3.5] }, { f0: T[3] }), expect_('ni3 hao3', [2, 3]), speaker);
    expect(literal.syllables[0].detected).toBe(3);
    expect(literal.feedback[0]).toMatch(/^ní \(it's said as a 2nd tone here\)/);
  });

  it('flags a neutral tone that is not light and short', () => {
    const heavy = analyzeTones(frames({ f0: T[4] }, { f0: T[4], ms: 220 }), expect_('xie4 xie0', [4, 0]), speaker);
    expect(heavy.feedback.join(' ')).toMatch(/xie.*lighter and shorter/);
    expect(heavy.rhythmScore).toBeLessThan(1);
    const light = analyzeTones(frames({ f0: T[4] }, { f0: lerp(110, 105), ms: 110 }), expect_('xie4 xie0', [4, 0]), speaker);
    expect(light.rhythmScore).toBe(1);
    expect(light.toneScore).toBe(1);
  });

  it('refuses to judge when it could not hear a voice', () => {
    const a = analyzeTones(frames({ f0: T[1], ms: 30 }), expect_('ma1', [1]), speaker);
    expect(a.ok).toBe(false);
    expect(a.feedback[0]).toMatch(/couldn't hear/);
  });

  it('works end to end from audio samples', () => {
    const pcm = new Float32Array([...wave(T[2], 0.3), ...new Float32Array(SR * 0.05), ...wave(T[4], 0.3)]);
    const a = analyzeTones(pitchTrack(pcm, SR), expect_('xue2 xiao4', [2, 4]), speaker);
    expect(a.syllables.map((s) => s.detected)).toEqual([2, 4]);
  });
});

describe('updateSpeaker', () => {
  it('learns the voice range gradually and ignores too-short attempts', () => {
    const f = frames({ f0: lerp(100, 160), ms: 400 });
    const first = updateSpeaker(undefined, f)!;
    expect(first.n).toBe(1);
    expect(first.floorHz).toBeLessThan(110);
    const second = updateSpeaker({ floorHz: 80, ceilHz: 200, n: 4 }, f)!;
    expect(second.floorHz).toBeGreaterThan(80);
    expect(second.ceilHz).toBeLessThan(200);
    expect(updateSpeaker(first, frames({ f0: lerp(100, 160), ms: 50 }))).toBe(first);
  });
});
