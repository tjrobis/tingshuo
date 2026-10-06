// Pitch tracking (YIN) and tone diagnosis. Pure functions on PCM samples: runs on the device,
// no audio leaves it. LEARNING_ENGINE.md §6 (tone production) and PRODUCT_SPEC pronunciation trainer.

import { formatNumbered, markSyllable, toneName } from './pinyin';
import type { PronunciationAttempt } from './types';

export interface Frame {
  t: number; // seconds
  hz: number | null; // null = unvoiced / silent
  rms: number;
}

const RATE = 16_000;

/** Box-filter decimation to 16 kHz: plenty for voice pitch (≤ 500 Hz) and 3× less work. */
export function downsample(pcm: Float32Array, from: number): Float32Array {
  if (from <= RATE) return pcm;
  const ratio = from / RATE;
  const out = new Float32Array(Math.floor(pcm.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const a = Math.floor(i * ratio);
    const b = Math.max(a + 1, Math.floor((i + 1) * ratio));
    let s = 0;
    for (let k = a; k < b; k++) s += pcm[k];
    out[i] = s / (b - a);
  }
  return out;
}

/** YIN (de Cheveigné & Kawahara 2002): fundamental frequency of one frame, or null if unclear. */
export function yin(frame: Float32Array, sr: number, minHz = 65, maxHz = 500, threshold = 0.2): { hz: number; clarity: number } | null {
  const tMin = Math.floor(sr / maxHz);
  const tMax = Math.min(Math.floor(sr / minHz), Math.floor(frame.length / 2));
  const w = frame.length - tMax;
  const cmnd = new Float32Array(tMax + 2).fill(1);
  let running = 0;
  for (let tau = 1; tau <= tMax; tau++) {
    let d = 0;
    for (let i = 0; i < w; i++) {
      const x = frame[i] - frame[i + tau];
      d += x * x;
    }
    running += d;
    cmnd[tau] = running ? (d * tau) / running : 1;
  }
  let tau = tMin;
  while (tau <= tMax && cmnd[tau] >= threshold) tau++;
  if (tau > tMax) return null;
  while (tau < tMax && cmnd[tau + 1] < cmnd[tau]) tau++;
  const [a, b, c] = [cmnd[tau - 1], cmnd[tau], cmnd[tau + 1]];
  const shift = (a - c) / (2 * (a - 2 * b + c));
  return { hz: sr / (tau + (Math.abs(shift) < 1 ? shift : 0)), clarity: 1 - b };
}

/** Pitch every 10 ms over 40 ms windows, with an energy gate and octave-jump repair. */
export function pitchTrack(pcm: Float32Array, sampleRate: number): Frame[] {
  const x = downsample(pcm, sampleRate);
  const sr = Math.min(sampleRate, RATE);
  const size = Math.round(0.04 * sr);
  const hop = Math.round(0.01 * sr);
  const raw: { i: number; rms: number }[] = [];
  for (let i = 0; i + size <= x.length; i += hop) {
    let e = 0;
    for (let k = i; k < i + size; k++) e += x[k] * x[k];
    raw.push({ i, rms: Math.sqrt(e / size) });
  }
  const loud = Math.max(0, ...raw.map((r) => r.rms));
  const frames = raw.map(({ i, rms }) => {
    const p = rms > 0.1 * loud ? yin(x.subarray(i, i + size), sr) : null;
    return { t: i / sr, hz: p && p.clarity > 0.5 ? p.hz : null, rms };
  });
  // Octave errors: snap to within a factor of ~1.6 of the local median.
  return frames.map((f, k) => {
    if (f.hz === null) return f;
    const near = frames.slice(Math.max(0, k - 3), k + 4).flatMap((g) => (g.hz === null ? [] : [g.hz])).sort((a, b) => a - b);
    const med = near[near.length >> 1];
    const hz = f.hz > med * 1.6 ? f.hz / 2 : f.hz < med / 1.6 ? f.hz * 2 : f.hz;
    return { ...f, hz };
  });
}

// ───────────── Tone diagnosis ─────────────

export interface Speaker {
  floorHz: number;
  ceilHz: number;
  n: number; // utterances seen
}

export interface SyllableResult {
  base: string;
  expected: number; // pronounced (surface) tone
  detected: number | null; // null = neutral (not classified) or no clear voice
  confidence: number; // 0..1
  levels: number[]; // 5-point contour on the 1–5 (Chao) scale
  start: number;
  end: number;
  note?: string;
}

export interface ToneAnalysis {
  ok: boolean; // enough clear voice to judge
  syllables: SyllableResult[];
  toneScore: number | null; // share of toned syllables right
  rhythmScore: number | null;
  confidence: number;
  feedback: string[];
  contour: { t: number; level: number | null }[];
}

// Chao-scale templates (5 = top of the speaker's range). Third tone has two shapes: a full dip when
// it ends a phrase (214) and a low fall mid-phrase (21); either counts as a third tone.
// ponytail: hand-set templates and weights; tune them on real recordings (the calibration knob is here).
const TEMPLATES: Record<number, number[][]> = {
  1: [[4.6, 4.6, 4.6, 4.6, 4.6]],
  2: [[3, 3.1, 3.5, 4.1, 4.8]],
  3: [[2.6, 1.8, 1.2, 1.7, 2.8], [2.6, 1.9, 1.3, 1.1, 1]],
  4: [[4.9, 4.3, 3.4, 2.4, 1.4]],
};
const HEIGHT_WEIGHT = { known: 0.5, unknown: 0.15 }; // trust absolute height only once the voice range is known

const st = (hz: number) => 12 * Math.log2(hz);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const quantile = (xs: number[], q: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(q * xs.length))];

