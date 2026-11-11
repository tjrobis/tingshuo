import { useEffect, useRef, useState, type ReactNode } from 'react';
import { playBlob, speak } from '../lib/audio';
import { t } from '../lib/commands';
import type { Exercise, Response } from '../lib/exercise';
import type { GradeResult, Verdict } from '../lib/grade';
import type { Speaker } from '../lib/pitch';
import { Recorder, SpeechReview, type Spoken } from './Recorder';
import { Button, Card, Label, Speak } from './ui';

interface Props {
  ex: Exercise;
  audio: boolean;
  result?: GradeResult; // set once answered
  onSubmit: (r: Response) => void;
  onContinue: () => void;
  /** Learner overrides the verdict (typo the grader missed, valid alternative answer, unclear audio…). */
  onOverride?: (verdict: Verdict) => void;
  /** Hints, slow audio, revealed pinyin, help panels: the answer then counts as assisted. */
  onAssist: (kind: 'confused' | 'why' | 'pinyin' | 'slow') => void;
  speaker?: Speaker;
  /** Speech recognition opted in (clarity scores). */
  stt?: boolean;
  /** "I'm confused" → ask the AI for a different explanation (only when AI is set up). */
  explain?: () => Promise<string>;
  /** A recording was analysed (saved even if the learner later overrides the verdict). */
  onSpoken?: (s: Spoken) => void;
}

const Chinese = ({ text, highlight, className = 'text-4xl' }: { text: string; highlight?: string; className?: string }) => {
  if (!highlight || !text.includes(highlight)) return <span className={className}>{text}</span>;
  const [before, ...rest] = text.split(highlight);
  return <span className={className}>{before}<mark className="rounded-lg bg-amber-200/70 px-0.5 text-inherit dark:bg-amber-500/30">{highlight}</mark>{rest.join(highlight)}</span>;
};

