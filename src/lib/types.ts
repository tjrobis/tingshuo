// Shared domain types. See DATABASE_SCHEMA.md for the persisted shapes and LEARNING_ENGINE.md
// for semantics. Curated content types are read-only data bundled with the app.

import type { Card } from 'ts-fsrs';

export type ItemKind = 'word' | 'char' | 'grammar' | 'tone' | 'tonepair' | 'sound';

export type Facet =
  | 'meaning' // characters → meaning (reading recognition)
  | 'listening' // audio → meaning (listening recognition)
  | 'recall' // meaning → Chinese (production)
  | 'reading' // characters → pinyin with tones
  | 'char' // single character recognition
  | 'grammar' // grammar comprehension
  | 'grammarProd' // grammar production
  | 'perceive' // tone / sound discrimination
  | 'produce'; // tone production

export const FACETS_BY_KIND: Record<ItemKind, Facet[]> = {
  word: ['meaning', 'listening', 'recall', 'reading'],
  char: ['char'],
  grammar: ['grammar', 'grammarProd'],
  tone: ['perceive', 'produce'],
  tonepair: ['perceive', 'produce'],
  sound: ['perceive'],
};

export type Skill =
  | 'vocab'
  | 'listening'
  | 'reading'
  | 'speaking'
  | 'tones'
  | 'pronunciation'
  | 'grammar'
  | 'characters';

export const SKILLS: Skill[] = [
  'vocab',
  'listening',
  'reading',
  'speaking',
  'tones',
  'pronunciation',
  'grammar',
  'characters',
];

export type MasteryStatus = 'new' | 'learning' | 'developing' | 'strong' | 'mastered' | 'at_risk';

// ───────────────────────── Curated content ─────────────────────────

export interface VocabularyItem {
  id: string; // w:<hanzi>[#disambiguator]
  hanzi: string;
  /** Citation pinyin with tone numbers, one syllable per character, space separated. Neutral = 0. */
  pinyin: string;
  /** First is the display gloss; all are accepted when grading. */
  meanings: string[];
  pos: string;
  unit: number;
  /** Approximate frequency band: 1 = very common (top ~300) … 5 = rarer. */
  freq: 1 | 2 | 3 | 4 | 5;
  topics: string[];
  emoji?: string;
  note?: string;
  /** Names etc.: allowed in sentences, never introduced as vocabulary. */
  incidental?: boolean;
}

export interface CharacterInfo {
  id: string; // c:<char>
  char: string;
  pinyin: string;
  meaning: string;
  components?: string; // "女 woman + 子 child"
  mnemonic?: string;
}

export interface GrammarConcept {
  id: string; // g:<slug>
  title: string;
  pattern: string;
  explanation: string;
  why: string;
  unit: number; // examples = sentences tagged with this id
}

export interface Sentence {
  id: string;
  /** Chinese, tokens separated by single spaces. Tokens may be `hanzi#disambiguator`. */
  /** Chinese, tokens separated by single spaces. Tokens may be `hanzi#disambiguator`. */
  zh: string;
  /** Accepted English translations; the first is displayed. */
  en: string[];
  unit: number;
  grammar: string[];
}

export interface Question {
  q: string; // English or Chinese prompt
  qZh?: string;
  options: string[];
  answer: number;
}

export interface DialogueLine {
  speaker: 'A' | 'B';
  zh: string; // tokenised
  en: string;
}

export interface Dialogue {
  id: string;
  title: string;
  unit: number;
  topics: string[];
  lines: DialogueLine[];
  questions: Question[];
}

export interface Story {
  id: string;
  title: string;
  titleZh: string;
  unit: number;
  topics: string[];
  paragraphs: string[][]; // tokenised sentences
  translation: string[][];
  questions: Question[];
}

export interface Unit {
  n: number;
  title: string;
  titleZh: string;
  goal: string;
  milestone?: string;
}

/** A scripted roleplay used when no AI provider is configured (and as structured practice). */
export interface Roleplay {
  id: string;
  title: string;
  scenario: string;
  unit: number;
  topics: string[];
  turns: RoleplayTurn[];
}

export interface RoleplayTurn {
  tutor: string; // tokenised Chinese
  tutorEn: string;
  /** Accepted learner responses: tokenised Chinese patterns; `{slot}` matches any known word of that slot type. */
  expect: string[];
  model: string; // model answer (tokenised)
  modelEn: string;
  hint: string; // English hint
}

export interface Mission {
  id: string;
  title: string;
  description: string;
  unit: number;
  kind: 'roleplay' | 'speak' | 'listen' | 'write';
  roleplayId?: string;
  targetSeconds?: number;
  successCriteria: string;
}

