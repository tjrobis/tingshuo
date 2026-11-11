import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { t } from '../lib/commands';
import { units, words } from '../lib/curriculum';
import { db } from '../lib/db';
import { errorPatterns } from '../lib/grade';
import { abilityBand, expectedKnown, masteryStatus, streak, trueRetention, weeklyVelocity } from '../lib/learner';
import { planSession } from '../lib/planner';
import { achievements, benchmarkDue, metaLearning } from '../lib/progress';
import { facetsOf, isIntroduced, ITEMS, nextStory, planInput, storyCoverage, type LearnerState } from '../lib/session';
import { micSupported, primeAudio } from '../lib/audio';
import { SKILLS, type MasteryStatus, type UserProfile } from '../lib/types';
import { CommandBox } from './Command';
import { Bar, Button, Card, Label, Screen } from './ui';

const SKILL_NAMES: Record<string, string> = {
  vocab: 'Vocabulary', listening: 'Listening', reading: 'Reading', speaking: 'Speaking', tones: 'Hearing tones',
  pronunciation: 'Pronunciation', grammar: 'Grammar', characters: 'Characters',
};
/** Rounded on purpose: these are estimates, not counts. */
const approx = (n: number) => (n < 20 ? Math.round(n) : Math.round(n / 5) * 5);
/** On an iPhone/iPad but not opened from the home screen. */
const inIosSafari = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) && !(navigator as { standalone?: boolean }).standalone && !matchMedia('(display-mode: standalone)').matches;

