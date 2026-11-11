import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';
import { t } from '../lib/commands';
import { characters, grammar, soundPairs, units, wordById, words } from '../lib/curriculum';
import { db } from '../lib/db';
import { gradeExercise, makeExercise, type Response } from '../lib/exercise';
import type { GradeResult, Verdict } from '../lib/grade';
import { masteryStatus } from '../lib/learner';
import {
  achievements, BENCH_SKILLS, benchmarkDue, benchmarkForm, currentForm, hash, metaLearning, scoreBenchmark, seeded, type BenchSkill,
} from '../lib/progress';
import { emptyState, facetsOf, isIntroduced, ITEMS, PRONUNCIATION_ORDER, type LearnerState } from '../lib/session';
import { retrievability, State } from '../lib/srs';
import type { AssessmentRecord, Facet, MasteryStatus } from '../lib/types';
import { ExerciseView } from './Exercise';
import { Bar, Button, Card, Label, Screen } from './ui';

const DAY = 86_400_000;
type Status = MasteryStatus | 'unseen';
const STATUS: Record<Status, [string, string]> = {
  unseen: ['Not started', 'bg-slate-100 text-slate-400 dark:bg-slate-800/60 dark:text-slate-500'],
  new: ['Just introduced', 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100'],
  learning: ['Learning', 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100'],
  developing: ['Getting there', 'bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100'],
  strong: ['Strong', 'bg-teal-100 text-teal-900 dark:bg-teal-900/50 dark:text-teal-100'],
  mastered: ['Mastered', 'bg-emerald-600 text-white'],
  at_risk: ['Fading', 'bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-100'],
};
const FACETS: Record<Facet, string> = {
  meaning: 'Meaning from characters', listening: 'Meaning by ear', recall: 'Saying it from the meaning', reading: 'Pinyin from characters',
  char: 'Character', grammar: 'Recognising the pattern', grammarProd: 'Using the pattern', perceive: 'Hearing it', produce: 'Saying it aloud',
};
const day = (at: number) => new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const label = (id: string) =>
  id.startsWith('w:') ? wordById.get(id)!.hanzi
  : id.startsWith('c:') ? id.slice(2)
  : id.startsWith('g:') ? grammar.find((g) => g.id === id)!.title
  : id.startsWith('t:') ? `Tone ${id.slice(2)}`
  : id.startsWith('tp:') ? id.slice(3)
  : soundPairs.find((p) => p.id === id)?.label ?? id;

/** Achievements, benchmarks, what the app has learned about how you learn, and the knowledge map. */
export function Progress({ state, audio, onBack }: { state: LearnerState; audio: boolean; onBack: () => void }) {
  const [bench, setBench] = useState(false);
  const [open, setOpen] = useState<string>();
  const talks = useLiveQuery(() => db.conversations.toArray(), []) ?? [];
  const history = useLiveQuery(() => db.assessments.orderBy('at').toArray(), []) ?? [];
  const unlocked = useLiveQuery(() => db.achievements.toArray(), []); // undefined while loading

  if (bench) return <Benchmark state={state} audio={audio} history={history} onDone={() => setBench(false)} />;

  const now = new Date();
  const status = (id: string): Status => (isIntroduced(state, id) ? masteryStatus(ITEMS.get(id)!.kind, facetsOf(state, id), now) : 'unseen');
  const got = new Map((unlocked ?? []).map((a) => [a.id, a.unlockedAt]));
  const list = achievements(state, now, talks);
  const done = list.filter((a) => got.has(a.id)).sort((a, b) => got.get(b.id)! - got.get(a.id)!);
  const next = list.filter((a) => !got.has(a.id) && a.progress > 0).sort((a, b) => b.progress - a.progress).slice(0, 4);
  const { insights, running } = metaLearning(state, +now);
  const form = currentForm(state);
  const mine = history.filter((a) => a.kind === 'benchmark' && a.form === form.id);
  const unitNow = words.find((w) => !w.incidental && !isIntroduced(state, w.id))?.unit ?? units.length;
  const groups = [
    { title: 'Sounds and tones', ids: PRONUNCIATION_ORDER },
    ...units.map((u) => ({
      title: `Unit ${u.n}: ${u.title}`, unit: u.n,
      ids: [...words.filter((w) => !w.incidental && w.unit === u.n).map((w) => w.id), ...grammar.filter((g) => g.unit === u.n).map((g) => g.id)],
    })),
    { title: 'Characters', ids: characters.map((c) => c.id) },
  ];

  return (
    <Screen>
      <header className="flex items-center gap-2 pt-4">
        <Button variant="ghost" className="px-3" onClick={onBack} aria-label="Back">←</Button>
        <h1 className="flex-1 text-2xl font-semibold">{t('Progress')}</h1>
      </header>

      {unlocked && <Card className="flex flex-col gap-3">
        <Label>What you can do · {done.length} of {list.length}</Label>
        {done.map((a) => (
          <div key={a.id} className="flex items-start gap-3">
            <span aria-hidden>🏅</span>
            <div className="flex-1"><div className="font-medium">{a.title}</div><div className="text-sm text-slate-500">{a.detail}</div></div>
            <span className="text-xs text-slate-500">{day(got.get(a.id)!)}</span>
          </div>
        ))}
        {next.length > 0 && <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Next up</div>}
        {next.map((a) => (
          <div key={a.id} className="flex flex-col gap-1">
            <div className="flex justify-between gap-3 text-sm"><span>{a.title}</span><span className="text-slate-500">{Math.floor(a.progress * 100)}%</span></div>
            <Bar value={a.progress} className="bg-teal-500" />
          </div>
        ))}
        {!done.length && !next.length && <p className="text-sm text-slate-500">Finish a session or two and the first ones appear.</p>}
      </Card>}

      <Card className="flex flex-col gap-3">
        <Label>Benchmark · {form.title}</Label>
        <p className="text-sm text-slate-500">
          The same {benchmarkForm(form.id, audio).length} questions every time, so the change you see is real. About 5 minutes; nothing in it affects your reviews.
        </p>
        {mine.length ? <BenchResults record={mine[mine.length - 1]} previous={mine[mine.length - 2]} /> : <p className="text-sm">Not taken yet.</p>}
        <Button variant={benchmarkDue(state, history, +now) ? 'primary' : 'secondary'} onClick={() => setBench(true)}>
          {mine.length ? (benchmarkDue(state, history, +now) ? 'Take it again: two weeks since last time' : 'Take it again') : 'Take the benchmark'}
        </Button>
      </Card>

      <Card className="flex flex-col gap-3">
        <Label>How you learn</Label>
        {insights.length ? insights.map((i) => (
          <div key={i.id} className="flex flex-col gap-1">
            <div className="font-medium">{i.title}</div>
            <p className="text-sm">{i.detail}</p>
            {i.action && <p className="text-sm text-indigo-700 dark:text-indigo-300">{i.action}</p>}
            <p className="text-xs text-slate-500">{i.n} observations · {Math.round(i.probability * 100)}% sure</p>
          </div>
        )) : <p className="text-sm">No conclusions yet. The app runs small experiments on how you learn best and only reports what the data clearly shows.</p>}
        {running.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-slate-500">Still collecting data ({running.length})</summary>
            <div className="mt-2 flex flex-col gap-2">
              {running.map((x) => (
                <div key={x.id} className="flex flex-col gap-1">
                  <div className="flex justify-between gap-3"><span>{x.title}</span><span className="shrink-0 text-slate-500">{Math.min(x.n, x.needed)}/{x.needed}</span></div>
                  {x.note ? <p className="text-xs text-slate-500">{x.note}</p> : <Bar value={x.n / x.needed} className="bg-slate-400" />}
                </div>
              ))}
            </div>
          </details>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <Label>Knowledge map</Label>
        <div className="flex flex-wrap gap-1.5 text-xs">
          {(['unseen', 'learning', 'developing', 'strong', 'mastered', 'at_risk'] as Status[]).map((k) => (
            <span key={k} className={`rounded-full px-2 py-0.5 ${STATUS[k][1]}`}>{STATUS[k][0]}</span>
          ))}
        </div>
        {groups.map((g) => {
          const statuses = g.ids.map(status);
          const holding = statuses.filter((x) => x === 'developing' || x === 'strong' || x === 'mastered').length;
          return (
            <details key={g.title} open={'unit' in g && g.unit === unitNow} className="border-t border-slate-100 pt-2 dark:border-slate-800">
              <summary className="flex cursor-pointer items-center justify-between gap-3">
                <span className="font-medium">{g.title}</span>
                <span className="shrink-0 text-sm text-slate-500">{holding}/{g.ids.length} holding</span>
              </summary>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {g.ids.map((id, k) => (
                  <button key={id} type="button" aria-expanded={open === id} onClick={() => setOpen(open === id ? undefined : id)}
                    className={`rounded-lg px-2 py-1 text-sm ${STATUS[statuses[k]][1]} ${open === id ? 'ring-2 ring-indigo-500' : ''}`}>
                    {label(id)}
                  </button>
                ))}
              </div>
              {open && g.ids.includes(open) && <ItemDetail state={state} id={open} status={status(open)} now={now} />}
            </details>
          );
        })}
      </Card>
    </Screen>
  );
}

/** Drill-down: each facet's memory state. */
function ItemDetail({ state, id, status, now }: { state: LearnerState; id: string; status: Status; now: Date }) {
  const w = wordById.get(id);
  const m = state.mastery.get(id);
  const facets = facetsOf(state, id);
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-2xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
      <div><span lang="zh" className="text-lg">{label(id)}</span> {w && <span className="text-slate-500">{w.meanings.slice(0, 2).join('; ')}</span>} · {STATUS[status][0]}</div>
      {facets.length ? facets.map((f) => {
        const s = m?.byFacet[f.facet];
        const due = +f.card.due - +now;
        return (
          <div key={f.facet} className="grid grid-cols-[1fr_auto] gap-x-3">
            <span>{FACETS[f.facet]}</span>
            <span className="text-right text-slate-500">{f.card.state === State.New ? 'not practised yet' : `${Math.round(retrievability(f.card, now) * 100)}% recall now`}</span>
            <span className="text-xs text-slate-500">{s ? `${s.correct} right, ${s.incorrect} wrong` : ''}</span>
            <span className="text-right text-xs text-slate-500">
              {f.card.state === State.New ? '' : `${f.card.stability < 1 ? 'under a day' : `${Math.round(f.card.stability)} d`} memory · ${due <= 0 ? 'due now' : `next in ${due < DAY ? `${Math.ceil(due / 3_600_000)} h` : `${Math.round(due / DAY)} d`}`}`}
            </span>
          </div>
        );
      }) : <p className="text-slate-500">Not introduced yet.</p>}
      {m && m.mistakes.length > 0 && <p className="text-xs text-slate-500">Recent mistakes: {m.mistakes.slice(-3).map((x) => x.given).join(', ')}</p>}
    </div>
  );
}

function BenchResults({ record, previous }: { record: AssessmentRecord; previous?: AssessmentRecord }) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <div className="text-xs text-slate-500">{day(record.at)}</div>
      {record.results.map((r) => {
        const before = previous?.results.find((x) => x.skill === r.skill);
        return (
          <div key={r.skill} className="flex justify-between gap-3">
            <span>{BENCH_SKILLS[r.skill as BenchSkill] ?? r.skill}</span>
            <span className="shrink-0">
              <b>{r.correct}/{r.total}</b>
              {before && <span className="text-slate-500"> (was {before.correct}/{before.total} on {day(previous!.at)})</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** A fixed-form test: built from a blank learner state and a seeded shuffle, so every attempt is the same test. */
function Benchmark({ state, audio, history, onDone }: { state: LearnerState; audio: boolean; history: AssessmentRecord[]; onDone: () => void }) {
  const [form] = useState(() => currentForm(state));
  const [items] = useState(() => {
    const blank = emptyState(state.profile);
    return benchmarkForm(form.id, audio).flatMap((it, i) => {
      const ex = makeExercise(blank, { key: `bench|${form.id}|${i}`, itemId: it.itemId, facet: it.facet }, {
        now: new Date(), audio, mic: false, scaffold: 0, rng: seeded(hash(`${form.id}|${i}`)), format: it.format,
      });
      return ex ? [{ it, ex: { ...ex, showPinyin: false } }] : [];
    });
  });
  const [i, setI] = useState(0);
  const [result, setResult] = useState<GradeResult>();
  const [correct, setCorrect] = useState<boolean[]>([]);
  const [saved, setSaved] = useState<AssessmentRecord>();
  const assisted = useRef(false);
  const current = items[i];

  function next() {
    const all = [...correct, !!result && (result.verdict === 'correct' || result.verdict === 'close') && !assisted.current];
    setCorrect(all);
    setResult(undefined);
    assisted.current = false;
    if (i + 1 < items.length) return setI(i + 1);
    const record = scoreBenchmark(form.id, items.map((x) => x.it), all, Date.now());
    setSaved(record);
    void db.assessments.add(record);
  }

  if (saved) {
    // The live history already holds the attempt just saved: compare with the one before it.
    const previous = history.filter((a) => a.kind === 'benchmark' && a.form === form.id && a.at < saved.at).at(-1);
    return (
      <Screen>
        <header className="pt-6"><Label>Benchmark · {form.title}</Label><h1 className="mt-1 text-3xl font-semibold">{saved.items.filter((x) => x.correct).length} of {saved.items.length}</h1></header>
        <Card><BenchResults record={saved} previous={previous} /></Card>
        <p className="text-center text-sm text-slate-500">Take it again in two weeks to see what's changed.</p>
        <Button onClick={onDone} className="mt-auto py-4 text-lg">{t('Done')}</Button>
      </Screen>
    );
  }

  return (
    <Screen>
      <div className="flex items-center gap-3">
        <button type="button" aria-label="Stop benchmark" onClick={onDone} className="rounded-full p-2 text-2xl leading-none text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">×</button>
        <div className="flex-1"><Bar value={i / items.length} /></div>
        <span className="text-sm text-slate-500 tabular-nums">{i + 1}/{items.length}</span>
      </div>
      <p className="text-center text-xs text-slate-500">Benchmark: no hints. Using pinyin or "I'm confused" counts as not knowing it.</p>
      <ExerciseView key={i} ex={current.ex} audio={audio} result={result}
        onSubmit={(r: Response) => !result && setResult(gradeExercise(current.ex, r))}
        onContinue={next}
        onOverride={(verdict: Verdict) => setResult((r) => r && { ...r, verdict })}
        onAssist={(kind) => { if (kind === 'confused' || kind === 'pinyin') assisted.current = true; }} />
    </Screen>
  );
}