// ───────────────────────── Learner data ─────────────────────────

export type PinyinMode = 'always' | 'new' | 'tap' | 'never';
export type ImmersionLevel = 1 | 2 | 3 | 4 | 5;
export type Theme = 'system' | 'light' | 'dark';

export interface Goal {
  id: string;
  label: string;
  target?: string;
  createdAt: number;
}

export interface Interest {
  id: string; // topic id
  weight: number; // 0..1
}

export interface FocusBoost {
  kind: 'skill' | 'topic';
  key: string;
  factor: number;
  until: number; // epoch ms
}

export type AIProviderId = 'none' | 'anthropic' | 'openai' | 'gemini' | 'openai-compatible';

export interface AIConfig {
  provider: AIProviderId;
  model: string;
  baseUrl?: string;
  /** Learner allowed AI features to send their learning context to the provider. */
  consent: boolean;
}

export interface UserProfile {
  id: 'me';
  name: string;
  createdAt: number;
  onboardedAt?: number;
  calibratedAt?: number;
  goals: Goal[];
  interests: Interest[];
  dailyMinutes: number;
  weeklyMinutes: number;
  sessionMinutes: number;
  travelPlans: string;
  motivation: string;
  pinyinMode: PinyinMode;
  immersion: ImmersionLevel;
  theme: Theme;
  ttsRate: number; // 0.6 .. 1.2 baseline playback speed
  voiceURI?: string;
  desiredRetention: number;
  privacy: {
    stt: boolean; // allow browser speech recognition (third-party)
    keepRecordings: number; // how many learner recordings to keep
  };
  ai: AIConfig;
  focus: FocusBoost[];
  /** Persistent difficulty nudge from "too easy"/"too hard" (−2..+2). */
  scaffoldOffset: number;
  speaker?: { floorHz: number; ceilHz: number; n: number };
  micAvailable?: boolean;
  showEnglish: boolean;
}

export interface LearnerPolicy {
  id: 'me';
  newItemCap: number;
  introModality: 'audio' | 'text' | 'explore';
  /** Per-format difficulty exponent calibrations (multipliers on the defaults). */
  formatK: Record<string, number>;
  comprehensionTarget: number; // e.g. 0.92
  updatedAt: number;
  notes: string[];
}

export interface SRSState {
  id: string; // `${itemId}|${facet}`
  itemId: string;
  facet: Facet;
  activatedAt: number;
  card: Card; // ts-fsrs card: due, stability, difficulty, state (0 New 1 Learning 2 Review 3 Relearning)…
}

export interface FacetStats {
  correct: number;
  incorrect: number;
  lastResult?: boolean;
}

export interface MasteryState {
  itemId: string;
  kind: ItemKind;
  firstSeen: number;
  lastSeen: number;
  encounters: number;
  byFacet: Partial<Record<Facet, FacetStats>>;
  rtSamples: number[];
  pronunciationScore?: number;
  contexts: string[];
  mistakes: { given: string; count: number; last: number }[];
  confusions: { itemId: string; count: number }[];
  lookups: number;
  introModality?: 'audio' | 'text';
  introducedAt?: number;
  introSessionId?: number;
  /** Number of new items introduced in the same session (for batch-size analysis). */
  introBatchSize?: number;
  flags: { leech?: boolean; keepForgetting?: boolean; parkedUntil?: number };
}

export type EventType =
  | 'answer'
  | 'intro'
  | 'exposure'
  | 'lookup'
  | 'skip'
  | 'confused'
  | 'why'
  | 'command'
  | 'session_start'
  | 'session_end'
  | 'conversation_turn'
  | 'benchmark'
  | 'placement';

export interface LearningEvent {
  id?: number;
  at: number;
  sessionId?: number;
  type: EventType;
  itemId?: string;
  facet?: Facet;
  exercise?: string;
  correct?: boolean;
  rating?: number;
  rtMs?: number;
  scaffold?: number;
  hintsUsed?: number;
  predictedP?: number;
  given?: string;
  expected?: string;
  errorCategory?: ErrorCategory;
  meta?: Record<string, unknown>;
}

export interface ReviewRecord {
  id?: number;
  srsId: string;
  itemId: string;
  facet: Facet;
  at: number;
  rating: number;
  state: number;
  due: Date;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  last_elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  exercise: string;
  /** Retrievability just before this review (for calibration analysis). */
  retrievability?: number;
}

