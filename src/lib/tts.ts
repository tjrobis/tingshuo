// Text-to-speech through the browser: free, and on-device on iPhone. Voice choice UI: slice 5.

const isChinese = (v: SpeechSynthesisVoice) => /^zh([-_](CN|Hans))?$/i.test(v.lang) || /^cmn/i.test(v.lang);
const score = (v: SpeechSynthesisVoice) =>
  (/natural|neural|online|premium|enhanced/i.test(v.name) ? 2 : 0) + (/xiaoxiao|yunxi|tingting|google/i.test(v.name) ? 1 : 0);

const voice = () => speechSynthesis.getVoices().filter(isChinese).sort((a, b) => score(b) - score(a))[0];

/** Resolves true once a Mainland Chinese voice is available (voices load asynchronously in Chrome). */
export function audioReady(timeoutMs = 1500): Promise<boolean> {
  if (typeof speechSynthesis === 'undefined') return Promise.resolve(false);
  if (voice()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = () => resolve(!!voice());
    speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, timeoutMs);
  });
}

/** iOS only allows speech after a tap: call this from the tap that starts a session. */
export function primeAudio(): void {
  if (typeof speechSynthesis === 'undefined') return;
  const u = new SpeechSynthesisUtterance('');
  u.volume = 0;
  speechSynthesis.speak(u);
}

export function speak(text: string, rate = 1): Promise<void> {
  if (typeof speechSynthesis === 'undefined') return Promise.resolve();
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-CN';
  u.rate = rate;
  const v = voice();
  if (v) u.voice = v;
  return new Promise((resolve) => {
    u.onend = () => resolve();
    u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}
