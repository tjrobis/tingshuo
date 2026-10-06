import { useEffect, useRef, useState, type ReactNode } from 'react';
import { listen, speak, sttSupported } from '../lib/audio';
import { dialogues, pinyinText, surface } from '../lib/curriculum';
import { splitTokenised } from '../lib/segment';
import { db, persist } from '../lib/db';
import { PROVIDERS } from '../lib/ai';
import { applyPractice, isIntroduced, ITEMS, type LearnerState } from '../lib/session';
import {
  aiReady, ask, correctionsToErrors, MODES, parseReply, pinyinOf, REPLY_SCHEMA, SCENARIOS, systemPrompt, toMessages, tutorContext, unknownWords,
} from '../lib/tutor';
import type { CorrectionItem, Dialogue, TutorMode } from '../lib/types';
import { Button, Card, Chip, Label, Screen, Speak } from './ui';

interface Turn {
  role: 'tutor' | 'learner';
  raw: string; // what the model saw (tutor turns: its JSON)
  text: string;
  translation?: string;
  pinyin?: string;
  newWords?: { word: string; meaning: string }[];
  unknown?: string[];
  corrections?: CorrectionItem[]; // on learner turns: what the tutor corrected
}

export function Tutor({ state, audio, onBack }: { state: LearnerState; audio: boolean; onBack: () => void }) {
  const [ready, setReady] = useState<boolean>();
  useEffect(() => void aiReady(state.profile).then(setReady), [state]);
  if (ready === undefined) return null;
  return ready ? <AiTutor state={state} audio={audio} onBack={onBack} /> : <Roleplay state={state} audio={audio} onBack={onBack} />;
}

const Header = ({ title, onBack, extra }: { title: string; onBack: () => void; extra?: ReactNode }) => (
  <header className="flex items-center gap-2 pt-4">
    <Button variant="ghost" className="px-3" onClick={onBack} aria-label="Back">←</Button>
    <h1 className="flex-1 text-2xl font-semibold">{title}</h1>
    {extra}
  </header>
);

