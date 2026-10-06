import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { micSupported, speak } from '../lib/audio';
import { soundPairs, targetFor, tonePairWords, toneSets } from '../lib/curriculum';
import { db, persist, savePronunciation } from '../lib/db';
import { speechTarget } from '../lib/exercise';
import { updateAbility } from '../lib/learner';
import { formatWord, markSyllable, parseNumbered } from '../lib/pinyin';
import { toAttempt, updateSpeaker, type ExpectedSpeech } from '../lib/pitch';
import type { LearnerState } from '../lib/session';
import type { PronunciationAttempt, UserProfile } from '../lib/types';
import { Recorder, SpeechReview, type Spoken } from './Recorder';
import { Button, Card, Label, Screen, Speak } from './ui';

const TONES = [1, 2, 3, 4];
const ORD = ['neutral', '1st', '2nd', '3rd', '4th'];

interface Drill {
  key: string; // "3-4" or "t3"
  zh: string;
  pinyin: string;
  en: string;
  expected: ExpectedSpeech;
}

/** Accuracy per citation-tone pattern ("3-4", or "3" for single syllables) from every attempt so far. */
function accuracy(attempts: PronunciationAttempt[]) {
  const by = new Map<string, { n: number; ok: number }>();
  for (const a of attempts) {
    const key = parseNumbered(a.expectedPinyin).map((s) => s.tone ?? 0).join('-');
    if (a.detectedTones.every((d) => d === null)) continue;
    const ok = a.detectedTones.every((d, i) => d === null || d === a.surfaceTones[i]);
    const cell = by.get(key) ?? { n: 0, ok: 0 };
    by.set(key, { n: cell.n + 1, ok: cell.ok + +ok });
  }
  return by;
}

const cellStyle = (c?: { n: number; ok: number }) =>
  !c ? 'bg-slate-100 text-slate-400 dark:bg-slate-800'
  : c.ok / c.n >= 0.8 ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100'
  : c.ok / c.n >= 0.5 ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100'
  : 'bg-rose-100 text-rose-900 dark:bg-rose-900/50 dark:text-rose-100';

