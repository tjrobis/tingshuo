import { beforeEach, describe, expect, it } from 'vitest';
import { ankiTsv, checkIntegrity, exportBackup, importBackup, parseWordList, wordsCsv } from './backup';
import { db, loadState, persist } from './db';
import { commit, emptyState, newProfile, seedKnown } from './session';

const start = new Date('2026-10-01T09:00:00');

async function learner() {
  const profile = { ...newProfile({ name: 'T', goals: [], interests: [], sessionMinutes: 20, pinyinMode: 'new' }, start), calibratedAt: +start };
  await db.profile.put(profile);
  const s = emptyState(profile);
  const w = seedKnown(s, ['w:你好', 'w:谢谢', 'w:猫'], start);
  commit(s, w);
  await persist(w);
  return s;
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('backup', () => {
  it('round-trips the learner model, Dates included, and never contains API keys', async () => {
    const s = await learner();
    await db.secrets.put({ provider: 'openai', apiKey: 'sk-test-123' });
    const text = JSON.stringify(await exportBackup());
    expect(text).not.toContain('sk-test-123');
    await db.srs.clear();
    await db.mastery.clear();
    expect((await importBackup(text)).rows).toBeGreaterThan(0);
    const back = (await loadState())!;
    expect(back.srs.size).toBe(s.srs.size);
    expect(back.srs.get('w:猫|meaning')!.card.due).toBeInstanceOf(Date);
    expect(back.srs.get('w:猫|meaning')!.card.stability).toBe(s.srs.get('w:猫|meaning')!.card.stability);
    expect(checkIntegrity(back)).toEqual([]);
    expect(await db.secrets.get('openai')).toBeDefined(); // this device's key stays
  });

  it('refuses files that are not backups, or from a newer version, without touching the data', async () => {
    await learner();
    const n = await db.srs.count();
    await expect(importBackup('not json')).rejects.toThrow(/isn't JSON/);
    await expect(importBackup('{"app":"other","tables":{}}')).rejects.toThrow(/isn't a tingshuo backup/);
    const future = { ...(await exportBackup()), schemaVersion: db.verno + 1 };
    await expect(importBackup(JSON.stringify(future))).rejects.toThrow(/newer version/);
    await expect(importBackup('{"app":"tingshuo","schemaVersion":1,"tables":{}}')).rejects.toThrow(/no learner profile/);
    expect(await db.srs.count()).toBe(n);
  });
});

describe('word lists', () => {
  it('export as CSV and as an Anki plain-text deck', async () => {
    const s = await learner();
    const csv = wordsCsv(s, start).split('\n');
    expect(csv[0]).toBe('hanzi,pinyin,meaning,unit,status,recall_now_percent,memory_days,right,wrong');
    expect(csv.find((l) => l.startsWith('猫'))).toMatch(/^猫,māo,cat,6,/);
    const tsv = ankiTsv(s).split('\n');
    expect(tsv.slice(0, 3)).toEqual(['#separator:tab', '#html:true', '#tags column:3']);
    expect(tsv).toContain('猫\tmāo<br>cat\ttingshuo unit6');
  });

  it('import: course words can be marked known; anything else is only reported', () => {
    const r = parseWordList('#separator:tab\n你好\tnǐhǎo<br>hello\n熊猫,panda\n猫\n小明\n\n谢谢 thanks\n猫');
    expect(r).toEqual({ known: ['w:你好', 'w:猫', 'w:谢谢'], outside: ['熊猫', '小明'] });
  });
});

describe('integrity check', () => {
  it('finds corrupt cards and ids that do not match', async () => {
    const s = await learner();
    expect(checkIntegrity(s)).toEqual([]);
    s.srs.get('w:猫|meaning')!.card.stability = NaN;
    s.srs.set('w:猫|wrong', { ...s.srs.get('w:猫|listening')!, id: 'w:猫|wrong' });
    expect(checkIntegrity(s)).toEqual(['w:猫|meaning: card has a non-numeric stability or difficulty', "w:猫|wrong: id doesn't match its item and facet"]);
  });
});
