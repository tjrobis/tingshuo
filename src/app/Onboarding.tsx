import { useState } from 'react';
import { TOPICS as INTERESTS } from '../lib/commands';
import { db } from '../lib/db';
import { emptyState, newProfile, type LearnerState } from '../lib/session';
import type { PinyinMode } from '../lib/types';
import { Button, Card, Chip, Label, Screen } from './ui';

// Topic ids match the lexicon's topic tags; interests reorder words within a unit, never the method.
const DEFAULT_INTERESTS = ['gaming', 'travel', 'food', 'dating', 'people', 'school', 'outdoors', 'tech', 'culture'];
const GOALS = ['Hold real conversations', 'Understand native speakers', 'Travel or live in China', 'Make Chinese friends', 'Read Chinese', 'Understand Chinese media'];
const PINYIN: [PinyinMode, string, string][] = [
  ['new', 'Until I know the word', 'Recommended: pinyin fades as each word becomes strong'],
  ['always', 'Always', 'Show pinyin on everything'],
  ['tap', 'Tap to show', 'Hidden unless you ask (counts as a hint)'],
];

export function Onboarding({ onDone }: { onDone: (s: LearnerState) => void }) {
  const [name, setName] = useState('');
  const [interests, setInterests] = useState(DEFAULT_INTERESTS);
  const [goals, setGoals] = useState(GOALS.slice(0, 3));
  const [minutes, setMinutes] = useState(20);
  const [pinyinMode, setPinyinMode] = useState<PinyinMode>('new');
  const toggle = (xs: string[], x: string) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);

  async function start() {
    const profile = newProfile({ name: name || 'friend', goals, interests, sessionMinutes: minutes, pinyinMode }, new Date());
    await db.profile.put(profile);
    onDone(emptyState(profile));
  }

  return (
    <Screen>
      <header className="pt-6 pb-2">
        <h1 className="text-4xl font-semibold">听说 <span className="text-slate-400">Tīngshuō</span></h1>
        <p className="mt-2 text-slate-600 dark:text-slate-300">
          A private Mandarin teacher that remembers what you know, notices what you struggle with, and decides what to practise next.
        </p>
      </header>

      <Card className="flex flex-col gap-3">
        <Label>What should I call you?</Label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          autoComplete="given-name"
          className="rounded-2xl bg-slate-100 px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800"
        />
      </Card>

      <Card className="flex flex-col gap-3">
        <Label>What do you want to be able to do?</Label>
        <div className="flex flex-wrap gap-2">
          {GOALS.map((g) => <Chip key={g} active={goals.includes(g)} onClick={() => setGoals(toggle(goals, g))}>{g}</Chip>)}
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <Label>What should your Chinese be about?</Label>
        <div className="flex flex-wrap gap-2">
          {INTERESTS.map(([id, label]) => <Chip key={id} active={interests.includes(id)} onClick={() => setInterests(toggle(interests, id))}>{label}</Chip>)}
        </div>
        <p className="text-sm text-slate-500">This changes what examples are about, not how you're taught.</p>
      </Card>

      <Card className="flex flex-col gap-3">
        <Label>Usual session length</Label>
        <div className="flex flex-wrap gap-2">
          {[5, 10, 20, 30, 45].map((m) => <Chip key={m} active={minutes === m} onClick={() => setMinutes(m)}>{m} min</Chip>)}
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <Label>Show pinyin</Label>
        {PINYIN.map(([mode, title, hint]) => (
          <label key={mode} className="flex cursor-pointer items-start gap-3">
            <input type="radio" name="pinyin" checked={pinyinMode === mode} onChange={() => setPinyinMode(mode)} className="mt-1 accent-indigo-600" />
            <span><span className="font-medium">{title}</span><br /><span className="text-sm text-slate-500">{hint}</span></span>
          </label>
        ))}
      </Card>

      <Button onClick={start} className="mt-2 py-4 text-lg">Continue</Button>
      <p className="text-center text-xs text-slate-500">Everything you do stays on this device.</p>
    </Screen>
  );
}