function AiTutor({ state, audio, onBack }: { state: LearnerState; audio: boolean; onBack: () => void }) {
  const [phase, setPhase] = useState<'setup' | 'chat' | 'review'>('setup');
  const [mode, setMode] = useState<TutorMode>('conversation');
  const [scenario, setScenario] = useState(SCENARIOS[0]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [voice, setVoice] = useState(audio);
  const [english, setEnglish] = useState(true);
  const [listening, setListening] = useState<ReturnType<typeof listen>>();
  const [summary, setSummary] = useState<{ minutes: number; corrections: CorrectionItem[] }>({ minutes: 0, corrections: [] });
  const conversation = useRef<{ id?: number; started: number }>({ started: 0 });
  const bottom = useRef<HTMLDivElement>(null);
  const provider = PROVIDERS[state.profile.ai.provider as keyof typeof PROVIDERS];

  useEffect(() => {
    // Braces matter: scrollIntoView returns a Promise in current Chrome, and an effect must not return one.
    void bottom.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns, busy]);

  const save = (t: Turn) => conversation.current.id && db.messages.add({
    conversationId: conversation.current.id, at: Date.now(), role: t.role, zh: t.text, en: t.translation,
    unknownWords: t.unknown, newWords: t.newWords?.map((w) => ({ ...w, pinyin: '', en: w.meaning })),
  });

  async function tutorTurn(history: Turn[]) {
    setBusy(true);
    setError('');
    try {
      const system = systemPrompt(tutorContext(state), mode, scenario.setup);
      let raw = await ask(state.profile, { purpose: 'tutor', system, messages: toMessages(history), schema: REPLY_SCHEMA });
      let reply = parseReply(raw);
      let check = unknownWords(state, reply.reply);
      if (check.unknown.length > MODES[mode].newWords) {
        // One rewrite with the offending words named; whatever comes back is shown with them flagged.
        raw = await ask(state.profile, {
          purpose: 'tutor', system, schema: REPLY_SCHEMA,
          messages: [...toMessages(history), { role: 'assistant', content: raw }, { role: 'user', content: `[App: too many words they haven't learned: ${check.unknown.join(', ')}. Rewrite that reply using words they know. Same JSON format.]` }],
        });
        reply = parseReply(raw);
        check = unknownWords(state, reply.reply);
      }
      if (!reply.reply) throw new Error("Couldn't read the tutor's reply. Try sending again.");
      const turn: Turn = { role: 'tutor', raw, text: reply.reply, translation: reply.translation, pinyin: await pinyinOf(reply.reply), newWords: reply.newWords, unknown: check.unknown };
      const next = [...history];
      const lastLearner = next.map((t) => t.role).lastIndexOf('learner');
      if (lastLearner >= 0 && reply.corrections.length) next[lastLearner] = { ...next[lastLearner], corrections: reply.corrections };
      setTurns([...next, turn]);
      void save(turn);
      if (voice) void speak(turn.text);
    } catch (e) {
      setError((e as Error).message);
      setTurns(history);
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    conversation.current = { started: Date.now() };
    conversation.current.id = await db.conversations.add({
      startedAt: conversation.current.started, mode, scenario: scenario.id, provider: state.profile.ai.provider, minutes: 0, chineseOnly: mode === 'immersion', turns: 0,
    });
    setEnglish(mode !== 'immersion');
    setPhase('chat');
    void tutorTurn([]);
  }

  function send() {
    const text = input.trim();
    if (!text || busy) return;
    const turn: Turn = { role: 'learner', raw: text, text };
    setInput('');
    void save(turn);
    void tutorTurn([...turns, turn]);
  }

  async function mic() {
    if (listening) {
      listening.stop();
      setInput((await listening.heard) || input);
      setListening(undefined);
    } else setListening(listen());
  }

  async function end() {
    const corrections = turns.flatMap((t) => t.corrections ?? []).filter((c, i, all) => all.findIndex((x) => x.said === c.said) === i).sort((a, b) => b.severity - a.severity);
    const now = Date.now();
    if (corrections.length) await db.errors.bulkAdd(correctionsToErrors(corrections, now));
    if (conversation.current.id) {
      await db.conversations.update(conversation.current.id, {
        endedAt: now, minutes: (now - conversation.current.started) / 60_000, turns: turns.filter((t) => t.role === 'learner').length, review: corrections,
      });
    }
    setSummary({ minutes: (now - conversation.current.started) / 60_000, corrections });
    setPhase('review');
  }

  if (phase === 'setup') {
    return (
      <Screen>
        <Header title="Talk" onBack={onBack} />
        <Card className="flex flex-col gap-3">
          <Label>Mode</Label>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(MODES) as TutorMode[]).map((m) => <Chip key={m} active={mode === m} onClick={() => setMode(m)}>{MODES[m].label}</Chip>)}
          </div>
          <p className="text-sm text-slate-500">{MODES[mode].blurb}</p>
        </Card>
        <Card className="flex flex-col gap-3">
          <Label>Situation</Label>
          <select value={scenario.id} onChange={(e) => setScenario(SCENARIOS.find((s) => s.id === e.target.value)!)} className="rounded-xl bg-slate-100 px-3 py-2 dark:bg-slate-800">
            {SCENARIOS.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        </Card>
        {tutorContext(state).known.length < 20 && (
          <Card className="text-sm">
            The tutor sticks to words you've learned, and you know {tutorContext(state).known.length} so far, so it works best after a few lessons. New words it uses are flagged.
          </Card>
        )}
        <p className="text-center text-xs text-slate-500">Your messages and the words you know are sent to {provider.label}. Pinyin and word checks are done on this device.</p>
        <Button onClick={() => void start()} className="py-4 text-lg">Start talking</Button>
      </Screen>
    );
  }

  if (phase === 'review') {
    const { corrections } = summary;
    const minutes = Math.max(1, Math.round(summary.minutes));
    return (
      <Screen>
        <Header title="Conversation review" onBack={onBack} />
        <Card className="grid grid-cols-2 gap-2 text-center">
          <div><div className="text-2xl font-semibold">{turns.filter((t) => t.role === 'learner').length}</div><div className="text-sm text-slate-500">things you said</div></div>
          <div><div className="text-2xl font-semibold">{minutes}</div><div className="text-sm text-slate-500">minutes</div></div>
        </Card>
        {corrections.length ? corrections.map((c, i) => (
          <Card key={i} className="flex flex-col gap-1">
            <div className="text-xs font-semibold text-slate-500 uppercase">You said</div>
            <div className="text-xl">{c.said}</div>
            <div className="mt-1 text-xs font-semibold text-emerald-700 uppercase dark:text-emerald-400">More natural</div>
            <div className="flex items-center gap-1 text-xl">{c.better} {audio && <Speak text={c.better} />}</div>
            <div className="mt-1 text-xs font-semibold text-slate-500 uppercase">Why</div>
            <p className="text-sm">{c.why}</p>
          </Card>
        )) : <Card>No corrections worth making this time.</Card>}
        <p className="text-center text-xs text-slate-500">Mistakes that keep coming back get their own drills in your sessions.</p>
        <Button onClick={onBack} className="mt-auto py-4 text-lg">Done</Button>
      </Screen>
    );
  }

  return (
    <Screen>
      <Header title={scenario.title} onBack={() => void end()} extra={
        <div className="flex gap-1">
          {mode !== 'immersion' && <Button variant="ghost" className="px-2 py-1 text-sm" onClick={() => setEnglish(!english)}>{english ? 'Hide' : 'Show'} English</Button>}
          {audio && <Button variant="ghost" className="px-2 py-1 text-sm" onClick={() => setVoice(!voice)}>{voice ? 'Voice on' : 'Voice off'}</Button>}
        </div>
      } />
      <div className="flex flex-1 flex-col gap-3">
        {turns.map((t, i) => t.role === 'tutor' ? (
          <div key={i} className="max-w-[85%] self-start rounded-3xl rounded-tl-md bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
            <div className="flex items-start gap-1">
              <div className="flex-1 text-2xl">{t.text}</div>
              {audio && <Speak text={t.text} slow />}
            </div>
            {t.pinyin && <div className="text-sm text-slate-500">{t.pinyin}</div>}
            {english && t.translation && <div className="mt-1 text-sm">{t.translation}</div>}
            {!!t.unknown?.length && (
              <div className="mt-2 flex flex-wrap gap-1 text-xs">
                {t.unknown.map((w) => (
                  <span key={w} className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
                    new: {w}{t.newWords?.find((n) => n.word === w)?.meaning ? ` = ${t.newWords.find((n) => n.word === w)!.meaning}` : ''}
                  </span>
                ))}
                <span className="text-slate-500">(AI gloss, unverified)</span>
              </div>
            )}
          </div>
        ) : (
          <div key={i} className="flex max-w-[85%] flex-col items-end gap-1 self-end">
            <div className="rounded-3xl rounded-tr-md bg-indigo-600 px-4 py-3 text-xl text-white">{t.text}</div>
            {mode === 'learning' && t.corrections?.map((c, k) => (
              <div key={k} className="rounded-2xl bg-amber-50 px-3 py-2 text-sm ring-1 ring-amber-200 dark:bg-amber-950/40 dark:ring-amber-900">
                <b>{c.better}</b> {audio && <Speak text={c.better} />}<br />{c.why}
              </div>
            ))}
          </div>
        ))}
        {busy && <div className="self-start text-slate-500">…</div>}
        {error && <Card className="text-sm text-rose-600">{error}</Card>}
        <div ref={bottom} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="sticky bottom-0 flex gap-2 bg-white/90 py-2 backdrop-blur dark:bg-slate-950/90">
        <input value={input} onChange={(e) => setInput(e.target.value)} lang="zh" placeholder="说中文… (or pinyin)" autoComplete="off"
          className="flex-1 rounded-2xl bg-slate-100 px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800" />
        {state.profile.privacy.stt && sttSupported() && (
          <Button variant={listening ? 'bad' : 'secondary'} onClick={() => void mic()} aria-label={listening ? 'Stop listening' : 'Speak'}>{listening ? '■' : '🎤'}</Button>
        )}
        <Button type="submit" disabled={busy || !input.trim()}>Send</Button>
      </form>
      <div className="flex justify-between text-xs text-slate-500">
        <span>{state.profile.privacy.stt && sttSupported() ? 'The 🎤 uses your browser’s speech recognition.' : "Tip: your keyboard's dictation mic works for speaking."}</span>
        <button type="button" className="underline" onClick={() => void end()}>End & review</button>
      </div>
    </Screen>
  );
}

/** No AI set up: act out a dialogue, playing the second speaker. */
function Roleplay({ state, audio, onBack }: { state: LearnerState; audio: boolean; onBack: () => void }) {
  const readable = (d: Dialogue) =>
    d.lines.every((l) => splitTokenised(l.zh).every((t) => t.kind !== 'han' || isIntroduced(state, `w:${t.ref}`) || !ITEMS.has(`w:${t.ref}`)));
  const [dialogue, setDialogue] = useState<Dialogue>();
  const [line, setLine] = useState(0);
  const [answer, setAnswer] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [scores, setScores] = useState<boolean[]>([]);
  const current = dialogue?.lines[line];

  useEffect(() => {
    if (audio && current?.speaker === 'A') void speak(surface(current.zh));
  }, [current, audio]);

  function judge(ok: boolean) {
    setScores([...scores, ok]);
    const now = new Date();
    void persist(applyPractice(state, { slot: { key: 'roleplay', itemId: dialogue!.id, practice: 'shadow', ref: dialogue!.id }, correct: ok, level: 0.4 * dialogue!.unit, rtMs: 0, given: answer, expected: surface(current!.zh) }, now));
    advance();
  }
  function advance() {
    setAnswer('');
    setRevealed(false);
    setLine(line + 1);
  }

  if (!dialogue) {
    return (
      <Screen>
        <Header title="Talk" onBack={onBack} />
        <Card className="flex flex-col gap-2 text-sm">
          <p><b>Roleplay offline.</b> You play the second speaker: hear a line, answer it, then compare with a model answer.</p>
          <p className="text-slate-500">For free conversation with an AI tutor, add a provider in Settings (a free Gemini key or a local model works).</p>
        </Card>
        {dialogues.map((d) => (
          <Button key={d.id} variant="secondary" className="flex justify-between text-left" onClick={() => { setDialogue(d); setLine(0); setScores([]); }}>
            <span>{d.title}</span>
            <span className="text-sm text-slate-500">{readable(d) ? 'you know every word' : `unit ${d.unit}`}</span>
          </Button>
        ))}
      </Screen>
    );
  }

  if (!current) {
    return (
      <Screen>
        <Header title={dialogue.title} onBack={onBack} />
        <Card className="text-center">You matched {scores.filter(Boolean).length} of {scores.length} replies.</Card>
        <Button onClick={() => setDialogue(undefined)}>Another conversation</Button>
      </Screen>
    );
  }

  const zh = surface(current.zh);
  return (
    <Screen>
      <Header title={dialogue.title} onBack={() => setDialogue(undefined)} />
      {current.speaker === 'A' ? (
        <Card className="flex flex-col gap-2">
          <Label>They say</Label>
          <div className="flex items-center gap-2 text-2xl">{zh} {audio && <Speak text={zh} slow />}</div>
          <div className="text-slate-500">{pinyinText(current.zh)}</div>
          <div className="text-sm">{current.en}</div>
          <Button onClick={advance}>Your turn</Button>
        </Card>
      ) : (
        <Card className="flex flex-col gap-3">
          <Label>Your turn</Label>
          <p className="text-sm text-slate-500">Hint: {current.en}</p>
          {!revealed ? (
            <form onSubmit={(e) => { e.preventDefault(); setRevealed(true); }} className="flex flex-col gap-2">
              <input autoFocus value={answer} onChange={(e) => setAnswer(e.target.value)} lang="zh" placeholder="Say it aloud, or type it" className="rounded-2xl bg-slate-100 px-4 py-3 text-lg dark:bg-slate-800" />
              <Button type="submit">Compare</Button>
            </form>
          ) : (
            <>
              <div className="flex items-center gap-2 text-2xl">{zh} {audio && <Speak text={zh} slow />}</div>
              <div className="text-slate-500">{pinyinText(current.zh)}</div>
              <p className="text-sm">Did you say something that means the same?</p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="bad" onClick={() => judge(false)}>Not really</Button>
                <Button variant="good" onClick={() => judge(true)}>Yes</Button>
              </div>
            </>
          )}
        </Card>
      )}
    </Screen>
  );
}