export function Home({ state, audio, onLearn, onOpen, onProfile }: {
  state: LearnerState; audio: boolean; onLearn: (minutes: number) => void;
  onOpen: (screen: 'pronunciation' | 'settings' | 'tutor' | 'reader' | 'progress', story?: string) => void; onProfile: (patch: Partial<UserProfile>) => void;
}) {
  const [minutes, setMinutes] = useState(state.profile.sessionMinutes);
  const [why, setWhy] = useState(false);
  const now = new Date();
  const input = planInput(state, minutes, now, audio, metaLearning(state, +now).policy);
  const plan = planSession(input);
  const all = [...state.srs.values()];

  const finished = state.sessions.filter((s) => s.endedAt);
  const today = finished.filter((s) => new Date(s.startedAt).toDateString() === now.toDateString()).reduce((m, s) => m + s.stats.minutes, 0);
  const days = streak(finished.filter((s) => s.stats.minutes >= 1).map((s) => s.startedAt), +now);
  const retention = trueRetention(state.reviews, +now);
  const talked = (useLiveQuery(() => db.conversations.where('startedAt').above(+now - 7 * 86_400_000).toArray(), []) ?? []).reduce((m, c) => m + c.minutes, 0);
  const fresh = useLiveQuery(() => db.achievements.where('unlockedAt').above(Date.now() - 3 * 86_400_000).toArray(), []) ?? [];
  const history = useLiveQuery(() => db.assessments.toArray(), []);
  const titles = new Map(achievements(state, now, []).map((a) => [a.id, a.title]));

  const statuses = new Map<string, MasteryStatus>(
    [...state.mastery.keys()].filter((id) => ITEMS.has(id)).map((id) => [id, masteryStatus(ITEMS.get(id)!.kind, facetsOf(state, id), now)]),
  );
  const atRisk = [...statuses.values()].filter((s) => s === 'at_risk').length;
  const velocity = weeklyVelocity([...state.mastery.values()].map((m) => ({ introducedAt: m.introducedAt, status: statuses.get(m.itemId) ?? 'new' })), +now);

  const teachable = words.filter((w) => !w.incidental);
  const unitNow = teachable.find((w) => !isIntroduced(state, w.id))?.unit ?? units.length;
  const unit = units[unitNow - 1];
  const inUnit = teachable.filter((w) => w.unit === unitNow);
  const m1 = units.find((u) => u.milestone)!;
  const m1Words = teachable.filter((w) => w.unit <= m1.n);
  const m1Done = m1Words.filter((w) => ['developing', 'strong', 'mastered'].includes(statuses.get(w.id) ?? '')).length;

  const skills = SKILLS.flatMap((k) => {
    const a = state.abilities.get(k);
    return a ? [{ k, a, band: abilityBand(a) }] : [];
  });
  const solid = skills.filter((x) => !x.band.tentative).sort((a, b) => b.a.theta - a.a.theta);
  const recurring = errorPatterns(state.errors, [], +now).filter((p) => p.status === 'recurring');
  const story = nextStory(state, now);
  const backupDue = [...state.mastery.values()].filter((m) => m.introducedAt !== undefined).length >= 20 && +now - (state.profile.backupAt ?? 0) > 30 * 86_400_000;

  function setLength(m: number) {
    setMinutes(m);
    void db.profile.update('me', { sessionMinutes: m });
  }

  return (
    <Screen>
      <header className="flex items-end justify-between pt-4">
        <div>
          <Label>{now.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</Label>
          <h1 className="text-2xl font-semibold">你好, {state.profile.name}</h1>
        </div>
        <div className="flex items-center gap-1">
          {days > 0 && <div className="mr-2 text-right text-sm text-slate-500"><span className="text-xl font-semibold text-slate-900 dark:text-slate-100">{days}</span> day streak</div>}
          <Button variant="ghost" className="px-3 py-2 text-sm" onClick={() => onOpen('settings')} aria-label="Settings">⚙</Button>
        </div>
      </header>

      {inIosSafari() && (
        <Card className="text-sm ring-amber-300 dark:ring-amber-800">
          <b>Install it on your iPhone:</b> tap Share, then <b>Add to Home Screen</b>. It then opens full screen, works offline,
          and keeps your progress safe: Safari can clear data for websites you haven't opened in a while.
        </Card>
      )}

      <Card className="flex flex-col gap-4 bg-gradient-to-br from-indigo-600 to-teal-600 text-white ring-0">
        <div>
          <div className="text-sm text-indigo-100">Today's priority</div>
          <p className="text-lg leading-snug">{plan.priority}</p>
        </div>
        <Button variant="inverse" onClick={() => { primeAudio(); onLearn(minutes); }} className="py-4 text-xl font-semibold">
          {t('Learn now')}
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          {[5, 10, 20, 30, 45].map((m) => (
            <button key={m} type="button" aria-pressed={minutes === m} onClick={() => setLength(m)}
              className={`rounded-full px-3 py-1 text-sm ${minutes === m ? 'bg-white text-indigo-700' : 'bg-white/15 text-white hover:bg-white/25'}`}>
              {m} min
            </button>
          ))}
          <button type="button" onClick={() => setWhy(!why)} className="ml-auto text-sm text-indigo-100 underline">Why this session?</button>
        </div>
        {why && (
          <ul className="list-disc space-y-1 pl-5 text-sm text-indigo-50">
            {plan.blocks.map((b) => <li key={b.kind}><b>{b.minutes} min {b.kind}</b>: {b.reason}</li>)}
            {plan.rationale.filter((r) => !plan.blocks.some((b) => b.reason === r)).map((r) => <li key={r}>{r}</li>)}
          </ul>
        )}
      </Card>

      <div className="grid grid-cols-4 gap-2">
        {([['tutor', 'Talk'], ['reader', 'Read'], ['pronunciation', 'Tones'], ['progress', 'Progress']] as const).map(([screen, name]) => (
          <Button key={screen} variant="secondary" className="px-1 text-sm" onClick={() => onOpen(screen)}>{t(name)}</Button>
        ))}
      </div>

      <CommandBox profile={state.profile} onPatch={(patch) => {
        onProfile(patch);
        if (patch.sessionMinutes) setMinutes(patch.sessionMinutes);
      }} />

      {story && (
        <Card className="flex items-center gap-3">
          <div className="flex-1">
            <Label>A story you can read</Label>
            <div className="text-xl" lang="zh">{story.titleZh}</div>
            <div className="text-sm text-slate-500">{story.title} · you know {Math.round(storyCoverage(state, story, now).coverage * 100)}% of the words</div>
          </div>
          <Button variant="secondary" onClick={() => onOpen('reader', story.id)}>Read</Button>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Card className="flex flex-col gap-2">
          <Label>Today</Label>
          <div className="text-2xl font-semibold">{Math.round(today)}<span className="text-base font-normal text-slate-500"> / {state.profile.dailyMinutes} min</span></div>
          <Bar value={today / state.profile.dailyMinutes} className="bg-teal-500" />
        </Card>
        <Card className="flex flex-col gap-1">
          <Label>Due for review</Label>
          <div className="text-2xl font-semibold">{input.dueCount}</div>
          <div className="text-sm text-slate-500">{atRisk ? `${atRisk} at risk of being forgotten` : 'Nothing at risk'}</div>
        </Card>
      </div>

      <Card className="flex flex-col gap-3">
        <Label>Where you are</Label>
        <div>
          <div className="font-medium">Unit {unit.n} · {unit.title} <span className="text-slate-500">{unit.titleZh}</span></div>
          <p className="text-sm text-slate-500">{unit.goal}</p>
        </div>
        <Bar value={inUnit.filter((w) => isIntroduced(state, w.id)).length / inUnit.length} />
        <div className="text-sm">
          <span className="font-medium">First 5-minute conversation:</span> {m1Done} of {m1Words.length} words holding
          <div className="mt-1"><Bar value={m1Done / m1Words.length} className="bg-teal-500" /></div>
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <Label>What you can do</Label>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div><div className="text-2xl font-semibold">{approx(expectedKnown(all, 'meaning', now))}</div><div className="text-xs text-slate-500">words you'd recognise now</div></div>
          <div><div className="text-2xl font-semibold">{approx(expectedKnown(all, 'recall', now))}</div><div className="text-xs text-slate-500">words you can say</div></div>
          <div><div className="text-2xl font-semibold">{approx(expectedKnown(all, 'listening', now))}</div><div className="text-xs text-slate-500">words you'd catch by ear</div></div>
        </div>
        <div className="flex justify-between text-sm">
          <span>Retention (30 days)</span>
          <span className="text-slate-500">{retention.rate === null ? `not enough data yet (${retention.n}/10 reviews)` : `${Math.round(retention.rate * 100)}% of ${retention.n} reviews`}</span>
        </div>
        <div className="flex justify-between text-sm"><span>Learned this week and holding</span><span className="text-slate-500">{velocity}</span></div>
        <div className="flex justify-between text-sm"><span>Conversation this week</span><span className="text-slate-500">{Math.round(talked)} min</span></div>
        {fresh.map((a) => <div key={a.id} className="text-sm">🏅 <b>New:</b> {titles.get(a.id) ?? a.id}</div>)}
        {history && benchmarkDue(state, history, +now) && (
          <button type="button" onClick={() => onOpen('progress')} className="text-left text-sm text-indigo-700 underline dark:text-indigo-300">A benchmark is due: see how far you've come (5 min)</button>
        )}
        <button type="button" onClick={() => onOpen('progress')} className="text-left text-sm text-slate-500 underline">Knowledge map, benchmarks and achievements</button>
      </Card>

      {skills.length > 0 && (
        <Card className="flex flex-col gap-2">
          <Label>Skills</Label>
          {skills.map(({ k, band }) => (
            <div key={k} className="flex justify-between text-sm">
              <span>{SKILL_NAMES[k]}</span>
              <span className="text-slate-500">{band.label}{band.tentative && ' (early estimate)'}</span>
            </div>
          ))}
          {solid.length >= 2 && (
            <p className="text-sm"><b>Strongest:</b> {SKILL_NAMES[solid[0].k]}. <b>Needs work:</b> {SKILL_NAMES[solid[solid.length - 1].k]}.</p>
          )}
        </Card>
      )}

      {recurring.length > 0 && (
        <Card className="flex flex-col gap-2">
          <Label>Keeps tripping you up</Label>
          {recurring.slice(0, 5).map((p) => <div key={p.key} className="text-sm">{p.label} <span className="text-slate-500">({p.count}×)</span></div>)}
          <p className="text-xs text-slate-500">These get targeted drills in your sessions.</p>
        </Card>
      )}

      {backupDue && (
        <Card className="flex items-center gap-3">
          <p className="flex-1 text-sm"><b>Back up your progress.</b> It lives only on this device; a backup in iCloud Drive keeps it safe.</p>
          <Button variant="secondary" className="shrink-0" onClick={() => onOpen('settings')}>Back up</Button>
        </Card>
      )}

      {audio && micSupported() && !state.profile.micAvailable && (
        <Card className="flex items-center justify-between gap-3">
          <p className="text-sm"><b>Speaking practice is off.</b> Turn on your microphone to practise tones and shadow sentences, with feedback on each syllable.</p>
          <Button variant="secondary" className="shrink-0" onClick={() => onOpen('settings')}>Turn on</Button>
        </Card>
      )}

      {!audio && <p className="text-center text-sm text-amber-600">No Chinese voice found on this device, so listening and tone practice are off. Add a Chinese (Mainland) voice in your system's speech settings.</p>}
      <p className="text-center text-xs text-slate-500">Everything stays on this device.</p>
    </Screen>
  );
}
