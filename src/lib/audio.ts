// Audio in and out through browser APIs, on the device: speech synthesis for the model voice,
// MediaRecorder for the learner. Nothing here is sent anywhere.

// ───────────── Speech out ─────────────
const ELOQUENCE = /^(Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley)\b/; // iOS/macOS novelty voices: rough tones
const isChinese = (v: SpeechSynthesisVoice) => (/^zh([-_](CN|Hans))?$/i.test(v.lang) || /^cmn/i.test(v.lang)) && !ELOQUENCE.test(v.name);
const score = (v: SpeechSynthesisVoice) =>
  (/natural|neural|online|premium|enhanced/i.test(v.name) ? 2 : 0) + (/xiaoxiao|yunxi|tingting|lili|google/i.test(v.name) ? 1 : 0);

/** Mainland Chinese voices, best first. */
export const chineseVoices = (): SpeechSynthesisVoice[] =>
  typeof speechSynthesis === 'undefined' ? [] : speechSynthesis.getVoices().filter(isChinese).sort((a, b) => score(b) - score(a));

const prefs = { voiceURI: undefined as string | undefined, rate: 1 };
/** Apply the learner's voice and speed settings (profile.voiceURI, profile.ttsRate). */
export function configureSpeech(voiceURI: string | undefined, rate: number) {
  prefs.voiceURI = voiceURI;
  prefs.rate = rate;
}

/** Resolves true once a Mainland Chinese voice is available (voices load asynchronously in Chrome). */
export function audioReady(timeoutMs = 1500): Promise<boolean> {
  if (typeof speechSynthesis === 'undefined') return Promise.resolve(false);
  if (chineseVoices().length) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = () => resolve(chineseVoices().length > 0);
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

/**
 * Speak Chinese. `rate` overrides the learner's speed; `voice` picks a specific voice index (used to
 * give dialogue speakers different voices and to vary speakers in listening practice).
 */
export function speak(text: string, opts: { rate?: number; voice?: number } = {}): Promise<void> {
  if (typeof speechSynthesis === 'undefined') return Promise.resolve();
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-CN';
  u.rate = opts.rate ?? prefs.rate;
  const voices = chineseVoices();
  const chosen = opts.voice !== undefined && voices.length ? voices[opts.voice % voices.length] : voices.find((v) => v.voiceURI === prefs.voiceURI) ?? voices[0];
  if (chosen) u.voice = chosen;
  return new Promise((resolve) => {
    u.onend = () => resolve();
    u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}

// ───────────── Recording ─────────────
export interface Recording {
  blob: Blob;
  pcm: Float32Array;
  sampleRate: number;
  durationMs: number;
}

export const micSupported = () =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';

/** Start recording; `stop()` resolves with the audio and its decoded samples. */
export async function startRecording(): Promise<{ stop: () => Promise<Recording> }> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => chunks.push(e.data);
  recorder.start();
  const started = performance.now();
  return {
    stop: () =>
      new Promise((resolve, reject) => {
        recorder.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          try {
            const blob = new Blob(chunks, { type: recorder.mimeType });
            const ctx = new AudioContext();
            const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
            void ctx.close();
            resolve({ blob, pcm: buffer.getChannelData(0), sampleRate: buffer.sampleRate, durationMs: performance.now() - started });
          } catch (e) {
            reject(e);
          }
        };
        recorder.stop();
      }),
  };
}

export function playBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = new Audio(url);
  a.onended = () => URL.revokeObjectURL(url);
  void a.play();
}

// ───────────── Speech recognition (opt-in) ─────────────
// The browser sends this audio to its vendor (Google in Chrome, Apple in Safari), so it is off unless
// the learner turns it on, and it isn't available in iPhone home-screen apps at all.
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => Recognition;
const recognitionCtor = (): RecognitionCtor | undefined => {
  const w = globalThis as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};

export const sttSupported = () => !!recognitionCtor();

/** Listen in Mandarin until `stop()`; resolves with what was heard ('' if nothing or unsupported). */
export function listen(): { heard: Promise<string>; stop: () => void } {
  const Ctor = recognitionCtor();
  if (!Ctor) return { heard: Promise.resolve(''), stop: () => undefined };
  const r = new Ctor();
  r.lang = 'zh-CN';
  r.continuous = true;
  r.interimResults = false;
  let text = '';
  const heard = new Promise<string>((resolve) => {
    r.onresult = (e) => {
      text = Array.from(e.results, (res) => res[0].transcript).join('');
    };
    r.onerror = () => resolve(text);
    r.onend = () => resolve(text);
  });
  try {
    r.start();
  } catch {
    return { heard: Promise.resolve(''), stop: () => undefined };
  }
  return { heard, stop: () => r.stop() };
}
