import { useEffect, useState } from 'react';
import { PROVIDERS } from '../lib/ai';
import { chineseVoices, micSupported, speak, startRecording, sttSupported } from '../lib/audio';
import { db } from '../lib/db';
import { pitchTrack, updateSpeaker } from '../lib/pitch';
import { ask } from '../lib/tutor';
import type { AIProviderId, PinyinMode, UserProfile } from '../lib/types';
import { Button, Card, Chip, Label, Screen } from './ui';

const SPEEDS: [number, string][] = [[0.6, '0.6× learning'], [0.75, '0.75×'], [1, '1× normal'], [1.15, '1.15× fast']];
const PINYIN: [PinyinMode, string][] = [['new', 'Until I know the word'], ['always', 'Always'], ['tap', 'Tap to show'], ['never', 'Never']];

export function Settings({ profile, onChange, onBack }: { profile: UserProfile; onChange: (p: Partial<UserProfile>) => void; onBack: () => void }) {
  const [voices, setVoices] = useState(chineseVoices);
  const [mic, setMic] = useState('');

  useEffect(() => {
    const update = () => setVoices(chineseVoices());
    speechSynthesis?.addEventListener('voiceschanged', update);
    return () => speechSynthesis?.removeEventListener('voiceschanged', update);
  }, []);

  async function testMic() {
    setMic('Recording: say 你好，我是学生 (nǐ hǎo, wǒ shì xuésheng)…');
    try {
      const h = await startRecording();
      await new Promise((r) => setTimeout(r, 2500));
      const rec = await h.stop();
      const frames = pitchTrack(rec.pcm, rec.sampleRate);
      const speaker = updateSpeaker(profile.speaker, frames);
      if (!speaker || speaker === profile.speaker) {
        setMic("I couldn't hear a voice. Check the microphone and try again.");
        return;
      }
      onChange({ micAvailable: true, speaker });
      setMic(`Working. Speaking practice is on. Your voice range so far: about ${Math.round(speaker.floorHz)}–${Math.round(speaker.ceilHz)} Hz.`);
    } catch {
      setMic('No microphone access. Allow the microphone for this site in your browser settings.');
    }
  }

  return (
    <Screen>
      <header className="flex items-center gap-2 pt-4">
        <Button variant="ghost" className="px-3" onClick={onBack} aria-label="Back">←</Button>
        <h1 className="text-2xl font-semibold">Settings</h1>
      </header>

      <Card className="flex flex-col gap-3">
        <Label>Voice</Label>
        {voices.length ? (
          <div className="flex gap-2">
            <select
              value={profile.voiceURI ?? voices[0].voiceURI}
              onChange={(e) => onChange({ voiceURI: e.target.value })}
              className="flex-1 rounded-xl bg-slate-100 px-3 py-2 dark:bg-slate-800"
            >
              {voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>)}
            </select>
            <Button variant="secondary" onClick={() => void speak('你好，很高兴认识你！')}>Test</Button>
          </div>
        ) : <p className="text-sm text-amber-600">No Chinese (Mainland) voice on this device. Add one in your system's speech settings.</p>}
        <p className="text-sm text-slate-500">Listening exercises and dialogues mix in other installed voices so you hear more than one speaker.</p>
      </Card>

      <Card className="flex flex-col gap-3">
        <Label>Speaking speed</Label>
        <div className="flex flex-wrap gap-2">
          {SPEEDS.map(([r, l]) => <Chip key={r} active={profile.ttsRate === r} onClick={() => onChange({ ttsRate: r })}>{l}</Chip>)}
        </div>
        <p className="text-sm text-slate-500">Every exercise also has a 0.6× button. Move up to normal speed as soon as you can: real conversations won't slow down.</p>
      </Card>

      <Card className="flex flex-col gap-3">
        <Label>Show pinyin</Label>
        <div className="flex flex-wrap gap-2">
          {PINYIN.map(([m, l]) => <Chip key={m} active={profile.pinyinMode === m} onClick={() => onChange({ pinyinMode: m })}>{l}</Chip>)}
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <Label>Daily goal</Label>
        <div className="flex flex-wrap gap-2">
          {[10, 15, 20, 30, 45, 60].map((m) => <Chip key={m} active={profile.dailyMinutes === m} onClick={() => onChange({ dailyMinutes: m, weeklyMinutes: m * 5 })}>{m} min</Chip>)}
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <Label>Microphone & speaking practice</Label>
        {micSupported() ? (
          <>
            <p className="text-sm">
              {profile.micAvailable ? 'On: sessions include tone production and shadowing.' : 'Off: test your microphone to turn on speaking practice.'}
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => void testMic()}>Test microphone</Button>
              {profile.micAvailable && <Button variant="ghost" onClick={() => onChange({ micAvailable: false })}>Turn off</Button>}
            </div>
            {mic && <p className="text-sm">{mic}</p>}
          </>
        ) : <p className="text-sm text-slate-500">This browser can't record audio.</p>}
      </Card>

      <AiSettings profile={profile} onChange={onChange} />

      <Card className="flex flex-col gap-3">
        <Label>Privacy</Label>
        <p className="text-sm">
          Pitch analysis runs on this device. Recordings and learning data never leave it, except what you send to an AI provider
          (above) or your browser's speech recognition (below).
        </p>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" className="accent-indigo-600" checked={profile.privacy.keepRecordings > 0}
            onChange={(e) => onChange({ privacy: { ...profile.privacy, keepRecordings: e.target.checked ? 50 : 0 } })} />
          Keep my last 50 recordings so I can replay them
        </label>
        {sttSupported() && (
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1 accent-indigo-600" checked={profile.privacy.stt}
              onChange={(e) => onChange({ privacy: { ...profile.privacy, stt: e.target.checked } })} />
            <span>
              Use speech recognition for voice chat and clarity scores.
              <span className="block text-slate-500">Your browser sends this audio to its maker (Google or Apple) to transcribe it.</span>
            </span>
          </label>
        )}
      </Card>
    </Screen>
  );
}