function resample(xs: number[], n: number): number[] {
  if (xs.length === 1) return Array(n).fill(xs[0]);
  return Array.from({ length: n }, (_, i) => {
    const p = (i * (xs.length - 1)) / (n - 1);
    const lo = Math.floor(p);
    return xs[lo] + (xs[Math.min(lo + 1, xs.length - 1)] - xs[lo]) * (p - lo);
  });
}

function distance(levels: number[], tpl: number[], heightWeight: number): number {
  const [ml, mt] = [mean(levels), mean(tpl)];
  const shape = Math.sqrt(mean(levels.map((x, i) => (x - ml - (tpl[i] - mt)) ** 2)));
  return shape + heightWeight * Math.abs(ml - mt);
}

const ADVICE: Record<number, Record<number, string>> = {
  1: { 2: 'it rose: keep it high and level', 3: 'it dropped low: start high and stay there', 4: 'it fell: keep it high and level' },
  2: { 1: 'it stayed flat: start mid and rise, like a surprised "huh?"', 3: 'it dipped low first: rise steadily instead', 4: 'it fell: it should rise' },
  3: { 1: 'it stayed high: drop low', 2: 'it rose: go low first (mid-phrase, just stay low)', 4: 'it fell from high: start mid and go low' },
  4: { 1: 'it stayed level: start high and drop sharply', 2: 'it rose: it should fall', 3: 'it dipped and came back up: just fall, sharply' },
};

export interface ExpectedSpeech {
  syllables: { base: string; tone: number }[]; // citation
  surface: number[]; // pronounced tones (after sandhi)
}