export function Pronunciation({ state, audio, onProfile, onBack }: {
  state: LearnerState; audio: boolean; onProfile: (p: Partial<UserProfile>) => void; onBack: () => void;
}) {
  const attempts = useLiveQuery(() => db.pronunciation.toArray(), []) ?? [];
  const stats = accuracy(attempts);
  const [drill, setDrill] = useState<Drill>();
  const [spoken, setSpoken] = useState<Spoken>();

  function pick(key: string) {
    let next: Drill;
    if (key.startsWith('t')) {
      const n = Number(key.slice(1));
      const set = toneSets[Math.floor(Math.random() * toneSets.length)];
      next = { key, zh: set.chars[n - 1], pinyin: markSyllable(set.base, n), en: '', expected: { syllables: [{ base: set.base, tone: n }], surface: [n] } };
    } else {
      const options = tonePairWords().get(key) ?? [];
      const w = options[Math.floor(Math.random() * options.length)];
      next = { key, zh: w.hanzi, pinyin: formatWord(parseNumbered(w.pinyin)), en: w.meanings[0], expected: speechTarget(targetFor(w.id.slice(2))) };
    }
    setDrill(next);
    setSpoken(undefined);
    if (audio) void speak(next.zh);
  }

  function done(s: Spoken) {
    setSpoken(s);
    if (!drill || !s.analysis.ok) return;
    const now = Date.now();
    void savePronunciation(toAttempt(drill.key.startsWith('t') ? `t:${drill.key.slice(1)}` : `tp:${drill.key}`, drill.zh, drill.expected, s.analysis, now),
      { at: now, kind: 'learner', mime: s.recording.blob.type, blob: s.recording.blob, durationMs: s.recording.durationMs }, state.profile.privacy.keepRecordings);
    if (s.analysis.toneScore !== null) {
      const ability = updateAbility(state.abilities.get('pronunciation') ?? { skill: 'pronunciation', theta: 0, n: 0, updatedAt: 0 }, drill.key.startsWith('t') ? 0.5 : 1, s.analysis.toneScore === 1, now);
      state.abilities.set('pronunciation', ability);
      void persist({ abilities: [ability] });
    }
    const speaker = updateSpeaker(state.profile.speaker, s.frames);
    if (speaker !== state.profile.speaker || !state.profile.micAvailable) onProfile({ speaker, micAvailable: true });
  }

  return (
    <Screen>
      <header className="flex items-center gap-2 pt-4">
        <Button variant="ghost" className="px-3" onClick={drill ? () => setDrill(undefined) : onBack} aria-label="Back">←</Button>
        <h1 className="text-2xl font-semibold">Pronunciation</h1>
      </header>

      {drill ? (
        <>
          <Card className="flex flex-col items-center gap-2 py-6 text-center">
            <Label>{drill.key.startsWith('t') ? `${ORD[Number(drill.key.slice(1))]} tone` : `Tone pair ${drill.key.replace('-', '–')}`}</Label>
            <div className="text-6xl">{drill.zh}</div>
            <div className="text-slate-500">{drill.pinyin}{drill.en && ` · ${drill.en}`}</div>
            {audio && <Speak text={drill.zh} slow />}
          </Card>
          {micSupported() ? (
            spoken ? (
              <Card className="flex flex-col gap-3">
                <SpeechReview spoken={spoken} native={drill.zh} />
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="secondary" onClick={() => setSpoken(undefined)}>Try again</Button>
                  <Button onClick={() => pick(drill.key)}>Next word</Button>
                </div>
              </Card>
            ) : <Recorder expected={drill.expected} speaker={state.profile.speaker} onDone={done} />
          ) : <p className="text-center text-sm text-slate-500">This browser can't record audio; listen and repeat aloud instead.</p>}
        </>
      ) : (
        <>
          <Card className="flex flex-col gap-3">
            <Label>The four tones</Label>
            <div className="grid grid-cols-4 gap-2">
              {TONES.map((t) => {
                const c = stats.get(`${t}`);
                return (
                  <button key={t} type="button" onClick={() => pick(`t${t}`)} className={`rounded-2xl py-3 ${cellStyle(c)}`}>
                    <div className="text-xl">{markSyllable('ma', t)}</div>
                    <div className="text-xs">{c ? `${Math.round((c.ok / c.n) * 100)}% of ${c.n}` : 'not tried'}</div>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card className="flex flex-col gap-3">
            <Label>Tone pairs</Label>
            <p className="text-sm text-slate-500">Most words are two syllables, and tones change shape next to each other. Tap a pair to practise it; colours show how often you get it right.</p>
            <div className="grid grid-cols-[auto_repeat(5,1fr)] gap-1 text-center text-xs">
              <div />
              {[1, 2, 3, 4, 0].map((b) => <div key={b} className="py-1 text-slate-500">{b ? ORD[b] : 'light'}</div>)}
              {TONES.map((a) => (
                <div key={a} className="contents">
                  <div className="py-3 pr-1 text-right text-slate-500">{ORD[a]}</div>
                  {[1, 2, 3, 4, 0].map((b) => {
                    const c = stats.get(`${a}-${b}`);
                    return (
                      <button key={b} type="button" onClick={() => pick(`${a}-${b}`)} className={`rounded-xl py-3 ${cellStyle(c)}`} aria-label={`Practise tone pair ${a}-${b}`}>
                        {c ? `${Math.round((c.ok / c.n) * 100)}%` : '–'}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </Card>

          <Card className="flex flex-col gap-3">
            <Label>Sounds English speakers merge</Label>
            {soundPairs.map((p) => (
              <details key={p.id} className="rounded-2xl bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                <summary className="cursor-pointer font-medium">{p.label}</summary>
                <div className="flex flex-wrap items-center gap-3 py-2">
                  {p.pair.map((x) => (
                    <span key={x.char} className="flex items-center gap-1">
                      <span className="text-2xl">{x.char}</span>
                      <span className="text-slate-500">{formatWord(parseNumbered(x.pinyin))}</span>
                      {audio && <Speak text={x.char} slow />}
                    </span>
                  ))}
                </div>
                <p className="text-sm">{p.tip}</p>
              </details>
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}
