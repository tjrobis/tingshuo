import { useEffect, useRef, useState, type ReactNode } from 'react';
import { listen, speak, sttSupported } from '../lib/audio';
import { t } from '../lib/commands';
import { dialogues, missions, pinyinText, surface, words } from '../lib/curriculum';
import { splitTokenised } from '../lib/segment';
import { db, persist } from '../lib/db';
import { PROVIDERS } from '../lib/ai';
import { applyPractice, commit, isIntroduced, ITEMS, type LearnerState } from '../lib/session';
import {
  aiReady, ask, correctionsToErrors, missionChecks, missionSetup, MODES, parseReply, pinyinOf, REPLY_SCHEMA, SCENARIOS, systemPrompt, toMessages, tokensOf, tutorContext, unknownWords,
} from '../lib/tutor';
import type { CorrectionItem, Dialogue, Mission, TutorMode } from '../lib/types';
import { TapText } from './Reader';
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
  const [summary, setSummary] = useState<{ minutes: number; corrections: CorrectionItem[]; mission?: boolean[] }>({ minutes: 0, corrections: [] });
  const [mission, setMission] = useState<Mission>();
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
      const system = systemPrompt(tutorContext(state), mode, mission ? missionSetup(mission, scenario.setup) : scenario.setup);
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
    setEnglish(mode !== 'immersion' && state.profile.immersion < 2); // from immersion level 2, translations wait to be asked for
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
    const minutes = (now - conversation.current.started) / 60_000;
    let checks: boolean[] | undefined;
    if (mission) {
      const said = turns.filter((t) => t.role === 'learner').map((t) => t.text);
      checks = missionChecks(mission, said);
      const w = applyPractice(state, {
        slot: { key: mission.id, itemId: mission.id, practice: 'mission', ref: mission.id }, correct: checks.every(Boolean) && minutes >= (mission.minutes ?? 0),
        level: 0.4 * mission.unit, rtMs: 0, given: said.join(' / ').slice(0, 500), expected: mission.checks.map((c) => c.label).join('; '),
      }, new Date(now));
      commit(state, w);
      void persist(w);
    }
    setSummary({ minutes, corrections, mission: checks });
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
        <MissionList state={state} onPractise={(m) => {
          setMission(m);
          setScenario(SCENARIOS.find((x) => x.id === m.scenario)!);
          setMode('roleplay');
        }} />
        {mission && (
          <Card className="flex items-start gap-2 text-sm">
            <p className="flex-1"><b>Mission: {mission.title}.</b> {mission.brief}</p>
            <Button variant="ghost" className="px-2 py-1 text-sm" onClick={() => setMission(undefined)}>Clear</Button>
          </Card>
        )}
        {tutorContext(state).known.length < 20 && (
          <Card className="text-sm">
            The tutor sticks to words you've learned, and you know {tutorContext(state).known.length} so far, so it works best after a few lessons. New words it uses are flagged.
          </Card>
        )}
        <p className="text-center text-xs text-slate-500">Your messages and the words you know are sent to {provider.label}. Pinyin and word checks are done on this device.</p>
        <Button onClick={() => void start()} className="py-4 text-lg">{mission ? 'Start the mission' : t('Start talking')}</Button>
      </Screen>
    );
  }

  if (phase === 'review') {
    const { corrections } = summary;
    const minutes = Math.max(1, Math.round(summary.minutes));
    const short = !!mission?.minutes && summary.minutes < mission.minutes;
    return (
      <Screen>
        <Header title="Conversation review" onBack={onBack} />
        <Card className="grid grid-cols-2 gap-2 text-center">
          <div><div className="text-2xl font-semibold">{turns.filter((t) => t.role === 'learner').length}</div><div className="text-sm text-slate-500">things you said</div></div>
          <div><div className="text-2xl font-semibold">{minutes}</div><div className="text-sm text-slate-500">minutes</div></div>
        </Card>
        {mission && summary.mission && (
          <Card className="flex flex-col gap-1">
            <Label>Mission: {mission.title}</Label>
            <div className="text-lg font-medium">{summary.mission.every(Boolean) && !short ? 'Done ✓' : `${summary.mission.filter(Boolean).length} of ${mission.checks.length} done`}</div>
            {mission.checks.map((c, k) => <div key={k} className={summary.mission![k] ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500'}>{summary.mission![k] ? '✓' : '○'} {c.label}</div>)}
            {short && <div className="text-slate-500">○ Keep it going for {mission.minutes} minutes</div>}
          </Card>
        )}
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
      {mission && (
        <Card className="sticky top-0 z-10 flex flex-col gap-0.5 py-3 text-sm">
          <div className="font-medium">Mission: {mission.title}{mission.minutes ? ` · ${mission.minutes} min` : ''}</div>
          {missionChecks(mission, turns.filter((x) => x.role === 'learner').map((x) => x.text)).map((ok, k) => (
            <div key={k} className={ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500'}>{ok ? '✓' : '○'} {mission.checks[k].label}</div>
          ))}
        </Card>
      )}
      <div className="flex flex-1 flex-col gap-3">
        {turns.map((t, i) => t.role === 'tutor' ? (
          <div key={i} className="max-w-[85%] self-start rounded-3xl rounded-tl-md bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
            <div className="flex items-start gap-1">
              <div lang="zh" className="flex-1 text-2xl">
                <TapText tokens={tokensOf(t.text)} state={state} audio={audio} context="tutor" isNew={(x) => !!t.unknown?.includes(x.text)}
                  glosses={Object.fromEntries((t.newWords ?? []).map((n) => [n.word, n.meaning]))} />
              </div>
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
      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="sticky bottom-0 flex gap-2 bg-white/90 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur dark:bg-slate-950/90">
        <input value={input} onChange={(e) => setInput(e.target.value)} lang="zh" placeholder="说中文… (or pinyin)" autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} enterKeyHint="send"
          className="flex-1 rounded-2xl bg-slate-100 px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800" />
        {state.profile.privacy.stt && sttSupported() && (
          <Button variant={listening ? 'bad' : 'secondary'} onClick={() => void mic()} aria-label={listening ? 'Stop listening' : 'Speak'}>{listening ? '■' : '🎤'}</Button>
        )}
        <Button type="submit" disabled={busy || !input.trim()}>Send</Button>
      </form>
      <div className="flex justify-between text-xs text-slate-500">
        <span>{state.profile.privacy.stt && sttSupported() ? 'The 🎤 uses your browser’s speech recognition.' : "Tip: your keyboard's dictation mic works for speaking."}</span>
        <button type="button" className="underline" onClick={() => void end()}>{t('End & review')}</button>
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
        <MissionList state={state} />
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
  const tappable = <TapText tokens={splitTokenised(current.zh)} state={state} audio={audio} context={dialogue.id} />;
  return (
    <Screen>
      <Header title={dialogue.title} onBack={() => setDialogue(undefined)} />
      {current.speaker === 'A' ? (
        <Card className="flex flex-col gap-2">
          <Label>They say</Label>
          <div className="flex items-center gap-2 text-2xl"><span lang="zh">{tappable}</span> {audio && <Speak text={zh} slow />}</div>
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
              <input autoFocus value={answer} onChange={(e) => setAnswer(e.target.value)} lang="zh" placeholder="Say it aloud, or type it" autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} className="rounded-2xl bg-slate-100 px-4 py-3 text-lg dark:bg-slate-800" />
              <Button type="submit">Compare</Button>
            </form>
          ) : (
            <>
              <div className="flex items-center gap-2 text-2xl"><span lang="zh">{tappable}</span> {audio && <Speak text={zh} slow />}</div>
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

/** Real-world tasks, unlocked by unit. Practised with the tutor (checked as you type), or done for real and self-reported. */
function MissionList({ state, onPractise }: { state: LearnerState; onPractise?: (m: Mission) => void }) {
  const [open, setOpen] = useState<string>();
  const [ticked, setTicked] = useState<boolean[]>([]);
  const [saved, setSaved] = useState(false);
  const unit = words.find((w) => !w.incidental && !isIntroduced(state, w.id))?.unit ?? Infinity;
  const done = new Set(state.answers.filter((e) => e.meta?.practice === 'mission' && e.correct).map((e) => e.meta!.ref));

  function report(m: Mission) {
    const w = applyPractice(state, {
      slot: { key: m.id, itemId: m.id, practice: 'mission', ref: m.id }, correct: ticked.every(Boolean), level: 0.4 * m.unit, rtMs: 0,
      given: `self-report: ${m.checks.filter((_, k) => ticked[k]).map((c) => c.label).join('; ')}`, expected: m.checks.map((c) => c.label).join('; '),
    }, new Date());
    commit(state, w);
    void persist(w);
    setSaved(true);
  }

  return (
    <Card className="flex flex-col gap-2">
      <Label>Missions</Label>
      <p className="text-sm text-slate-500">
        Real tasks to do in Chinese. {onPractise ? 'Practise with the tutor (your messages are checked as you go), or ' : ''}do one for real (with a friend, a teacher, a shop) and tick off what you managed.
      </p>
      {missions.map((m) => (
        <div key={m.id} className="border-t border-slate-100 pt-2 dark:border-slate-800">
          <button type="button" disabled={m.unit > unit} aria-expanded={open === m.id} className="flex w-full justify-between gap-3 text-left disabled:opacity-40"
            onClick={() => { setOpen(open === m.id ? undefined : m.id); setTicked(m.checks.map(() => false)); setSaved(false); }}>
            <span>{done.has(m.id) && <span className="text-emerald-600">✓ </span>}{m.title}</span>
            <span className="shrink-0 text-sm text-slate-500">{m.unit > unit ? `after unit ${m.unit}` : m.minutes ? `${m.minutes} min` : ''}</span>
          </button>
          {open === m.id && (
            <div className="mt-2 flex flex-col gap-2 rounded-2xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
              <p>{m.brief}</p>
              {onPractise && <Button onClick={() => onPractise(m)}>Practise with the tutor</Button>}
              <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Did it for real? Tick what you managed</div>
              {m.checks.map((c, k) => (
                <label key={k} className="flex items-center gap-2">
                  <input type="checkbox" className="accent-indigo-600" checked={!!ticked[k]} disabled={saved}
                    onChange={(e) => setTicked(Object.assign([...ticked], { [k]: e.target.checked }))} />
                  {c.label}
                </label>
              ))}
              {saved
                ? <p className="text-emerald-700 dark:text-emerald-400">{ticked.every(Boolean) ? 'Mission done!' : 'Saved. Try again for the rest.'}</p>
                : <Button variant="secondary" disabled={!ticked.some(Boolean)} onClick={() => report(m)}>Save</Button>}
            </div>
          )}
        </div>
      ))}
    </Card>
  );
}
