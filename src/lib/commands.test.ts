import { describe, expect, it } from 'vitest';
import { applyCommand, CANONICAL, parseAiCommand, parseCommand, setImmersion, t } from './commands';
import { newProfile } from './session';

const profile = () => newProfile({ name: 'T', goals: [], interests: ['food'], sessionMinutes: 20, pinyinMode: 'new' }, new Date(0));

describe('commands', () => {
  it('understands everyday phrasings', () => {
    expect(parseCommand('This is too easy')).toEqual({ kind: 'difficulty', delta: -1 });
    expect(parseCommand('way too hard for me')).toEqual({ kind: 'difficulty', delta: 1 });
    expect(parseCommand('more listening please')).toEqual({ kind: 'focus', skill: 'listening' });
    expect(parseCommand('I want to work on my pronunciation')).toEqual({ kind: 'focus', skill: 'speaking' });
    expect(parseCommand('stop showing pinyin so much')).toEqual({ kind: 'pinyin', delta: -1 });
    expect(parseCommand('no pinyin')).toEqual({ kind: 'pinyin', mode: 'never' });
    expect(parseCommand('the audio is too fast')).toEqual({ kind: 'speed', delta: -0.1 });
    expect(parseCommand('too many new words')).toEqual({ kind: 'newWords', delta: -2 });
    expect(parseCommand('Chinese only')).toEqual({ kind: 'immersion', level: 5 });
    expect(parseCommand('10 minute sessions')).toEqual({ kind: 'minutes', minutes: 10 });
    expect(parseCommand('I’m into hiking')).toEqual({ kind: 'topic', topic: 'outdoors' });
    expect(parseCommand('hello there')).toBeNull();
  });

  it('parses every canonical phrase, so an AI mapping always lands on a real command', () => {
    for (const c of CANONICAL) expect(parseCommand(c), c).not.toBeNull();
    expect(parseAiCommand('{"command": "more listening"}')).toEqual({ kind: 'focus', skill: 'listening' });
    expect(parseAiCommand('{"command": "delete my data"}')).toBeNull();
    expect(parseAiCommand('nonsense')).toBeNull();
  });

  it('turns commands into bounded profile changes with a plain message', () => {
    const p = profile();
    expect(applyCommand(p, { kind: 'difficulty', delta: -1 }, 0).patch).toEqual({ scaffoldOffset: -1 });
    expect(applyCommand({ ...p, scaffoldOffset: -2 }, { kind: 'difficulty', delta: -1 }, 0)).toEqual({ patch: {}, message: expect.stringMatching(/hardest/) });
    expect(applyCommand(p, { kind: 'pinyin', delta: -1 }, 0).patch).toEqual({ pinyinMode: 'tap' });
    expect(applyCommand(p, { kind: 'speed', delta: -0.1 }, 0).patch).toEqual({ ttsRate: 0.9 });
    expect(applyCommand(p, { kind: 'focus', skill: 'listening' }, 1000).patch.focus).toEqual([{ kind: 'skill', key: 'listening', factor: 1.5, until: 1000 + 7 * 86_400_000 }]);
    expect(applyCommand(p, { kind: 'topic', topic: 'food' }, 0).patch).toEqual({}); // already an interest
    expect(applyCommand(p, { kind: 'newWords', delta: -2 }, 0).patch).toEqual({ newItemCap: 6 });
    expect(applyCommand(p, { kind: 'immersion', delta: 1 }, 0).patch).toEqual({ immersion: 2 });
  });

  it('puts button labels in Chinese from immersion level 3', () => {
    setImmersion(1);
    expect(t('Continue')).toBe('Continue');
    setImmersion(3);
    expect(t('Continue')).toBe('继续 · Continue');
    setImmersion(5);
    expect([t('Continue'), t('Some other label')]).toEqual(['继续', 'Some other label']);
    setImmersion(1);
  });
});
