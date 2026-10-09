import { useEffect, useState } from 'react';
import { audioReady, configureSpeech } from '../lib/audio';
import { db, loadState, requestPersistence } from '../lib/db';
import type { LearnerState } from '../lib/session';
import type { UserProfile } from '../lib/types';
import { Home } from './Home';
import { Onboarding } from './Onboarding';
import { Placement } from './Placement';
import { Pronunciation } from './Pronunciation';
import { Reader } from './Reader';
import { Session } from './Session';
import { Settings } from './Settings';
import { Tutor } from './Tutor';

type View = { name: 'home' } | { name: 'session'; minutes: number } | { name: 'pronunciation' } | { name: 'settings' } | { name: 'tutor' } | { name: 'reader'; story?: string };

export default function App() {
  const [state, setState] = useState<LearnerState | null>();
  const [audio, setAudio] = useState(false);
  const [view, setView] = useState<View>({ name: 'home' });

  useEffect(() => {
    void loadState().then(setState);
    void audioReady().then(setAudio);
    void requestPersistence();
  }, []);

  useEffect(() => {
    if (state) configureSpeech(state.profile.voiceURI, state.profile.ttsRate);
  }, [state]);

  async function updateProfile(patch: Partial<UserProfile>) {
    await db.profile.update('me', patch);
    setState((s) => s && { ...s, profile: { ...s.profile, ...patch } });
  }
  const home = async () => {
    setState(await loadState());
    setView({ name: 'home' });
  };

  if (state === undefined) return null;
  if (state === null) return <Onboarding onDone={setState} />;
  if (!state.profile.calibratedAt) return <Placement state={state} audio={audio} onDone={setState} />;
  switch (view.name) {
    case 'session':
      return <Session state={state} minutes={view.minutes} audio={audio} onExit={home} />;
    case 'pronunciation':
      return <Pronunciation state={state} audio={audio} onProfile={updateProfile} onBack={home} />;
    case 'reader':
      return <Reader state={state} audio={audio} open={view.story} onBack={home} />;
    case 'tutor':
      return <Tutor state={state} audio={audio} onBack={home} />;
    case 'settings':
      return <Settings profile={state.profile} onChange={updateProfile} onBack={home} />;
    default:
      return (
        <Home
          state={state}
          audio={audio}
          onLearn={(minutes) => setView({ name: 'session', minutes })}
          onOpen={(name, story) => setView({ name, story } as View)}
        />
      );
  }
}
