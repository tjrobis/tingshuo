// IndexedDB (Dexie). Everything stays on this device. Tables for later slices are added with a
// version bump when their slice lands; Dexie upgrades in place.

import Dexie, { type EntityTable } from 'dexie';
import type { LearnerState } from './session';
import type {
  AssessmentRecord, AudioAsset, ErrorRecord, PronunciationAttempt, LearningEvent, LessonRecord, MasteryState, ReviewRecord, SkillAbility, SRSState, UserProfile,
} from './types';

export const db = new Dexie('tingshuo') as Dexie & {
  profile: EntityTable<UserProfile, 'id'>;
  srs: EntityTable<SRSState, 'id'>;
  mastery: EntityTable<MasteryState, 'itemId'>;
  events: EntityTable<LearningEvent, 'id'>;
  reviews: EntityTable<ReviewRecord, 'id'>;
  errors: EntityTable<ErrorRecord, 'id'>;
  sessions: EntityTable<LessonRecord, 'id'>;
  abilities: EntityTable<SkillAbility, 'skill'>;
  assessments: EntityTable<AssessmentRecord, 'id'>;
  pronunciation: EntityTable<PronunciationAttempt, 'id'>;
  recordings: EntityTable<AudioAsset, 'id'>;
};

db.version(1).stores({
  profile: 'id',
  srs: 'id, itemId',
  mastery: 'itemId',
  events: '++id, at, type, sessionId',
  reviews: '++id, at, srsId',
  errors: '++id, at, patternKey',
  sessions: '++id, startedAt',
  abilities: 'skill',
  assessments: '++id, at',
});
db.version(2).stores({ pronunciation: '++id, at, itemId', recordings: '++id, at' });

/** Everything one learning step changes, written atomically so the model can't half-update. */
export interface Writes {
  srs?: SRSState[];
  mastery?: MasteryState[];
  events?: LearningEvent[];
  reviews?: ReviewRecord[];
  errors?: ErrorRecord[];
  abilities?: SkillAbility[];
}

export const persist = (w: Writes) =>
  db.transaction('rw', [db.srs, db.mastery, db.events, db.reviews, db.errors, db.abilities], async () => {
    if (w.srs?.length) await db.srs.bulkPut(w.srs);
    if (w.mastery?.length) await db.mastery.bulkPut(w.mastery);
    if (w.events?.length) await db.events.bulkAdd(w.events);
    if (w.reviews?.length) await db.reviews.bulkAdd(w.reviews);
    if (w.errors?.length) await db.errors.bulkAdd(w.errors);
    if (w.abilities?.length) await db.abilities.bulkPut(w.abilities);
  });

/** The whole learner model, in memory (see session.ts). Null before onboarding. */
export async function loadState(): Promise<LearnerState | null> {
  const profile = await db.profile.get('me');
  if (!profile) return null;
  const [srs, mastery, abilities, reviews, errors, sessions, answers] = await Promise.all([
    db.srs.toArray(), db.mastery.toArray(), db.abilities.toArray(), db.reviews.toArray(), db.errors.toArray(),
    db.sessions.toArray(), db.events.where('type').equals('answer').sortBy('at'),
  ]);
  return {
    profile,
    srs: new Map(srs.map((x) => [x.id, x])),
    mastery: new Map(mastery.map((x) => [x.itemId, x])),
    abilities: new Map(abilities.map((x) => [x.skill, x])),
    reviews, errors, sessions, answers,
  };
}

/** Store a pronunciation attempt and its recording, keeping only the newest `keep` recordings. */
export async function savePronunciation(attempt: PronunciationAttempt, recording: Omit<AudioAsset, 'id'> | undefined, keep: number) {
  await db.transaction('rw', [db.pronunciation, db.recordings], async () => {
    const recordingId = recording && keep > 0 ? await db.recordings.add(recording) : undefined;
    await db.pronunciation.add({ ...attempt, recordingId });
    const stale = await db.recordings.orderBy('at').reverse().offset(keep).primaryKeys();
    await db.recordings.bulkDelete(stale);
  });
}

/** Ask the browser not to evict our data (Safari otherwise may after 7 idle days). */
export const requestPersistence = () => navigator.storage?.persist?.().catch(() => false);
