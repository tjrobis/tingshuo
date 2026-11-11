import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState, type ReactNode } from 'react';
import { checkIntegrity } from '../lib/backup';
import { db } from '../lib/db';
import { errorPatterns } from '../lib/grade';
import { planSession } from '../lib/planner';
import { metaLearning } from '../lib/progress';
import { drillWins, planInput, type LearnerState } from '../lib/session';
import { retrievability, State } from '../lib/srs';
import { Button, Card, Label, Screen } from './ui';

const STATES = ['new', 'learning', 'review', 'relearning'];
const mb = (n?: number) => (n === undefined ? '?' : `${(n / 1_048_576).toFixed(1)} MB`);
const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <Card className="py-3"><details><summary className="cursor-pointer font-medium">{title}</summary><div className="mt-3 flex flex-col gap-2 text-sm">{children}</div></details></Card>
);
const Json = ({ value }: { value: unknown }) => <pre className="overflow-x-auto rounded-xl bg-slate-50 p-2 text-xs dark:bg-slate-800/60">{JSON.stringify(value, null, 2)}</pre>;

/** What the engine sees and decides: for checking the learner model, not for learning. */
export function Debug({ state, audio, onBack }: { state: LearnerState; audio: boolean; onBack: () => void }) {
  const [filter, setFilter] = useState('');
  const [storage, setStorage] = useState<{ usage?: number; quota?: number; persisted?: boolean }>({});
  const ai = useLiveQuery(() => db.aiLog.orderBy('at').reverse().limit(30).toArray(), []) ?? [];
  const generated = useLiveQuery(() => db.generated.orderBy('createdAt').reverse().toArray(), []) ?? [];
  useEffect(() => {
    void Promise.all([navigator.storage?.estimate?.(), navigator.storage?.persisted?.()])
      .then(([e, persisted]) => setStorage({ usage: e?.usage, quota: e?.quota, persisted }));
  }, []);

  const now = new Date();
  const meta = metaLearning(state, +now);
  const input = planInput(state, state.profile.sessionMinutes, now, audio, meta.policy);
  const plan = planSession(input);
  const issues = checkIntegrity(state);
  const cards = [...state.srs.values()].filter((x) => !filter || x.itemId.includes(filter)).sort((a, b) => +a.card.due - +b.card.due);

  return (
    <Screen>
      <header className="flex items-center gap-2 pt-4">
        <Button variant="ghost" className="px-3" onClick={onBack} aria-label="Back">←</Button>
        <h1 className="text-2xl font-semibold">Diagnostics</h1>
      </header>

      <Card className="flex flex-col gap-1 text-sm">
        <Label>Integrity</Label>
        {issues.length ? issues.slice(0, 20).map((x) => <p key={x} className="text-rose-600">{x}</p>) : <p>No problems in {state.srs.size} memory cards.</p>}
        <Label>Storage</Label>
        <p>
          {mb(storage.usage)} used of {mb(storage.quota)} · {storage.persisted ? 'protected from eviction' : 'not protected from eviction (install to the Home Screen)'} ·{' '}
          {state.mastery.size} items, {state.reviews.length} reviews, {state.answers.length} answers, {state.errors.length} errors
        </p>
      </Card>

      <Section title={`Planner: next ${input.minutes}-minute session`}>
        {plan.blocks.map((b) => <p key={b.kind}><b>{b.kind} {b.minutes} min</b>: {b.reason}</p>)}
        {plan.rationale.filter((r) => !plan.blocks.some((b) => b.reason === r)).map((r) => <p key={r}>{r}</p>)}
        <Json value={{ ...input, abilities: input.abilities, policy: meta.policy }} />
      </Section>

      <Section title={`Memory cards (${state.srs.size})`}>
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by item, e.g. 猫 or t:" autoCapitalize="off" autoCorrect="off"
          className="rounded-xl bg-slate-100 px-3 py-2 dark:bg-slate-800" />
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead className="text-left text-slate-500"><tr><th>Item</th><th>Facet</th><th>State</th><th>S (d)</th><th>D</th><th>R now</th><th>Due</th></tr></thead>
            <tbody>
              {cards.slice(0, 150).map((x) => (
                <tr key={x.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td>{x.itemId}</td><td>{x.facet}</td><td>{STATES[x.card.state]}</td>
                  <td>{x.card.stability.toFixed(1)}</td><td>{x.card.difficulty.toFixed(1)}</td>
                  <td>{x.card.state === State.New ? '' : `${Math.round(retrievability(x.card, now) * 100)}%`}</td>
                  <td>{x.card.due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {cards.length > 150 && <p className="text-slate-500">Showing the 150 due soonest; filter to see others.</p>}
      </Section>

      <Section title={`Error patterns (${errorPatterns(state.errors, drillWins(state), +now).length})`}>
        {errorPatterns(state.errors, drillWins(state), +now).map((p) => <p key={p.key}>{p.label} · {p.count}× · {p.status}</p>)}
      </Section>

      <Section title={`Meta-learning (${meta.insights.length} insights, ${meta.running.length} running)`}>
        <Json value={meta} />
      </Section>

      <Section title={`AI requests (last ${ai.length})`}>
        {ai.map((x) => (
          <details key={x.id}>
            <summary className={x.ok ? '' : 'text-rose-600'}>
              {new Date(x.at).toLocaleString()} · {x.purpose} · {x.provider} {x.model} · {Math.round(x.ms)} ms{x.error ? ` · ${x.error}` : ''}
            </summary>
            <Json value={{ request: JSON.parse(x.request), response: x.response, usage: x.usage }} />
          </details>
        ))}
      </Section>

      <Section title={`AI stories: validation (${generated.length})`}>
        {generated.map((g) => <p key={g.id}>#{g.id} · {g.topic} · {Math.round(g.validation.coverage * 100)}% known · {g.validation.passed ? 'passed' : 'failed'} after {g.validation.attempts} · {g.validation.issues.join(' ')}</p>)}
      </Section>
    </Screen>
  );
}
