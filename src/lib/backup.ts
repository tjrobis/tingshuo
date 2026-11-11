// The learner's data in and out: a full JSON backup (API keys never included), CSV and Anki exports of
// their words, importing a word list as "already known", and an integrity check for diagnostics.

import { wordById, words } from './curriculum';
import { db } from './db';
import { masteryStatus } from './learner';
import { formatWord, parseNumbered } from './pinyin';
import { facetsOf, isIntroduced, ITEMS, type LearnerState } from './session';
import { retrievability, State } from './srs';

// Everything that is the learner's learning. Not included: `secrets` (API keys: never leave the
// device), `recordings` (audio, large) and `aiLog` (diagnostics).
const TABLES = [
  'profile', 'srs', 'mastery', 'events', 'reviews', 'errors', 'sessions', 'abilities', 'assessments',
  'pronunciation', 'conversations', 'messages', 'generated', 'achievements',
] as const;
type TableName = (typeof TABLES)[number];

export interface Backup {
  app: 'tingshuo';
  schemaVersion: number;
  exportedAt: number;
  tables: Partial<Record<TableName, unknown[]>>;
}

export async function exportBackup(): Promise<Backup> {
  const tables: Backup['tables'] = {};
  for (const t of TABLES) tables[t] = await db.table(t).toArray();
  return { app: 'tingshuo', schemaVersion: db.verno, exportedAt: Date.now(), tables };
}

/** JSON turns Dates into strings; these are the fields stored as Dates. */
const REVIVE: Partial<Record<TableName, (row: Record<string, unknown>) => void>> = {
  srs: (r) => {
    const card = r.card as Record<string, unknown>;
    card.due = new Date(card.due as string);
    if (card.last_review) card.last_review = new Date(card.last_review as string);
  },
  reviews: (r) => void (r.due = new Date(r.due as string)),
  pronunciation: (r) => void delete r.recordingId, // recordings aren't in backups
};

/**
 * Replace everything on this device with a backup. Refuses files that aren't tingshuo backups, come
 * from a newer version, or lack a profile. API keys and the AI log on this device are kept.
 */
export async function importBackup(text: string): Promise<{ rows: number }> {
  let data: Backup;
  try {
    data = JSON.parse(text) as Backup;
  } catch {
    throw new Error("That file isn't a backup (it isn't JSON).");
  }
  if (data?.app !== 'tingshuo' || typeof data.tables !== 'object' || !data.tables) throw new Error("That file isn't a tingshuo backup.");
  if (!(data.schemaVersion <= db.verno)) throw new Error('That backup comes from a newer version of the app. Update the app first.');
  const profile = data.tables.profile as { id?: string }[] | undefined;
  if (!Array.isArray(profile) || profile[0]?.id !== 'me') throw new Error('That backup has no learner profile in it.');
  let rows = 0;
  await db.transaction('rw', [...TABLES.map((t) => db.table(t)), db.recordings], async () => {
    await db.recordings.clear();
    for (const t of TABLES) {
      const list = (Array.isArray(data.tables[t]) ? data.tables[t] : []) as Record<string, unknown>[];
      list.forEach((r) => REVIVE[t]?.(r));
      await db.table(t).clear();
      await db.table(t).bulkAdd(list);
      rows += list.length;
    }
  });
  return { rows };
}

// ───────────── Word lists ─────────────
const csvCell = (x: string | number) => (/[",\n]/.test(String(x)) ? `"${String(x).replace(/"/g, '""')}"` : String(x));
const pinyinOf = (id: string) => formatWord(parseNumbered(wordById.get(id)!.pinyin));

/** Every word taught so far with how well it's known, for a spreadsheet. */
export function wordsCsv(s: LearnerState, now: Date): string {
  const rows = words.filter((w) => !w.incidental && isIntroduced(s, w.id)).map((w) => {
    const facets = facetsOf(s, w.id);
    const R = (f: string) => facets.find((x) => x.facet === f);
    const m = s.mastery.get(w.id);
    const tally = Object.values(m?.byFacet ?? {}).reduce((t, f) => [t[0] + (f?.correct ?? 0), t[1] + (f?.incorrect ?? 0)], [0, 0]);
    return [
      w.hanzi, pinyinOf(w.id), w.meanings.join('; '), w.unit, masteryStatus('word', facets, now),
      R('recall') && R('recall')!.card.state !== State.New ? Math.round(retrievability(R('recall')!.card, now) * 100) : '', // blank: never practised
      R('meaning') ? Math.round(R('meaning')!.card.stability * 10) / 10 : '', tally[0], tally[1],
    ];
  });
  const header = ['hanzi', 'pinyin', 'meaning', 'unit', 'status', 'recall_now_percent', 'memory_days', 'right', 'wrong'];
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}

/** Anki "plain text" import: hanzi | pinyin + meaning | tags. */
export function ankiTsv(s: LearnerState): string {
  const clean = (x: string) => x.replace(/[\t\n]/g, ' ');
  const lines = words.filter((w) => !w.incidental && isIntroduced(s, w.id))
    .map((w) => [w.hanzi, `${pinyinOf(w.id)}<br>${clean(w.meanings.join('; '))}`, `tingshuo unit${w.unit}`].join('\t'));
  return ['#separator:tab', '#html:true', '#tags column:3', ...lines].join('\n') + '\n';
}

/**
 * A word list from anywhere (Anki export, CSV, one word per line): the first Chinese word on each line.
 * Course words can be marked as known; anything else is only reported, never added as curriculum.
 */
export function parseWordList(text: string): { known: string[]; outside: string[] } {
  const found = text.split(/\r?\n/).flatMap((line) => line.match(/\p{Script=Han}+/u)?.[0] ?? []);
  const inCourse = (w: string) => ITEMS.has(`w:${w}`);
  return {
    known: [...new Set(found.filter(inCourse).map((w) => `w:${w}`))],
    outside: [...new Set(found.filter((w) => !inCourse(w)))],
  };
}

// ───────────── Integrity (diagnostics) ─────────────
/** The schema's integrity rules (DATABASE_SCHEMA.md), checked against the in-memory model. */
export function checkIntegrity(s: LearnerState): string[] {
  const issues: string[] = [];
  for (const x of s.srs.values()) {
    if (x.id !== `${x.itemId}|${x.facet}`) issues.push(`${x.id}: id doesn't match its item and facet`);
    if (!ITEMS.has(x.itemId)) issues.push(`${x.id}: item no longer in the curriculum`);
    if (!Number.isFinite(x.card.stability) || !Number.isFinite(x.card.difficulty)) issues.push(`${x.id}: card has a non-numeric stability or difficulty`);
    if (!(x.card.due instanceof Date) || Number.isNaN(+x.card.due)) issues.push(`${x.id}: card has an invalid due date`);
    if (!s.mastery.has(x.itemId)) issues.push(`${x.id}: no mastery record for its item`);
  }
  return issues;
}

/** Hand a file to the learner: the share sheet on a phone (Files, iCloud Drive, AirDrop), a download elsewhere. */
export async function saveFile(name: string, text: string, type: string): Promise<void> {
  const file = new File([text], name, { type });
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try {
      return await navigator.share({ files: [file] });
    } catch (e) {
      if ((e as Error).name === 'AbortError') return; // the learner closed the share sheet
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
