import { useEffect, useRef, useState } from 'react';
import { listen, micSupported, playBlob, startRecording, sttSupported, type Recording } from '../lib/audio';
import { charOverlap } from '../lib/grade';
import { markSyllable } from '../lib/pinyin';
import { analyzeTones, pitchTrack, toneShape, type ExpectedSpeech, type Frame, type Speaker, type ToneAnalysis } from '../lib/pitch';
import { Button, Speak } from './ui';

export interface Spoken {
  analysis: ToneAnalysis;
  frames: Frame[];
  recording: Recording;
  /** What speech recognition heard (only when the learner opted in). */
  heard?: string;
  /** Share of the expected characters recognised: a proxy for how intelligible it was. */
  clarity?: number;
}

/** Tap to record, tap to stop (auto-stops). Analysis runs on the device. */
export function Recorder({ expected, speaker, onDone, stt, text }: {
  expected: ExpectedSpeech; speaker?: Speaker; onDone: (r: Spoken) => void; stt?: boolean; text?: string;
}) {
  const [state, setState] = useState<'idle' | 'recording' | 'working'>('idle');
  const [error, setError] = useState('');
  const handle = useRef<Awaited<ReturnType<typeof startRecording>> | undefined>(undefined);
  const timer = useRef<number | undefined>(undefined);
  const recognizer = useRef<ReturnType<typeof listen> | undefined>(undefined);

  useEffect(() => () => {
    clearTimeout(timer.current);
    void handle.current?.stop().catch(() => undefined);
  }, []);

  async function start() {
    setError('');
    try {
      handle.current = await startRecording();
      recognizer.current = stt && sttSupported() ? listen() : undefined;
      setState('recording');
      timer.current = window.setTimeout(() => void stop(), 1500 + 700 * expected.syllables.length);
    } catch {
      setError('No microphone access. Allow the microphone for this site in your browser settings, then try again.');
    }
  }

  async function stop() {
    clearTimeout(timer.current);
    const h = handle.current;
    handle.current = undefined;
    const r = recognizer.current;
    recognizer.current = undefined;
    r?.stop();
    if (!h) return;
    setState('working');
    try {
      const recording = await h.stop();
      const frames = pitchTrack(recording.pcm, recording.sampleRate);
      const heard = r ? await Promise.race([r.heard, new Promise<string>((ok) => setTimeout(() => ok(''), 2000))]) : undefined;
      onDone({ analysis: analyzeTones(frames, expected, speaker), frames, recording, heard, clarity: heard !== undefined && text ? charOverlap(text, heard) : undefined });
    } catch {
      setError("Couldn't read that recording. Try again.");
    }
    setState('idle');
  }

  if (!micSupported()) return <p className="text-center text-sm text-slate-500">This browser can't record audio.</p>;
  const recording = state === 'recording';
  return (
    <div className="flex flex-col items-center gap-2 py-2">
      <button
        type="button"
        onClick={() => void (recording ? stop() : start())}
        disabled={state === 'working'}
        aria-label={recording ? 'Stop recording' : 'Start recording'}
        className={`grid size-20 place-items-center rounded-full text-white shadow-lg transition ${recording ? 'animate-pulse bg-rose-600' : 'bg-indigo-600 hover:bg-indigo-500'} disabled:opacity-50`}
      >
        {recording
          ? <span className="size-6 rounded-sm bg-white" />
          : <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v5" /></svg>}
      </button>
      <p className="text-sm text-slate-500">{recording ? 'Speak now. Tap to stop.' : state === 'working' ? 'Listening back…' : 'Tap, then say it'}</p>
      {error && <p className="text-center text-sm text-rose-600">{error}</p>}
    </div>
  );
}

/** Learner pitch (solid) over the target tone shapes (dashed), one segment per syllable. */
export function ContourPlot({ analysis }: { analysis: ToneAnalysis }) {
  const [W, H, pad, label] = [320, 130, 10, 18];
  const end = Math.max(0.3, analysis.contour.at(-1)?.t ?? 0.3, ...analysis.syllables.map((s) => s.end));
  const x = (t: number) => pad + (t / end) * (W - 2 * pad);
  const y = (level: number) => pad + ((5.5 - Math.max(0.5, Math.min(5.5, level))) / 5) * (H - pad - label);
  const runs: { t: number; level: number }[][] = [[]];
  for (const p of analysis.contour) {
    if (p.level === null) runs.push([]);
    else runs[runs.length - 1].push({ t: p.t, level: p.level });
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Your pitch (solid) compared with the target tones (dashed)">
      {[1, 3, 5].map((l) => <line key={l} x1={pad} x2={W - pad} y1={y(l)} y2={y(l)} className="stroke-slate-200 dark:stroke-slate-800" />)}
      {analysis.syllables.map((s, i) => {
        const shape = s.expected ? toneShape(s.expected) : undefined;
        const [a, b] = [x(s.start), x(Math.max(s.end, s.start + 0.05))];
        const color = s.detected === null ? 'fill-slate-500' : s.detected === s.expected ? 'fill-emerald-600' : 'fill-rose-600';
        return (
          <g key={i}>
            {shape && (
              <polyline fill="none" strokeDasharray="4 4" strokeWidth="2" className="stroke-slate-400"
                points={shape.map((lv, k) => `${a + ((b - a) * k) / (shape.length - 1)},${y(lv)}`).join(' ')} />
            )}
            <text x={(a + b) / 2} y={H - 4} textAnchor="middle" fontSize="13" className={color}>{markSyllable(s.base, s.expected)}</text>
          </g>
        );
      })}
      {runs.filter((r) => r.length > 1).map((r, i) => (
        <polyline key={i} fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="stroke-indigo-600 dark:stroke-indigo-400"
          points={r.map((p) => `${x(p.t)},${y(p.level)}`).join(' ')} />
      ))}
    </svg>
  );
}

/** Scores, per-syllable advice, the plot, and both recordings side by side. */
export function SpeechReview({ spoken, native }: { spoken: Spoken; native: string }) {
  const a = spoken.analysis;
  const toned = a.syllables.filter((s) => s.detected !== null);
  return (
    <div className="flex flex-col gap-2">
      {a.ok && <ContourPlot analysis={a} />}
      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        <div><div className="font-semibold">{a.toneScore === null ? '–' : `${toned.filter((s) => s.detected === s.expected).length}/${toned.length}`}</div><div className="text-slate-500">tones</div></div>
        <div><div className="font-semibold">{a.rhythmScore === null ? '–' : a.rhythmScore >= 0.99 ? 'Good' : 'Check'}</div><div className="text-slate-500">rhythm</div></div>
        <div><div className="font-semibold">{spoken.clarity === undefined ? '–' : `${Math.round(spoken.clarity * 100)}%`}</div><div className="text-slate-500">{spoken.clarity === undefined ? 'clarity: not measured' : 'clarity'}</div></div>
      </div>
      {spoken.heard !== undefined && <p className="text-sm text-slate-500">Speech recognition heard: {spoken.heard || '(nothing)'}</p>}
      {a.feedback.map((f) => <p key={f} className="text-sm">{f}</p>)}
      {a.ok && a.confidence < 0.3 && <p className="text-xs text-slate-500">Low confidence: background noise or a quiet voice makes pitch hard to read.</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" className="px-3 py-2 text-sm" onClick={() => playBlob(spoken.recording.blob)}>▶ Me</Button>
        <span className="text-sm text-slate-500">Model:</span>
        <Speak text={native} slow />
      </div>
    </div>
  );
}
