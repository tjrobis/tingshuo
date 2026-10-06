import { useEffect, useState } from 'react';
import { toneSets, units, words } from '../lib/curriculum';
import { db, loadState, persist } from '../lib/db';
import { gradeEnglish } from '../lib/grade';
import { updateAbility } from '../lib/learner';
import { markSyllable } from '../lib/pinyin';
import { seedKnown, type LearnerState } from '../lib/session';
import { primeAudio, speak } from '../lib/audio';
import type { AssessmentRecord, SkillAbility } from '../lib/types';
import { Button, Card, Label, Screen, Speak } from './ui';

const TONE_ITEMS = 6;
const PER_UNIT = 4;
type Step = 'ask' | 'tones' | 'words' | 'saving';

/** Short adaptive placement: verified knowledge only (type the meaning), stops at the first unit you don't know. */
export function Placement({ state, audio, onDone }: { state: LearnerState; audio: boolean; onDone: (s: LearnerState) => void }) {
  const [step, setStep] = useState<Step>('ask');
  const [knowsSome, setKnowsSome] = useState(false);
  const [toneResults, setToneResults] = useState<boolean[]>([]);
  const [unit, setUnit] = useState(1);
  const [wordResults, setWordResults] = useState<{ id: string; unit: number; correct: boolean }[]>([]);
  // Random items are drawn in event handlers (render must stay pure).
  const [toneItems, setToneItems] = useState<{ set: (typeof toneSets)[number]; tone: number }[]>([]);
  const [unitWords, setUnitWords] = useState<typeof words>([]);

  const toneItem = toneItems[toneResults.length];
  const asked = wordResults.filter((r) => r.unit === unit).length;
  const current = unitWords[asked];

  useEffect(() => {
    if (step === 'tones' && audio && toneItem) void speak(toneItem.set.chars[toneItem.tone - 1]);
  }, [step, toneItem, audio]);

  const drawWords = (u: number) =>
    setUnitWords(words.filter((w) => w.unit === u && !w.incidental).sort(() => Math.random() - 0.5).slice(0, PER_UNIT));

  function begin(some: boolean) {
    primeAudio();
    setKnowsSome(some);
    setToneItems(Array.from({ length: TONE_ITEMS }, () => ({
      set: toneSets[Math.floor(Math.random() * toneSets.length)],
      tone: 1 + Math.floor(Math.random() * 4),
    })));
    drawWords(1);
    if (audio) setStep('tones');
    else if (some) setStep('words');
    else void finish([], []);
  }

  function answerTone(t: number) {
    const results = [...toneResults, t === toneItem.tone];
    setToneResults(results);
    if (results.length >= TONE_ITEMS) {
      if (knowsSome) setStep('words');
      else void finish(results, []);
    }
  }

  function answerWord(text: string | null) {
    const correct = text !== null && gradeEnglish(text, current.meanings).verdict !== 'wrong';
    const results = [...wordResults, { id: current.id, unit, correct }];
    setWordResults(results);
    if (asked + 1 < unitWords.length) return;
    const passed = results.filter((r) => r.unit === unit && r.correct).length >= PER_UNIT - 1;
    if (passed && unit < units.length) {
      setUnit(unit + 1);
      drawWords(unit + 1);
    }
    else void finish(toneResults, results);
  }

  async function finish(tones: boolean[], wordsTried: typeof wordResults) {
    setStep('saving');
    const now = new Date();
    let toneAbility: SkillAbility = { skill: 'tones', theta: 0, n: 0, updatedAt: +now };
    for (const ok of tones) toneAbility = updateAbility(toneAbility, 0.5, ok, +now);
    const known = wordsTried.filter((r) => r.correct).map((r) => r.id);
    const unitsPassed = [...new Set(wordsTried.map((r) => r.unit))].filter((u) => wordsTried.filter((r) => r.unit === u && r.correct).length >= PER_UNIT - 1);
    const vocab: SkillAbility = { skill: 'vocab', theta: 0.4 * Math.max(0, ...unitsPassed), n: wordsTried.length, updatedAt: +now };
    const assessment: AssessmentRecord = {
      at: +now,
      kind: 'placement',
      results: [
        { skill: 'tones', correct: tones.filter(Boolean).length, total: tones.length },
        { skill: 'vocab', correct: known.length, total: wordsTried.length, detail: `passed units: ${unitsPassed.join(', ') || 'none'}` },
      ],
      estimates: { tones: toneAbility.theta, vocab: vocab.theta },
      items: wordsTried.map((r) => ({ id: r.id, skill: 'vocab', correct: r.correct })),
    };
    await persist({ ...seedKnown(state, known, now), abilities: [...(tones.length ? [toneAbility] : []), ...(wordsTried.length ? [vocab] : [])] });
    await db.assessments.add(assessment);
    await db.profile.update('me', { calibratedAt: +now });
    onDone((await loadState())!);
  }

  return (
    <Screen>
      <header className="pt-6">
        <Label>Getting started</Label>
        <h1 className="mt-1 text-2xl font-semibold">Let's find your starting point</h1>
      </header>

      {step === 'ask' && (
        <Card className="flex flex-col gap-3">
          <p>Have you learned any Mandarin before?</p>
          <Button onClick={() => begin(false)}>I'm a total beginner</Button>
          <Button variant="secondary" onClick={() => begin(true)}>I know some already</Button>
          <p className="text-sm text-slate-500">{audio ? 'Takes 1–3 minutes. Turn your sound on.' : 'No Chinese voice was found on this device, so the listening checks are skipped.'}</p>
        </Card>
      )}

      {step === 'tones' && toneItem && (
        <Card className="flex flex-col gap-4">
          <Label>Ear check {toneResults.length + 1} / {TONE_ITEMS}</Label>
          <p>Which tone do you hear? Guessing is fine: this just sets your starting point.</p>
          <div className="flex justify-center"><Speak text={toneItem.set.chars[toneItem.tone - 1]} slow /></div>
          <div className="grid grid-cols-2 gap-2">
            {[1, 2, 3, 4].map((t) => (
              <Button key={t} variant="secondary" onClick={() => answerTone(t)} className="py-4 text-xl">
                {markSyllable(toneItem.set.base, t)}
              </Button>
            ))}
          </div>
        </Card>
      )}

      {step === 'words' && current && (
        <WordCheck key={current.id} hanzi={current.hanzi} unitTitle={units[unit - 1].title} audio={audio} onAnswer={answerWord} />
      )}

      {step === 'saving' && <Card>Setting up your plan…</Card>}
    </Screen>
  );
}

function WordCheck({ hanzi, unitTitle, audio, onAnswer }: { hanzi: string; unitTitle: string; audio: boolean; onAnswer: (text: string | null) => void }) {
  const [text, setText] = useState('');
  return (
    <Card className="flex flex-col gap-4">
      <Label>Do you know this? · {unitTitle}</Label>
      <div className="flex items-center justify-center gap-2">
        <span className="text-5xl">{hanzi}</span>
        {audio && <Speak text={hanzi} />}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) onAnswer(text); }} className="flex flex-col gap-2">
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Meaning in English"
          className="rounded-2xl bg-slate-100 px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800"
        />
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => onAnswer(null)}>Don't know</Button>
          <Button type="submit" disabled={!text.trim()}>Check</Button>
        </div>
      </form>
    </Card>
  );
}
