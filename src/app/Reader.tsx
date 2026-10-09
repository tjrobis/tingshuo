import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { PROVIDERS } from '../lib/ai';
import { speak } from '../lib/audio';
import { characters, stories, wordById } from '../lib/curriculum';
import { db, persist } from '../lib/db';
import { masteryStatus } from '../lib/learner';
import { formatWord, parseNumbered } from '../lib/pinyin';
import type { Token } from '../lib/segment';
import {
  applyLookup, applyPractice, commit, coverageTarget, facetsOf, isIntroduced, ITEMS, knowsWord, nextStory, storyCoverage, type LearnerState,
} from '../lib/session';
import { aiReady, aiStory, generateStory, pinyinOf, tokenPinyin, type AiStory } from '../lib/tutor';
import type { MasteryStatus, PinyinMode, Story } from '../lib/types';
import { Bar, Button, Card, Chip, Label, Screen, Speak } from './ui';

const STATUS: Record<MasteryStatus, string> = {
  new: 'Not practised yet', learning: 'Learning', developing: 'Getting there', strong: 'Strong', mastered: 'Mastered', at_risk: 'Fading: due for review',
};
const pct = (x: number) => `${Math.round(x * 100)}%`;
const surfaceOf = (tokens: Token[]) => tokens.map((t) => t.text).join('');
const DAY = 86_400_000;

/**
 * Chinese with every word tappable (a sheet with pinyin, meaning, audio, "practise this"); pinyin as
 * ruby over the words given one. `context` (story, dialogue, "tutor") is logged with each lookup.
 */
export function TapText({ tokens, state, audio, context, pinyin, isNew, glosses }: {
  tokens: Token[]; state: LearnerState; audio: boolean; context: string;
  pinyin?: (string | undefined)[]; isNew?: (t: Token) => boolean; glosses?: Record<string, string>;
}) {
  const [word, setWord] = useState<{ t: Token; counted: boolean }>();
  // Punctuation stays glued to the word before it: a line never starts with "，" or "：".
  const groups: number[][] = [];
  tokens.forEach((t, i) => (t.kind === 'punct' && groups.length ? groups[groups.length - 1].push(i) : groups.push([i])));
  return (
    <>
      {groups.map((g) => (
        <span key={g[0]} className="whitespace-nowrap">
          {g.map((i) => tokens[i].kind !== 'han' ? <span key={i}>{tokens[i].text}</span> : (
            <button key={i} type="button" onClick={() => setWord({ t: tokens[i], counted: lookUp(state, tokens[i], context) })}
              className={`rounded-md hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:hover:bg-slate-800 ${isNew?.(tokens[i]) ? 'underline decoration-amber-500 decoration-dotted decoration-2 underline-offset-[0.3em]' : ''}`}>
              {pinyin?.[i] ? <ruby>{tokens[i].text}<rt className="text-[0.45em] text-slate-500">{pinyin[i]}</rt></ruby> : tokens[i].text}
            </button>
          ))}
        </span>
      ))}
      {word && <WordSheet key={word.t.text} word={word.t} state={state} audio={audio} counted={word.counted} gloss={glosses?.[word.t.text]} onClose={() => setWord(undefined)} />}
    </>
  );
}

/** A tap on a word while reading (LEARNING_ENGINE §3). True when it counted as not remembering it. */
function lookUp(state: LearnerState, t: Token, context?: string): boolean {
  const id = `w:${t.ref}`;
  if (!t.ref || !ITEMS.has(id)) return false;
  const w = applyLookup(state, id, new Date(), context);
  commit(state, w);
  void persist(w);
  return !!w.reviews?.length;
}

