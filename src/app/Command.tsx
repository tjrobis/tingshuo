import { useState } from 'react';
import { applyCommand, commandRequest, parseAiCommand, parseCommand, type Command } from '../lib/commands';
import { db } from '../lib/db';
import { aiReady, ask } from '../lib/tutor';
import type { UserProfile } from '../lib/types';
import { Button } from './ui';

/** "Tell the app…": plain-English requests become saved settings. The parent applies the patch. */
export function CommandBox({ profile, onPatch }: { profile: UserProfile; onPatch: (patch: Partial<UserProfile>, c: Command) => void }) {
  const [text, setText] = useState('');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  async function run() {
    const said = text.trim();
    if (!said || busy) return;
    setBusy(true);
    // Rules first; the AI (if set up) only maps unusual phrasing onto the same commands.
    let c = parseCommand(said);
    if (!c && (await aiReady(profile))) c = parseAiCommand(await ask(profile, commandRequest(said)).catch(() => ''));
    setBusy(false);
    if (!c) {
      setReply('Not sure what to change. Try "too easy", "more listening", "less pinyin", "slower", "fewer new words" or "more food".');
      return;
    }
    const { patch, message } = applyCommand(profile, c, Date.now());
    onPatch(patch, c);
    void db.events.add({ at: Date.now(), type: 'command', meta: { text: said, kind: c.kind } });
    setReply(message);
    setText('');
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); void run(); }} className="flex flex-col gap-1">
      <div className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder='Tell the app: "too easy", "more listening"…' aria-label="Tell the app what you want"
          className="min-w-0 flex-1 rounded-2xl bg-slate-100 px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800" />
        <Button type="submit" variant="secondary" className="px-4 py-2.5" disabled={busy || !text.trim()}>{busy ? '…' : 'OK'}</Button>
      </div>
      {reply && <p role="status" className="px-2 text-sm text-slate-600 dark:text-slate-400">{reply}</p>}
    </form>
  );
}
