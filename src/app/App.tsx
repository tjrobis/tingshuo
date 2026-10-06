import { useEffect, useState } from 'react';
import { loadState, requestPersistence } from '../lib/db';
import type { LearnerState } from '../lib/session';
import { audioReady } from '../lib/tts';
import { Home } from './Home';
import { Onboarding } from './Onboarding';
import { Placement } from './Placement';
import { Session } from './Session';

export default function App() {
  const [state, setState] = useState<LearnerState | null>();
  const [audio, setAudio] = useState(false);
  const [session, setSession] = useState<number | null>(null); // minutes of the running session

  useEffect(() => {
    void loadState().then(setState);
    void audioReady().then(setAudio);
    void requestPersistence();
  }, []);

  if (state === undefined) return null;
  if (state === null) return <Onboarding onDone={setState} />;
  if (!state.profile.calibratedAt) return <Placement state={state} audio={audio} onDone={setState} />;
  if (session !== null) {
    return <Session state={state} minutes={session} audio={audio} onExit={async () => { setState(await loadState()); setSession(null); }} />;
  }
  return <Home state={state} audio={audio} onLearn={setSession} />;
}