function AiSettings({ profile, onChange }: { profile: UserProfile; onChange: (p: Partial<UserProfile>) => void }) {
  const ai = profile.ai;
  const info = ai.provider === 'none' ? undefined : PROVIDERS[ai.provider];
  const [key, setKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [test, setTest] = useState('');

  useEffect(() => {
    if (ai.provider !== 'none') void db.secrets.get(ai.provider).then((r) => setHasKey(!!r?.apiKey));
  }, [ai.provider]);

  const setProvider = (p: AIProviderId) => {
    setTest('');
    onChange({ ai: { ...ai, provider: p, model: p === 'none' ? '' : PROVIDERS[p].model, baseUrl: p === 'none' ? undefined : PROVIDERS[p].baseUrl } });
  };

  async function saveKey() {
    await db.secrets.put({ provider: ai.provider, apiKey: key.trim() });
    setKey('');
    setHasKey(true);
  }

  async function runTest() {
    setTest('Testing…');
    try {
      const reply = await ask(profile, { purpose: 'test', system: 'Reply with one Chinese word only.', messages: [{ role: 'user', content: 'Say hello.' }] });
      setTest(`Working. It said: ${reply.trim().slice(0, 40)}`);
    } catch (e) {
      setTest((e as Error).message);
    }
  }

  const field = 'rounded-xl bg-slate-100 px-3 py-2 dark:bg-slate-800';
  return (
    <Card className="flex flex-col gap-3">
      <Label>AI tutor (optional)</Label>
      <p className="text-sm text-slate-500">Everything else works without AI. With a provider you get free conversation, corrections and alternative explanations.</p>
      <select value={ai.provider} onChange={(e) => setProvider(e.target.value as AIProviderId)} className={field}>
        <option value="none">None</option>
        {(Object.keys(PROVIDERS) as (keyof typeof PROVIDERS)[]).map((p) => <option key={p} value={p}>{PROVIDERS[p].label}</option>)}
      </select>
      {info && (
        <>
          <p className="text-sm text-slate-500">{info.note}</p>
          <label className="flex flex-col gap-1 text-sm">Model
            <input value={ai.model} onChange={(e) => onChange({ ai: { ...ai, model: e.target.value } })} placeholder="model name" className={field} autoComplete="off" spellCheck={false} />
          </label>
          {info.baseUrl && (
            <label className="flex flex-col gap-1 text-sm">Endpoint
              <input value={ai.baseUrl ?? ''} onChange={(e) => onChange({ ai: { ...ai, baseUrl: e.target.value } })} className={field} autoComplete="off" spellCheck={false} />
            </label>
          )}
          <form onSubmit={(e) => { e.preventDefault(); if (key.trim()) void saveKey(); }} className="flex flex-col gap-1 text-sm">
            API key {!info.needsKey && '(if your server needs one)'}
            <div className="flex gap-2">
              <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={hasKey ? 'Saved on this device' : 'Paste your key'} className={`flex-1 ${field}`} autoComplete="off" />
              <Button type="submit" variant="secondary" disabled={!key.trim()}>Save</Button>
              {hasKey && <Button variant="ghost" onClick={() => void db.secrets.delete(ai.provider).then(() => setHasKey(false))}>Forget</Button>}
            </div>
            <span className="text-slate-500">Stored only on this device, sent only to this provider, never exported or logged.</span>
          </form>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1 accent-indigo-600" checked={ai.consent} onChange={(e) => onChange({ ai: { ...ai, consent: e.target.checked } })} />
            <span>When I use AI features, send my messages and the list of words I know to {info.label}.</span>
          </label>
          <div className="flex items-center gap-2">
            <Button variant="secondary" disabled={!ai.model || (info.needsKey && !hasKey)} onClick={() => void runTest()}>Test connection</Button>
            {test && <span className="text-sm">{test}</span>}
          </div>
        </>
      )}
    </Card>
  );
}
