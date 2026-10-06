import { useEffect, useMemo, useRef, useState } from 'react';
import { db, persist } from '../lib/db';
import { expectedOf, gradeExercise, makeExercise, type Exercise, type Response } from '../lib/exercise';
import type { GradeResult } from '../lib/grade';
import { adaptScaffold, planSession } from '../lib/planner';
import { applyAnswer, buildQueue, commit, introduce, planInput, type LearnerState, type Slot } from '../lib/session';
import { State } from '../lib/srs';
import { ExerciseView } from './Exercise';
import { Bar, Button, Card, Label, Screen } from './ui';

interface Logged {
  ex: Exercise;
  result: GradeResult;
  given: string;
}

const insert = (q: Slot[], at: number, s: Slot) => [...q.slice(0, at), s, ...q.slice(at)];
const describe = (r: Response, ex: Exercise) => ('choice' in r ? ex.choices![r.choice].label : 'order' in r ? r.order.join('') : r.text);

export function Session({ state, minutes, audio, onExit }: { state: LearnerState; minutes: number; audio: boolean; onExit: () => void }) {
  const [plan] = useState(() => planSession(planInput(state, minutes, new Date(), audio)));
  const [queue, setQueue] = useState<Slot[]>(() => buildQueue(state, plan, new Date(), { audio }));
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<GradeResult>();
  const [given, setGiven] = useState('');
  const [log, setLog] = useState<Logged[]>([]);
  const [done, setDone] = useState<{ at: number; minutes: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const started = useRef(Date.now());
  const sessionId = useRef<number | undefined>(undefined);
  const scaffold = useRef(state.profile.scaffoldOffset);
  const recent = useRef<boolean[]>([]);
  const assisted = useRef(false);
  const shownAt = useRef(0);
  const rt = useRef(0);
  const failures = useRef(new Map<string, number>());
  const introduced = useRef(0);

  const created = useRef(false);
  useEffect(() => {
    if (created.current) return; // StrictMode runs effects twice in development
    created.current = true;
    void db.sessions
      .add({ startedAt: started.current, plannedMinutes: minutes, blocks: plan.blocks, rationale: plan.rationale, priority: plan.priority, mode: 'learn', stats: { answered: 0, correct: 0, newItems: 0, reviews: 0, minutes: 0 } })
      .then((id) => (sessionId.current = id));
  }, [minutes, plan]);
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  // The next slot that yields an exercise (slots can become moot, e.g. a facet not unlocked).
  const current = useMemo(() => {
    for (let i = index; i < queue.length; i++) {
      const ex = makeExercise(state, queue[i], { now: new Date(), audio, scaffold: scaffold.current });
      if (ex) return { ex, i };
    }
    return null;
  }, [index, queue, state, audio]);

  useEffect(() => {
    shownAt.current = Date.now();
    assisted.current = false;
  }, [current]);

  useEffect(() => {
    if (!current && !done) void finish();
  }); // finish when the queue runs dry

  async function finish() {
    const at = Date.now();
    setDone({ at, minutes: (at - started.current) / 60_000 });
    const answered = log.length;
    const correct = log.filter((l) => l.result.verdict === 'correct' || l.result.verdict === 'close').length;
    if (sessionId.current) {
      await db.sessions.update(sessionId.current, {
        endedAt: at,
        stats: { answered, correct, newItems: introduced.current, reviews: answered, minutes: (at - started.current) / 60_000 },
      });
    }
  }

  function submit(r: Response) {
    if (!current || result) return;
    rt.current = Date.now() - shownAt.current;
    setGiven(describe(r, current.ex));
    setResult(gradeExercise(current.ex, r));
  }

  function override(correct: boolean) {
    setResult((r) => r && { ...r, verdict: correct ? 'correct' : 'wrong', category: correct ? undefined : r.category ?? 'other', notes: correct ? ['Marked correct by you.'] : r.notes });
  }

  function assist(kind: 'confused' | 'why' | 'pinyin' | 'slow') {
    if (kind !== 'why') assisted.current = true;
    if (current && (kind === 'confused' || kind === 'why')) {
      void db.events.add({ at: Date.now(), sessionId: sessionId.current, type: kind, itemId: current.ex.itemId });
    }
  }

  function next() {
    if (!current) return;
    const { ex, i } = current;
    const at = new Date();
    let q = queue;
    if (ex.intro) {
      const w = introduce(state, ex.itemId, at, { sessionId: sessionId.current, modality: ex.intro.audioFirst ? 'audio' : 'text', batch: plan.newItems });
      commit(state, w);
      void persist(w);
      introduced.current++;
    } else if (result) {
      const { writes, unlocked } = applyAnswer(state, {
        slot: ex.slot, facet: ex.facet!, format: ex.format, result, rtMs: rt.current, assisted: assisted.current,
        given, expected: expectedOf(ex), context: ex.context, sessionId: sessionId.current,
      }, at);
      commit(state, writes);
      void persist(writes);
      const correct = result.verdict === 'correct' || result.verdict === 'close';
      recent.current = [...recent.current, correct];
      scaffold.current = adaptScaffold(recent.current, scaffold.current);
      setLog((l) => [...l, { ex, result, given }]);
      if (!correct) {
        const fails = (failures.current.get(ex.itemId) ?? 0) + 1;
        failures.current.set(ex.itemId, fails);
        // Try once more after a short gap; after three misses, park the item until next session.
        if (fails >= 3) q = q.filter((s, k) => k <= i || s.itemId !== ex.itemId);
        else if (!ex.slot.key.endsWith(':again')) q = insert(q, i + 3, { ...ex.slot, key: `${ex.slot.key}:again` });
      }
      for (const f of unlocked) q = insert(q, i + 4, { key: `${ex.itemId}|${f}|unlocked`, itemId: ex.itemId, facet: f });
    }
    setResult(undefined);
    setGiven('');
    const remaining = minutes * 60_000 - (Date.now() - started.current);
    const following = q[i + 1];
    if (!following || remaining <= 0 || (following.intro && remaining < 45_000)) {
      setQueue(q);
      void finish();
      return;
    }
    setQueue(q);
    setIndex(i + 1);
  }

  if (done) return <Summary log={log} state={state} introduced={introduced.current} at={done.at} minutes={done.minutes} onExit={onExit} />;
  if (!current) return null;
  const progress = Math.min(1, (now - started.current) / (minutes * 60_000));

  return (
    <Screen>
      <div className="flex items-center gap-3">
        <button type="button" aria-label="End session" onClick={() => void finish()} className="rounded-full p-2 text-2xl leading-none text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">×</button>
        <div className="flex-1"><Bar value={progress} /></div>
        <span className="text-sm text-slate-500 tabular-nums">{Math.max(0, Math.ceil(minutes - (now - started.current) / 60_000))} min</span>
      </div>
      <ExerciseView key={current.ex.slot.key} ex={current.ex} audio={audio} result={result} onSubmit={submit} onContinue={next} onOverride={override} onAssist={assist} />
    </Screen>
  );
}

function Summary({ log, state, introduced, at, minutes, onExit }: { log: Logged[]; state: LearnerState; introduced: number; at: number; minutes: number; onExit: () => void }) {
  const correct = log.filter((l) => l.result.verdict === 'correct' || l.result.verdict === 'close').length;
  const mistakes = log.filter((l) => l.result.verdict === 'wrong');
  const nextDue = Math.min(...[...state.srs.values()].filter((x) => x.card.state !== State.New && +x.card.due > at).map((x) => +x.card.due));
  const hours = Number.isFinite(nextDue) ? Math.max(1, Math.round((nextDue - at) / 3_600_000)) : undefined;
  return (
    <Screen>
      <header className="pt-6">
        <Label>Session complete</Label>
        <h1 className="mt-1 text-3xl font-semibold">{log.length ? `${Math.round((correct / log.length) * 100)}% right` : 'Nice start'}</h1>
      </header>
      <Card className="grid grid-cols-3 gap-2 text-center">
        <div><div className="text-2xl font-semibold">{introduced}</div><div className="text-sm text-slate-500">new</div></div>
        <div><div className="text-2xl font-semibold">{log.length}</div><div className="text-sm text-slate-500">answered</div></div>
        <div><div className="text-2xl font-semibold">{Math.max(1, Math.round(minutes))}</div><div className="text-sm text-slate-500">minutes</div></div>
      </Card>
      {mistakes.length > 0 && (
        <Card className="flex flex-col gap-2">
          <Label>Worth another look</Label>
          {mistakes.slice(0, 8).map((m, k) => (
            <div key={k} className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-1 last:border-0 dark:border-slate-800">
              <span><span className="text-xl">{m.ex.reveal.zh}</span> <span className="text-slate-500">{m.ex.reveal.pinyin}</span></span>
              <span className="text-right text-sm text-slate-500">{m.ex.reveal.en}{m.given && <><br />you: {m.given}</>}</span>
            </div>
          ))}
          <p className="text-sm text-slate-500">These come back sooner. Repeated mix-ups get their own drills.</p>
        </Card>
      )}
      {hours && <p className="text-center text-sm text-slate-500">Next review due in about {hours} hour{hours === 1 ? '' : 's'}.</p>}
      <Button onClick={onExit} className="mt-auto py-4 text-lg">Done</Button>
    </Screen>
  );
}