/** Bottom sheet for a tapped word: pinyin, meaning, audio, characters, how well it's known, "practise this". */
function WordSheet({ word, state, audio, gloss, counted, onClose }: {
  word: Token; state: LearnerState; audio: boolean; gloss?: string; counted?: boolean; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = `w:${word.ref}`;
  const w = word.ref ? wordById.get(id) : undefined;
  const item = ITEMS.get(id);
  const [pinyin, setPinyin] = useState(w ? formatWord(parseNumbered(w.pinyin)) : '');
  const [asked, setAsked] = useState(() =>
    state.profile.focus.some((f) => f.kind === 'item' && f.key === id && !state.answers.some((e) => e.itemId === id && e.at > (f.since ?? 0))));

  useEffect(() => {
    dialog.current?.showModal();
    if (!w) void pinyinOf(word.text).then(setPinyin); // not a course word: computed, never the model's
  }, [w, word]);

  const status = item && isIntroduced(state, id) ? masteryStatus(item.kind, facetsOf(state, id), new Date()) : undefined;
  const chars = Array.from(word.text).flatMap((ch) => characters.filter((c) => c.char === ch));

  // Written to the stored profile; the in-memory one is reloaded on the way home, before the next session.
  async function practise() {
    const now = Date.now();
    await db.profile.where('id').equals('me').modify((p) => {
      p.focus = [...p.focus.filter((f) => !(f.kind === 'item' && f.key === id)), { kind: 'item', key: id, factor: 1, until: now + 14 * DAY, since: now }];
    });
    setAsked(true);
  }

  return (
    <dialog ref={dialog} onClose={onClose} onClick={(e) => e.target === dialog.current && onClose()}
      className="mx-auto mt-auto mb-0 w-full max-w-lg rounded-t-3xl bg-white text-slate-900 shadow-xl backdrop:bg-black/40 dark:bg-slate-900 dark:text-slate-100">
      <div className="flex flex-col gap-3 p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <div lang="zh" className="text-4xl">{word.text}</div>
            <div className="text-lg text-slate-500">{pinyin}</div>
          </div>
          {audio && <Speak text={word.text} slow />}
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-full px-3 py-1 text-2xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">×</button>
        </div>
        {w ? <p>{w.emoji && <span className="mr-1">{w.emoji}</span>}{w.meanings.join('; ')}</p> : (
          <p>{gloss || 'Not in your course yet.'}{gloss && <span className="ml-1 text-xs text-amber-700 dark:text-amber-400">AI gloss, unverified</span>}</p>
        )}
        {w?.note && <p className="text-sm text-slate-500">{w.note}</p>}
        {chars.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm">
            {chars.map((c) => (
              <li key={c.char}><span lang="zh" className="text-lg">{c.char}</span> {formatWord(parseNumbered(c.pinyin))}: {c.meaning}{c.components && <span className="text-slate-500"> · {c.components}</span>}</li>
            ))}
          </ul>
        )}
        {item && <div className="text-sm text-slate-500">{status ? STATUS[status] : 'Not learned yet'} · unit {w!.unit}</div>}
        {counted && <p className="text-xs text-slate-500">Looking it up counts as not remembering it, so it comes back sooner.</p>}
        {item && (asked
          ? <p className="text-center text-sm text-emerald-700 dark:text-emerald-400">It's in your next session.</p>
          : <Button variant="secondary" onClick={() => void practise()}>{status ? 'Practise it in my next session' : 'Learn it in my next session'}</Button>)}
      </div>
    </dialog>
  );
}

export interface StoryResult {
  correct: boolean;
  given: string;
  expected: string;
}

/** Same option order every time, but the right answer isn't always first. */
const order = (n: number, seed: number) => Array.from({ length: n }, (_, i) => (i + seed) % n);

