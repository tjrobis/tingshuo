import { afterEach, describe, expect, it, vi } from 'vitest';
import { chineseVoices } from './audio';

afterEach(() => vi.unstubAllGlobals());

describe('chineseVoices', () => {
  it('keeps Mainland voices, best first, without the iOS novelty voices', () => {
    const v = (name: string, lang: string) => ({ name, lang }) as SpeechSynthesisVoice;
    vi.stubGlobal('speechSynthesis', {
      getVoices: () => [v('Grandpa (Chinese (China mainland))', 'zh-CN'), v('Tingting', 'zh-CN'), v('Meijia', 'zh-TW'), v('Lili (Premium)', 'zh-CN'), v('Rocko (Chinese (China mainland))', 'zh-CN')],
    });
    expect(chineseVoices().map((x) => x.name)).toEqual(['Lili (Premium)', 'Tingting']);
  });
});