export function analyzeTones(frames: Frame[], expected: ExpectedSpeech, speaker?: Speaker): ToneAnalysis {
  const voicedIdx = frames.flatMap((f, i) => (f.hz === null ? [] : [i]));
  const n = expected.syllables.length;
  const empty: ToneAnalysis = { ok: false, syllables: [], toneScore: null, rhythmScore: null, confidence: 0, feedback: [], contour: [] };
  if (voicedIdx.length < Math.max(8, 5 * n)) {
    return { ...empty, feedback: ["I couldn't hear a clear voice. Try again a little closer to the microphone."] };
  }

  // Voice range: the learner's own once known, otherwise this utterance's (widened to ≥ 7 semitones).
  const known = !!speaker && speaker.n >= 3;
  const hzs = voicedIdx.map((i) => frames[i].hz!);
  let [floor, ceil] = known ? [speaker!.floorHz, speaker!.ceilHz] : [quantile(hzs, 0.1), quantile(hzs, 0.9)];
  if (ceil / floor < 1.5) {
    const gm = Math.sqrt(floor * ceil);
    [floor, ceil] = [gm / 1.225, gm * 1.225];
  }
  const level = (hz: number) => 1 + (4 * (st(hz) - st(floor))) / (st(ceil) - st(floor));

  // Syllable boundaries: duration-weighted split of the voiced span (neutral syllables are short),
  // each boundary nudged to the quietest frame nearby.
  // ponytail: no true syllable segmentation; good for 1–4 syllables spoken clearly, add onset
  // detection if longer sentences matter.
  const [first, last] = [voicedIdx[0], voicedIdx[voicedIdx.length - 1] + 1];
  const weights = expected.syllables.map((s) => (s.tone === 0 || s.base === 'r' ? 0.6 : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  const bounds = [first];
  let acc = 0;
  for (let i = 0; i < n - 1; i++) {
    acc += weights[i];
    const guess = Math.round(first + ((last - first) * acc) / total);
    const radius = Math.max(1, Math.round((0.25 * (last - first)) / n));
    let best = guess;
    for (let k = guess - radius; k <= guess + radius; k++) if (frames[k] && frames[k].rms < frames[best].rms) best = k;
    bounds.push(Math.max(bounds[bounds.length - 1] + 1, best));
  }
  bounds.push(last);

  const heightWeight = known ? HEIGHT_WEIGHT.known : HEIGHT_WEIGHT.unknown;
  const syllables: SyllableResult[] = expected.syllables.map((s, i) => {
    const seg = frames.slice(bounds[i], bounds[i + 1]);
    const lv = seg.flatMap((f) => (f.hz === null ? [] : [level(f.hz)]));
    const surface = expected.surface[i];
    const result: SyllableResult = { base: s.base, expected: surface, detected: null, confidence: 0, levels: lv.length ? resample(lv, 5) : [], start: frames[bounds[i]].t - frames[first].t, end: frames[bounds[i + 1] - 1].t - frames[first].t }; // seconds from the first voiced frame, like `contour`
    if (surface === 0 || s.base === 'r' || lv.length < 3) return result;
    const scores = [1, 2, 3, 4].map((t) => ({ t, d: Math.min(...TEMPLATES[t].map((tpl) => distance(result.levels, tpl, heightWeight))) })).sort((a, b) => a.d - b.d);
    result.detected = scores[0].t;
    result.confidence = Math.max(0, Math.min(1, (scores[1].d - scores[0].d) / (scores[1].d + 0.1)));
    const said = markSyllable(s.base, surface);
    const sandhi = surface !== s.tone ? ` (it's said as a ${toneName(surface)} here)` : '';
    if (result.detected !== surface) {
      result.note = `${said}${sandhi}: ${ADVICE[surface][result.detected]}. It sounded like ${markSyllable(s.base, result.detected)}.`;
    } else {
      const slope = result.levels[4] - result.levels[0];
      if (surface === 4 && slope > -2) result.note = `${said}: good. Make the fall sharper.`;
      if (surface === 2 && slope < 1) result.note = `${said}: good. Let it rise a little more.`;
      if (surface === 1 && Math.abs(slope) > 1.2) result.note = `${said}: good. Keep it flatter.`;
    }
    return result;
  });

  const toned = syllables.filter((s) => s.detected !== null);
  const toneScore = toned.length ? toned.filter((s) => s.detected === s.expected).length / toned.length : null;

  // Rhythm: neutral syllables should be light and short; a very slow pace breaks the flow.
  const feedback: string[] = [];
  let penalty = 0;
  const dur = syllables.map((s) => s.end - s.start);
  const fullDur = syllables.flatMap((s, i) => (s.expected === 0 ? [] : [dur[i]]));
  syllables.forEach((s, i) => {
    if (s.expected === 0 && fullDur.length && dur[i] > 0.9 * mean(fullDur)) {
      penalty += 0.3;
      feedback.push(`Make "${s.base}" lighter and shorter: it's a neutral tone.`);
    }
  });
  const seconds = frames[last - 1].t - frames[first].t;
  if (n >= 2 && n / Math.max(seconds, 0.01) < 1.6) {
    penalty += 0.2;
    feedback.push('A little slow: link the syllables together.');
  }

  const confidence = toned.length ? mean(toned.map((s) => s.confidence)) : 0;
  return {
    ok: true,
    syllables,
    toneScore,
    rhythmScore: n >= 2 ? Math.max(0, 1 - penalty) : null,
    confidence,
    feedback: [...syllables.flatMap((s) => (s.note ? [s.note] : [])), ...feedback],
    contour: frames.slice(first, last).map((f) => ({ t: f.t - frames[first].t, level: f.hz === null ? null : level(f.hz) })),
  };
}

/** Target contour for drawing (the phrase-final shape for the 3rd tone). */
export const toneShape = (tone: number): number[] | undefined => TEMPLATES[tone]?.[0];

/** The stored record of one spoken attempt. */
export function toAttempt(itemId: string, text: string, expected: ExpectedSpeech, a: ToneAnalysis, at: number): PronunciationAttempt {
  return {
    at, itemId, text,
    expectedPinyin: formatNumbered(expected.syllables),
    surfaceTones: expected.surface,
    detectedTones: a.syllables.map((s) => s.detected),
    confidences: a.syllables.map((s) => s.confidence),
    toneScore: a.toneScore,
    rhythmScore: a.rhythmScore,
    feedback: a.feedback,
    contour: a.contour.filter((_, i) => i % 3 === 0).map((p) => p.level ?? 0),
  };
}

/** Learn the learner's voice range slowly from every clear attempt (10th–90th percentile). */
// ponytail: range from whatever was said; single-tone drills bias it, more attempts wash that out.
export function updateSpeaker(prev: Speaker | undefined, frames: Frame[]): Speaker | undefined {
  const hzs = frames.flatMap((f) => (f.hz === null ? [] : [f.hz]));
  if (hzs.length < 20) return prev;
  const [lo, hi] = [quantile(hzs, 0.1), quantile(hzs, 0.9)];
  if (!prev) return { floorHz: lo, ceilHz: Math.max(hi, lo * 1.3), n: 1 };
  return { floorHz: prev.floorHz * 0.8 + lo * 0.2, ceilHz: prev.ceilHz * 0.8 + hi * 0.2, n: prev.n + 1 };
}