export function ExerciseView({ ex, audio, result, onSubmit, onContinue, onOverride, onAssist, speaker, onSpoken, stt, explain }: Props) {
  const [aiText, setAiText] = useState('');
  const [text, setText] = useState('');
  const [tiles, setTiles] = useState<number[]>([]);
  const [pinyinShown, setPinyinShown] = useState(false);
  const [textShown, setTextShown] = useState(!ex.intro?.audioFirst);
  const [panel, setPanel] = useState<'confused' | 'why' | null>(null);
  const [spoken, setSpoken] = useState<Spoken>();
  const playing = useRef(0); // bumping it cancels a dialogue that is mid-playback
  const answered = !!result;
  const intro = ex.intro;

  /** Dialogue lines in turn, each speaker with their own voice where the device has two. */
  async function playDialogue(rate?: number) {
    const run = ++playing.current;
    for (const line of ex.dialogue ?? []) {
      if (run !== playing.current) return;
      await speak(line.zh, { rate, voice: line.speaker === 'A' ? 0 : 1 });
    }
  }

  useEffect(() => {
    if (!audio) return;
    if (ex.dialogue) void playDialogue();
    else if (ex.audio && (ex.autoplay || intro)) void speak(ex.audio, { voice: ex.voice });
    // A playback counter, not a DOM ref: bumping the latest value is exactly what cancels playback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => void playing.current++;
  }, [ex, audio, intro]); // eslint-disable-line react-hooks/exhaustive-deps -- playDialogue reads ex

  const submitText = () => text.trim() && onSubmit({ text });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if ((answered || intro) && e.key === 'Enter') onContinue();
      const n = Number(e.key);
      if (!answered && ex.choices && n >= 1 && n <= ex.choices.length) onSubmit({ choice: n - 1 });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [answered, intro, ex, onContinue, onSubmit]);

  const openPanel = (p: 'confused' | 'why') => {
    if (panel !== p) onAssist(p);
    setPanel(panel === p ? null : p);
  };
  const showPinyin = ex.showPinyin || pinyinShown || answered;
  const zhVisible = !ex.hideZh || answered;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <Label>{ex.instruction}</Label>
        <div className="flex gap-1">
          <Button variant="ghost" className="px-3 py-1.5 text-sm" onClick={() => openPanel('confused')}>{t("I'm confused")}</Button>
          <Button variant="ghost" className="px-3 py-1.5 text-sm" onClick={() => openPanel('why')}>{t('Why this?')}</Button>
        </div>
      </div>

      {intro ? (
        <Card className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            {ex.emoji && <span className="text-4xl">{ex.emoji}</span>}
            <span className="text-4xl font-medium">{intro.heading}</span>
          </div>
          {intro.lines.map((l) => <p key={l} className="text-slate-700 dark:text-slate-300">{l}</p>)}
          <div className="flex flex-col gap-3">
            {intro.examples.map((x) => (
              <div key={x.zh} className="flex items-start gap-2 rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/60">
                {audio && <Speak text={x.zh} slow onPlay={() => setTextShown(true)} />}
                <div className={`flex-1 transition ${textShown ? '' : 'blur-md select-none'}`} aria-hidden={!textShown}>
                  <Chinese text={x.zh} highlight={ex.highlight} className="text-2xl" />
                  {x.pinyin && <div className="text-sm text-slate-500">{x.pinyin}</div>}
                  {x.en && <div className="text-sm">{x.en}</div>}
                </div>
              </div>
            ))}
          </div>
          {!textShown && <Button variant="secondary" onClick={() => setTextShown(true)}>Listen first, then show the text</Button>}
        </Card>
      ) : (
        <Card className="flex flex-col items-center gap-3 py-8 text-center">
          {ex.dialogue && (
            <div className="flex w-full flex-col items-center gap-3">
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => void playDialogue()}>▶ Play conversation</Button>
                <Button variant="ghost" onClick={() => { onAssist('slow'); void playDialogue(0.75); }}>Slower</Button>
              </div>
              {answered && (
                <ol className="flex w-full flex-col gap-2 text-left">
                  {ex.dialogue.map((l, i) => (
                    <li key={i} className={`flex items-start gap-2 ${l.speaker === 'B' ? 'flex-row-reverse text-right' : ''}`}>
                      <Speak text={l.zh} />
                      <div className={`rounded-2xl px-3 py-2 ${l.speaker === 'A' ? 'bg-slate-100 dark:bg-slate-800' : 'bg-indigo-50 dark:bg-indigo-950/50'}`}>
                        <div className="text-xl">{l.zh}</div>
                        <div className="text-sm text-slate-500">{l.pinyin}</div>
                        <div className="text-sm">{l.en}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
          {ex.prompt && <p className="text-lg">{ex.emoji && <span className="mr-2">{ex.emoji}</span>}{ex.prompt}</p>}
          {!ex.prompt && ex.emoji && <span className="text-4xl">{ex.emoji}</span>}
          {ex.zh && (zhVisible
            ? <Chinese text={answered && ex.filled ? ex.filled.zh : ex.zh} highlight={ex.highlight} className={ex.zh.length > 6 ? 'text-3xl' : 'text-6xl'} />
            : <button type="button" onClick={() => ex.audio && void speak(ex.audio, { voice: ex.voice })} className="rounded-full bg-indigo-600 p-6 text-white shadow-lg" aria-label="Play again">
                <svg viewBox="0 0 24 24" className="size-10" fill="currentColor" aria-hidden><path d="M11 5 6 9H2v6h4l5 4V5z" /></svg>
              </button>)}
          {ex.zh && zhVisible && ex.pinyin && (showPinyin
            ? <div className="text-slate-500">{answered && ex.filled ? ex.filled.pinyin : ex.pinyin}</div>
            : !ex.pinyinOnly && <button type="button" className="text-sm text-indigo-600 dark:text-indigo-400" onClick={() => { setPinyinShown(true); onAssist('pinyin'); }}>Show pinyin</button>)}
          {audio && ex.audio && (zhVisible || ex.hideZh) && !(ex.speak?.selfCheck && !answered) && (
            <Speak text={ex.audio} slow voice={ex.voice} onPlay={(isSlow) => isSlow && onAssist('slow')} />
          )}
        </Card>
      )}

      {!answered && !intro && ex.speak && (spoken && ex.speak.selfCheck
        ? <SelfCheck ex={ex} spoken={spoken} onSubmit={onSubmit} onRetry={() => setSpoken(undefined)} />
        : <Recorder key={spoken ? 'again' : 'first'} expected={ex.speak.expected} speaker={speaker} stt={stt} text={ex.reveal.zh} onDone={(s) => {
            setSpoken(s);
            onSpoken?.(s);
            if (!ex.speak!.selfCheck) onSubmit({ speech: s.analysis });
          }} />)}

      {!answered && !intro && !ex.speak && <AnswerInput ex={ex} text={text} setText={setText} tiles={tiles} setTiles={setTiles} onSubmit={onSubmit} submitText={submitText} />}

      {answered && <Feedback ex={ex} result={result!} audio={audio} onOverride={onOverride} spoken={spoken} />}

      {panel && (
        <Card className="flex flex-col gap-3 bg-indigo-50 ring-indigo-100 dark:bg-slate-900">
          {panel === 'why' ? <p>{ex.help.why}</p> : (
            <>
              {ex.help.breakdown.length > 0 && (
                <table className="text-left"><tbody>
                  {ex.help.breakdown.map((b) => (
                    <tr key={b.zh}><td className="pr-3 text-xl">{b.zh}</td><td className="pr-3 text-slate-500">{b.pinyin}</td><td>{b.en}</td></tr>
                  ))}
                </tbody></table>
              )}
              {ex.help.notes.map((n) => <p key={n} className="text-sm">{n}</p>)}
              {audio && ex.audio && <div className="flex items-center gap-2 text-sm">Hear it slowly: <Speak text={ex.audio} slow /></div>}
              {explain && (aiText
                ? <p className="text-sm whitespace-pre-line">{aiText}</p>
                : <Button variant="secondary" onClick={() => { setAiText('Thinking…'); explain().then(setAiText, (e: Error) => setAiText(e.message)); }}>Explain it another way (AI)</Button>)}
            </>
          )}
        </Card>
      )}

      {(answered || intro) && result?.verdict !== 'unsure' && (
        <Button onClick={onContinue} className="mt-auto py-4 text-lg" autoFocus>{t(intro ? 'Got it' : 'Continue')}</Button>
      )}
    </div>
  );
}

function AnswerInput({ ex, text, setText, tiles, setTiles, onSubmit, submitText }: {
  ex: Exercise; text: string; setText: (t: string) => void; tiles: number[]; setTiles: (t: number[]) => void;
  onSubmit: (r: Response) => void; submitText: () => void;
}) {
  if (ex.choices) {
    return (
      <div className={`grid gap-2 ${ex.choices.length === 2 ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'}`}>
        {ex.choices.map((c, i) => (
          <Button key={`${c.label}${i}`} variant="secondary" onClick={() => onSubmit({ choice: i })} className="flex flex-col items-center py-4">
            <span className="text-xl">{c.label}</span>
            {c.sub && <span className="text-sm text-slate-500">{c.sub}</span>}
          </Button>
        ))}
      </div>
    );
  }
  if (ex.tiles) {
    const chosen = tiles.map((i) => ex.tiles![i]);
    return (
      <div className="flex flex-col gap-3">
        <div className="flex min-h-14 flex-wrap items-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 p-2 dark:border-slate-700">
          {tiles.map((i, k) => (
            <button key={k} type="button" onClick={() => setTiles(tiles.filter((_, j) => j !== k))} className="rounded-xl bg-indigo-600 px-3 py-2 text-xl text-white">{ex.tiles![i]}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {ex.tiles.map((t, i) => (
            <button key={i} type="button" disabled={tiles.includes(i)} onClick={() => setTiles([...tiles, i])}
              className="rounded-xl bg-slate-100 px-3 py-2 text-xl disabled:opacity-20 dark:bg-slate-800">{t}</button>
          ))}
        </div>
        <Button disabled={chosen.length !== ex.tiles.length} onClick={() => onSubmit({ order: chosen })}>{t('Check')}</Button>
      </div>
    );
  }
  const english = !!ex.accepted;
  return (
    <form onSubmit={(e) => { e.preventDefault(); submitText(); }} className="flex flex-col gap-2">
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        lang={english ? 'en' : 'zh'}
        autoCapitalize="off" autoCorrect="off" spellCheck={false} autoComplete="off"
        placeholder={english ? 'Answer in English' : ex.pinyinOnly ? 'Pinyin with tone numbers, e.g. ni3 hao3' : 'Pinyin (ni3 hao3) or 汉字'}
        className="rounded-2xl bg-white px-4 py-4 text-xl ring-1 ring-slate-300 outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-900 dark:ring-slate-700"
      />
      <Button type="submit" disabled={!text.trim()}>{t('Check')}</Button>
    </form>
  );
}

/** Spoken recall: pitch analysis can't tell which word was said, so the learner compares and judges. */
function SelfCheck({ ex, spoken, onSubmit, onRetry }: { ex: Exercise; spoken: Spoken; onSubmit: (r: Response) => void; onRetry: () => void }) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div>
          <div className="text-2xl">{ex.reveal.zh}</div>
          <div className="text-slate-500">{ex.reveal.pinyin}</div>
        </div>
        <Speak text={ex.reveal.zh} slow />
        <Button variant="secondary" className="px-3 py-2 text-sm" onClick={() => playBlob(spoken.recording.blob)}>▶ Me</Button>
      </div>
      {spoken.heard !== undefined && <p className="text-sm text-slate-500">Speech recognition heard: {spoken.heard || '(nothing)'}</p>}
      <p className="text-sm">Did you say this?</p>
      <div className="grid grid-cols-3 gap-2">
        <Button variant="bad" onClick={() => onSubmit({ speech: spoken.analysis, self: 'off' })}>No</Button>
        <Button variant="secondary" onClick={() => onSubmit({ speech: spoken.analysis, self: 'close' })}>Nearly</Button>
        <Button variant="good" onClick={() => onSubmit({ speech: spoken.analysis, self: 'good' })}>Yes</Button>
      </div>
      <button type="button" onClick={onRetry} className="self-start text-sm text-slate-500 underline">Record again</button>
    </Card>
  );
}

function Feedback({ ex, result, audio, onOverride, spoken }: { ex: Exercise; result: GradeResult; audio: boolean; onOverride?: (v: Verdict) => void; spoken?: Spoken }) {
  const tone: Record<string, [string, ReactNode]> = {
    correct: ['bg-emerald-50 ring-emerald-200 dark:bg-emerald-950/40 dark:ring-emerald-900', 'Correct'],
    close: ['bg-amber-50 ring-amber-200 dark:bg-amber-950/40 dark:ring-amber-900', 'Almost'],
    wrong: ['bg-rose-50 ring-rose-200 dark:bg-rose-950/40 dark:ring-rose-900', 'Not quite'],
    unsure: ['bg-slate-50 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700', spoken ? "I couldn't judge that clearly" : 'Compare with the model answer'],
  };
  const [style, title] = tone[result.verdict];
  return (
    <Card className={`flex flex-col gap-2 ${style}`}>
      <div className="font-semibold">{title}</div>
      {spoken ? <SpeechReview spoken={spoken} native={ex.reveal.zh} /> : (
        <>
          {result.notes.map((n) => <p key={n} className="text-sm">{n}</p>)}
          <div className="flex items-center gap-2">
            <div>
              {ex.reveal.zh && <div className="text-2xl">{ex.reveal.zh}</div>}
              {ex.reveal.pinyin && <div className="text-slate-500">{ex.reveal.pinyin}</div>}
              {ex.reveal.en && <div>{ex.reveal.en}</div>}
            </div>
            {audio && ex.reveal.zh && <Speak text={ex.reveal.zh} slow />}
          </div>
        </>
      )}
      {result.verdict === 'unsure' && onOverride && (spoken ? (
        <>
          <p className="text-sm">Listen to both. How close were you?</p>
          <div className="grid grid-cols-3 gap-2">
            <Button variant="bad" onClick={() => onOverride('wrong')}>Off</Button>
            <Button variant="secondary" onClick={() => onOverride('close')}>Close</Button>
            <Button variant="good" onClick={() => onOverride('correct')}>Matched</Button>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="bad" onClick={() => onOverride('wrong')}>I was wrong</Button>
          <Button variant="good" onClick={() => onOverride('correct')}>I was right</Button>
        </div>
      ))}
      {result.verdict === 'wrong' && onOverride && (ex.accepted || ex.targets) && (
        <button type="button" onClick={() => onOverride('correct')} className="self-start text-sm text-slate-500 underline">My answer was actually right</button>
      )}
    </Card>
  );
}