export type ErrorCategory =
  | 'tone'
  | 'pronunciation'
  | 'vocab_forgotten'
  | 'word_order'
  | 'classifier'
  | 'particle'
  | 'similar_word'
  | 'character_confusion'
  | 'listening_confusion'
  | 'grammar'
  | 'other';

export interface ErrorRecord {
  id?: number;
  at: number;
  category: ErrorCategory;
  itemId?: string;
  confusedWith?: string;
  expected: string;
  given: string;
  exercise?: string;
  sessionId?: number;
  source: 'exercise' | 'conversation' | 'pronunciation';
  patternKey: string;
  note?: string;
  /** For tone errors: expected→given tone pairs, e.g. ["3>2"]. */
  toneSwaps?: string[];
}

export interface ErrorPattern {
  key: string;
  category: ErrorCategory;
  itemIds: string[];
  label: string;
  count: number;
  firstAt: number;
  lastAt: number;
  status: 'open' | 'recurring' | 'resolved';
  drillSuccesses: { at: number }[];
}

export interface PronunciationAttempt {
  id?: number;
  at: number;
  itemId: string;
  text: string;
  expectedPinyin: string;
  surfaceTones: number[];
  detectedTones: (number | null)[];
  confidences: number[];
  toneScore: number | null;
  rhythmScore: number | null;
  intelligibility?: number;
  segmentalScore?: number;
  sttText?: string;
  feedback: string[];
  contour: number[];
  recordingId?: number;
  selfRating?: 'good' | 'close' | 'off';
}

export interface AudioAsset {
  id?: number;
  at: number;
  kind: 'learner';
  mime: string;
  blob: Blob;
  durationMs: number;
  itemId?: string;
}

export interface PlanBlock {
  kind: 'warmup' | 'review' | 'new' | 'listening' | 'speaking' | 'input' | 'errors' | 'closing';
  minutes: number;
  reason: string;
}

export interface LessonRecord {
  id?: number;
  startedAt: number;
  endedAt?: number;
  plannedMinutes: number;
  blocks: PlanBlock[];
  rationale: string[];
  priority: string;
  stats: { answered: number; correct: number; newItems: number; reviews: number; minutes: number };
  mode: 'learn' | 'review' | 'focus';
}

export interface ConversationRecord {
  id?: number;
  startedAt: number;
  endedAt?: number;
  mode: TutorMode;
  scenario: string;
  provider: string;
  minutes: number;
  chineseOnly: boolean;
  review?: CorrectionItem[];
  turns: number;
}

export type TutorMode = 'learning' | 'conversation' | 'immersion' | 'roleplay' | 'challenge';

export interface CorrectionItem {
  said: string;
  better: string;
  why: string;
  category: ErrorCategory;
  severity: 1 | 2 | 3;
}

export interface ConversationMessage {
  id?: number;
  conversationId: number;
  at: number;
  role: 'tutor' | 'learner';
  zh: string;
  en?: string;
  corrections?: CorrectionItem[];
  unknownWords?: string[];
  coverage?: number;
  newWords?: { word: string; pinyin: string; en: string }[];
}

export interface AssessmentRecord {
  id?: number;
  at: number;
  kind: 'placement' | 'benchmark';
  results: { skill: string; correct: number; total: number; detail?: string }[];
  estimates: Record<string, number>;
  items: { id: string; skill: string; correct: boolean; rtMs?: number }[];
}

export interface SkillAbility {
  skill: Skill;
  theta: number;
  n: number;
  updatedAt: number;
}

export interface GeneratedContent {
  id?: number;
  kind: 'story' | 'sentence' | 'dialogue' | 'gloss';
  createdAt: number;
  provider: string;
  topic?: string;
  payload: unknown;
  validation: ValidationReport;
}

export interface ValidationReport {
  coverage: number;
  unknown: string[];
  issues: string[];
  passed: boolean;
  attempts: number;
}

export interface CustomItem extends VocabularyItem {
  source: 'user' | 'import' | 'generated';
  verified: false;
  createdAt: number;
}

export interface AILogEntry {
  id?: number;
  at: number;
  provider: string;
  model: string;
  purpose: string;
  request: string;
  response: string;
  ms: number;
  ok: boolean;
  error?: string;
  usage?: Record<string, number>;
}

export interface MetaInsight {
  id: string;
  title: string;
  detail: string;
  evidence: string;
  probability: number;
  n: number;
  createdAt: number;
  applied?: string;
}

export interface AchievementRecord {
  id: string;
  unlockedAt: number;
}

export interface SecretRecord {
  provider: string;
  apiKey: string;
}