/** A story to read: tappable words, fading pinyin, read-aloud, English on demand, then comprehension questions. */
export function StoryView({ state, story, audio, sessionId, onDone }: {
  state: LearnerState; story: Story; audio: boolean; sessionId?: number; onDone: (results: StoryResult[]) => void;
}) {
  const [mode, setMode] = useState<PinyinMode>(state.profile.pinyinMode === 'tap' ? 'never' : state.profile.pinyinMode);
  const [pinyin, setPinyin] = useState<string[][]>([]);
  const [english, setEnglish] = useState<number[]>([]);
  const [answers, setAnswers] = useState<number[]>([]);
  const [playing, setPlaying] = useState<number>();
  const run = useRef(0); // bumping it stops read-aloud
  const lines = story.paragraphs.flat();
  const starts = story.paragraphs.map((_, p) => story.paragraphs.slice(0, p).reduce((n, x) => n + x.length, 0));
  const now = new Date();

  useEffect(() => {
    void Promise.all(story.paragraphs.flat().map((l) => tokenPinyin(l.tokens))).then(setPinyin);
  }, [story]);
  useEffect(() => () => {
    run.current++;
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  }, []);

  async function play(from: number, to: number, rate?: number) {
    const r = ++run.current;
    for (let i = from; i < to && r === run.current; i++) {
      setPlaying(i);
      await speak(surfaceOf(lines[i].tokens), { rate });
    }
    if (r === run.current) setPlaying(undefined);
  }
  function stop() {
    run.current++;
    speechSynthesis.cancel();
    setPlaying(undefined);
  }

  const strong = (t: Token) => {
    const item = ITEMS.get(`w:${t.ref}`);
    return !!item && ['strong', 'mastered'].includes(masteryStatus(item.kind, facetsOf(state, item.id), now));
  };
  const shown = (t: Token) => t.kind === 'han' && (mode === 'always' || (mode === 'new' && !strong(t)));
  const isNew = (t: Token) => !wordById.get(`w:${t.ref}`)?.incidental && !(t.ref && knowsWord(state, `w:${t.ref}`, now));
  const coverage = storyCoverage(state, story, now);
  const finished = story.questions.every((_, k) => answers[k] !== undefined);

  function done() {
    stop();
    const results = story.questions.map((q, k) => ({ correct: answers[k] === q.answer, given: q.options[answers[k]], expected: q.options[q.answer] }));
    const at = new Date();
    for (const r of results) {
      const w = applyPractice(state, { slot: { key: story.id, itemId: story.id, practice: 'story', ref: story.id }, correct: r.correct, level: 0.4 * story.unit, rtMs: 0, given: r.given, expected: r.expected, sessionId }, at);
      commit(state, w);
      void persist(w);
    }
    onDone(results);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 lang="zh" className="text-3xl font-semibold">{story.titleZh}</h2>
        <p className="text-slate-500">{story.title} · you know {pct(coverage.coverage)} of the words</p>
        {story.ai && (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
            Written by AI for you and checked against your words, but not by a teacher.{story.ai.validation.issues.length > 0 && ` ${story.ai.validation.issues.join(' ')}`}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {audio && (playing === undefined
          ? <><Button variant="secondary" className="px-3 py-1.5 text-sm" onClick={() => void play(0, lines.length)}>▶ Listen</Button>
              <Button variant="ghost" className="px-3 py-1.5 text-sm" onClick={() => void play(0, lines.length, 0.75)}>0.75×</Button></>
          : <Button variant="secondary" className="px-3 py-1.5 text-sm" onClick={stop}>■ Stop</Button>)}
        <span className="ml-auto text-slate-500">Pinyin</span>
        {([['always', 'All'], ['new', 'New words'], ['never', 'Off']] as const).map(([m, l]) => (
          <Chip key={m} active={mode === m} onClick={() => setMode(m)}>{l}</Chip>
        ))}
      </div>

      {story.paragraphs.map((para, p) => (
        <div key={p} className="flex flex-col gap-1">
          <p lang="zh" className="text-2xl leading-[2.6]">
            {para.map((l, k) => {
              const i = starts[p] + k;
              return (
                <span key={k} className={playing === i ? 'rounded-lg bg-amber-100 dark:bg-amber-900/40' : ''}>
                  <TapText tokens={l.tokens} state={state} audio={audio} context={story.id} glosses={story.ai?.glosses}
                    pinyin={pinyin[i]?.map((py, j) => (shown(l.tokens[j]) ? py : undefined))} isNew={isNew} />
                </span>
              );
            })}
          </p>
          <div className="flex gap-1">
            {audio && <Button variant="ghost" className="px-2 py-1 text-sm" onClick={() => void play(starts[p], starts[p] + para.length)}>▶</Button>}
            <Button variant="ghost" className="px-2 py-1 text-sm" onClick={() => setEnglish(english.includes(p) ? english.filter((x) => x !== p) : [...english, p])}>
              {english.includes(p) ? 'Hide English' : 'English'}
            </Button>
          </div>
          {english.includes(p) && <p className="text-slate-600 dark:text-slate-400">{para.map((l) => l.en).join(' ')}</p>}
        </div>
      ))}
      <p className="text-xs text-slate-500">Tap any word for its pinyin, meaning and sound. Dotted words are new to you.</p>

      {story.questions.length > 0 && (
        <Card className="flex flex-col gap-4">
          <Label>Check your understanding</Label>
          {story.questions.map((q, k) => (
            <div key={k} className="flex flex-col gap-2">
              <p className="font-medium">{q.q}</p>
              {order(q.options.length, q.q.length).map((o) => (
                <button key={o} type="button" disabled={answers[k] !== undefined} onClick={() => setAnswers(Object.assign([...answers], { [k]: o }))}
                  className={`rounded-2xl px-4 py-2 text-left ring-1 transition ${
                    answers[k] === undefined ? 'ring-slate-300 hover:ring-indigo-400 dark:ring-slate-700'
                    : o === q.answer ? 'bg-emerald-50 ring-emerald-500 dark:bg-emerald-950/40'
                    : o === answers[k] ? 'bg-rose-50 ring-rose-500 dark:bg-rose-950/40'
                    : 'opacity-50 ring-slate-200 dark:ring-slate-800'}`}>
                  {q.options[o]}
                </button>
              ))}
            </div>
          ))}
        </Card>
      )}
      <Button disabled={!finished} onClick={done} className="py-4 text-lg">{finished ? 'Done' : 'Answer the questions to finish'}</Button>

    </div>
  );
}

const capitalise = (s: string) => s[0].toUpperCase() + s.slice(1);

/** Graded stories: curated ones ordered by fit, plus AI stories written to the learner's coverage target. */
export function Reader({ state, audio, open, onBack }: { state: LearnerState; audio: boolean; open?: string; onBack: () => void }) {
  const [story, setStory] = useState(() => stories.find((s) => s.id === open));
  const [ai, setAi] = useState(false);
  const topics = [...new Set([...state.profile.interests.map((i) => i.id), 'daily life'])];
  const [topic, setTopic] = useState(topics[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generated = useLiveQuery(() => db.generated.where('kind').equals('story').reverse().sortBy('createdAt'), []);
  useEffect(() => void aiReady(state.profile).then(setAi), [state]);

  const header = (title: string, back: () => void) => (
    <header className="flex items-center gap-2 pt-4">
      <Button variant="ghost" className="px-3" onClick={back} aria-label="Back">←</Button>
      <h1 className="flex-1 text-2xl font-semibold">{title}</h1>
    </header>
  );

  if (story) {
    return (
      <Screen>
        {header('Read', () => setStory(undefined))}
        <StoryView state={state} story={story} audio={audio} onDone={() => setStory(undefined)} />
      </Screen>
    );
  }

  async function write() {
    setBusy(true);
    setError('');
    try {
      setStory(await generateStory(state, topic));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const now = new Date();
  const read = new Set(state.answers.filter((e) => e.meta?.practice === 'story').map((e) => e.meta!.ref));
  const target = coverageTarget(state);
  const next = nextStory(state, now);
  const mine = (generated ?? []).map((g) => aiStory(g.payload as AiStory, g));

  const row = (st: Story) => {
    const c = storyCoverage(state, st, now).coverage;
    return (
      <button key={st.id} type="button" onClick={() => setStory(st)} className="flex items-center gap-3 py-3 text-left">
        <div className="flex-1">
          <div><span lang="zh" className="text-lg">{st.titleZh}</span> <span className="text-sm text-slate-500">{st.title}</span></div>
          <div className="text-xs text-slate-500">
            {read.has(st.id) && 'read · '}you know {pct(c)} of the words{st === next ? ' · good fit now' : !st.ai && c < target - 0.07 ? ` · after unit ${st.unit}` : ''}
          </div>
        </div>
        <div className="w-16"><Bar value={c} className={c >= target - 0.07 ? 'bg-teal-500' : 'bg-slate-400'} /></div>
      </button>
    );
  };

  return (
    <Screen>
      {header('Read', onBack)}
      <p className="text-sm text-slate-500">
        Stories where you know about {pct(target)} of the words. Reading lots of these is how vocabulary turns into understanding.
      </p>
      {next && (
        <Card className="flex items-center gap-3">
          <div className="flex-1"><Label>Up next</Label><div lang="zh" className="text-xl">{next.titleZh}</div><div className="text-sm text-slate-500">{next.title}</div></div>
          <Button onClick={() => setStory(next)}>Read</Button>
        </Card>
      )}
      <Card className="flex flex-col divide-y divide-slate-100 py-2 dark:divide-slate-800">{stories.map(row)}</Card>

      <Card className="flex flex-col gap-3">
        <Label>A new story, just for you</Label>
        {ai ? (
          <>
            <div className="flex flex-wrap gap-2">{topics.map((t) => <Chip key={t} active={topic === t} onClick={() => setTopic(t)}>{capitalise(t)}</Chip>)}</div>
            <Button disabled={busy} onClick={() => void write()}>{busy ? 'Writing, then checking every word…' : 'Write me a story'}</Button>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <p className="text-xs text-slate-500">
              The words you know are sent to {PROVIDERS[state.profile.ai.provider as keyof typeof PROVIDERS]?.label}. Every word is checked on this device, and pinyin is computed here, not by the AI.
            </p>
          </>
        ) : <p className="text-sm text-slate-500">Add an AI provider in Settings and the app can write new stories at your level, on topics you choose.</p>}
        {mine.length > 0 && <div className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">{mine.map(row)}</div>}
      </Card>
    </Screen>
  );
}
