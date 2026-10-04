// Pinyin: syllable inventory, tone marks, parsing learner input, display, tone sandhi, grading.

// ───────────── Syllable inventory ─────────────
// Valid toneless syllables (ü written "ü"), plus interjections (m n ng hm hng) and the erhua
// marker "r": curated data gives 儿 its own syllable so each character keeps one (哪儿 = na3 r0).
const TABLE = `
a o e ai ei ao ou an en ang eng er yi ya yo ye yao you yan yin yang ying yong
wu wa wo wai wei wan wen wang weng yu yue yuan yun
ba bo bai bei bao ban ben bang beng bi bie biao bian bin bing bu
pa po pai pei pao pou pan pen pang peng pi pie piao pian pin ping pu
ma mo me mai mei mao mou man men mang meng mi mie miao miu mian min ming mu
fa fo fei fou fan fen fang feng fu
da de dai dei dao dou dan den dang deng dong di dia die diao diu dian ding du duo dui duan dun
ta te tai tei tao tou tan tang teng tong ti tie tiao tian ting tu tuo tui tuan tun
na ne nai nei nao nou nan nen nang neng nong ni nie niao niu nian nin niang ning nu nuo nuan nü nüe
la lo le lai lei lao lou lan lang leng long li lia lie liao liu lian lin liang ling lu luo luan lun lü lüe
ga ge gai gei gao gou gan gen gang geng gong gu gua guo guai gui guan gun guang
ka ke kai kei kao kou kan ken kang keng kong ku kua kuo kuai kui kuan kun kuang
ha he hai hei hao hou han hen hang heng hong hu hua huo huai hui huan hun huang
ji jia jie jiao jiu jian jin jiang jing jiong ju jue juan jun
qi qia qie qiao qiu qian qin qiang qing qiong qu que quan qun
xi xia xie xiao xiu xian xin xiang xing xiong xu xue xuan xun
zha zhe zhi zhai zhei zhao zhou zhan zhen zhang zheng zhong zhu zhua zhuo zhuai zhui zhuan zhun zhuang
cha che chi chai chao chou chan chen chang cheng chong chu chua chuo chuai chui chuan chun chuang
sha she shi shai shei shao shou shan shen shang sheng shu shua shuo shuai shui shuan shun shuang
re ri rao rou ran ren rang reng rong ru rua ruo rui ruan run
za ze zi zai zei zao zou zan zen zang zeng zong zu zuo zui zuan zun
ca ce ci cai cao cou can cen cang ceng cong cu cuo cui cuan cun
sa se si sai sao sou san sen sang seng song su suo sui suan sun
m n ng hm hng r`;

export const SYLLABLES: ReadonlySet<string> = new Set(TABLE.trim().split(/\s+/));
const MAX_SYLLABLE = 6; // zhuang, chuang, shuang

export const isValidSyllable = (base: string): boolean => SYLLABLES.has(base);

const INITIALS = ['zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's', 'y', 'w'];

/** "zhuang" → { initial: "zh", final: "uang" }. y/w count as initials; syllabic nasals have none. */
export function splitInitialFinal(base: string): { initial: string; final: string } {
  const initial = INITIALS.find((i) => base.startsWith(i) && base.length > i.length) ?? '';
  return { initial, final: base.slice(initial.length) };
}

// ───────────── Tone marks ─────────────
const COMBINING = ['', '\u0304', '\u0301', '\u030C', '\u0300'];
const COMBINING_TONE: Record<string, number> = { '\u0304': 1, '\u0301': 2, '\u030C': 3, '\u0300': 4 };

/** "hao", 3 → "hǎo". Mark goes on a/e, the o of "ou", else the last vowel; nasals for m/n/ng. */
export function markSyllable(base: string, tone: number | null): string {
  if (tone === null || tone < 1 || tone > 4) return base;
  let idx = base.search(/a|e|o(?=u)/);
  if (idx < 0) for (let i = base.length - 1; i >= 0 && idx < 0; i--) if ('iouü'.includes(base[i])) idx = i;
  if (idx < 0) idx = base.search(/[mn]/);
  if (idx < 0) return base;
  return (base.slice(0, idx + 1) + COMBINING[tone] + base.slice(idx + 1)).normalize('NFC');
}

// ───────────── Parsing ─────────────
export interface Syllable {
  base: string; // toneless, lower case, ü
  tone: number | null; // 1–4, 0 neutral, null = not given
}

/**
 * Parse pinyin as a learner might type it: "ni3 hao3", "ni3hao3", "nǐhǎo", "nihao" (no tones),
 * "lv4", "lu:4", "nar3". Returns null if any part is not valid pinyin.
 */
export function parsePinyin(input: string): Syllable[] | null {
  const text = input.normalize('NFC').toLowerCase().replace(/u:/g, 'ü').replace(/v/g, 'ü');
  const out: Syllable[] = [];
  for (const chunk of text.split(/[\s'’‘`\-‐–—,.!?;:，。！？、；：…"“”()（）]+/u).filter(Boolean)) {
    const parsed = parseChunk(chunk);
    if (!parsed) return null;
    out.push(...parsed);
  }
  return out;
}

function parseChunk(chunk: string): Syllable[] | null {
  const letters: string[] = [];
  const marks: (number | null)[] = [];
  const digitAt = new Map<number, number>(); // letter position → tone digit typed there
  for (const ch of chunk.normalize('NFD')) {
    if (COMBINING_TONE[ch]) {
      if (!letters.length) return null;
      marks[letters.length - 1] = COMBINING_TONE[ch];
    } else if (ch === '\u0308') {
      if (letters[letters.length - 1] !== 'u') return null;
      letters[letters.length - 1] = 'ü';
    } else if (/[0-5]/.test(ch)) {
      if (!letters.length || digitAt.has(letters.length)) return null;
      digitAt.set(letters.length, ch === '5' ? 0 : Number(ch));
    } else if (/[a-z]/.test(ch)) {
      letters.push(ch);
      marks.push(null);
    } else return null;
  }

  // DP split into valid syllables. Typed digits are forced boundaries; one tone mark per syllable.
  // Cost prefers fewer syllables and avoids vowel-initial non-first syllables: standard pinyin
  // needs an apostrophe there, so bare "fangan" reads fān-gàn, not fāng-àn.
  const s = letters.join('');
  const n = letters.length;
  const cost = new Array<number>(n + 1).fill(Infinity);
  const prev = new Array<number>(n + 1).fill(-1);
  cost[0] = 0;
  for (let i = 0; i < n; i++) {
    if (cost[i] === Infinity) continue;
    for (let j = i + 1; j <= Math.min(n, i + MAX_SYLLABLE); j++) {
      const base = s.slice(i, j);
      if (!isValidSyllable(base) || (base === 'r' && i === 0)) continue;
      if ([...digitAt.keys()].some((p) => p > i && p < j)) continue;
      if (marks.slice(i, j).filter((m) => m !== null).length > 1) continue;
      const c = cost[i] + 1 + (i > 0 && /^[aoe]/.test(base) ? 0.1 : 0) + (/^(r|n|m|ng)$/.test(base) ? 0.2 : 0);
      if (c < cost[j]) [cost[j], prev[j]] = [c, i];
    }
  }
  if (cost[n] === Infinity) return null;

  const syllables: Syllable[] = [];
  for (let j = n; j > 0; j = prev[j]) {
    const i = prev[j];
    const mark = marks.slice(i, j).find((m) => m !== null) ?? null;
    syllables.unshift({ base: s.slice(i, j), tone: digitAt.get(j) ?? mark });
  }
  // Erhua: "r" is always neutral; a tone typed after it belongs to the syllable before ("nar3").
  syllables.forEach((syl, i) => {
    if (syl.base !== 'r' || i === 0) return;
    if (syl.tone && syllables[i - 1].tone === null) syllables[i - 1].tone = syl.tone;
    syl.tone = 0;
  });
  return syllables;
}

/** Strict parser for curated data: "ni3 hao3", "xie4 xie0", "na3 r0". Throws on anything else. */
export function parseNumbered(pinyin: string): Syllable[] {
  return pinyin.trim().split(/\s+/).map((p) => {
    const m = /^([a-zü]+)([0-5])$/.exec(p);
    if (!m || !isValidSyllable(m[1])) throw new Error(`Invalid pinyin syllable "${p}" in "${pinyin}"`);
    return { base: m[1], tone: m[2] === '5' ? 0 : Number(m[2]) };
  });
}

// ───────────── Display ─────────────
/** One word, orthographic: "nǐhǎo", "xī'ān", "nǎr". */
export function formatWord(syllables: Syllable[]): string {
  return syllables
    .map((s, i) => (s.base === 'r' && i > 0 ? 'r' : (i > 0 && /^[aoe]/.test(s.base) ? "'" : '') + markSyllable(s.base, s.tone)))
    .join('');
}

/** "ni3 hao3"; neutral written 0, missing tones omitted. */
export const formatNumbered = (syllables: Syllable[]): string =>
  syllables.map((s) => s.base + (s.tone ?? '')).join(' ');

export const toneName = (tone: number): string =>
  ['neutral tone', '1st tone', '2nd tone', '3rd tone', '4th tone'][tone] ?? `tone ${tone}`;

// ───────────── Tone sandhi ─────────────
const NUMERALS = new Set('零一二三四五六七八九十百千万两');

/**
 * Pronounced tones from citation tones:
 *  一: stays 1st when counting/ordinal/final; 2nd before a 4th tone; otherwise 4th.
 *  不: 2nd before a 4th tone; neutral in A-不-A (是不是).
 *  3rd tones: in a run, all but the last become 2nd.
 */
export function surfaceTones(syllables: { hanzi: string; tone: number }[]): number[] {
  const tones = syllables.map((s) => s.tone);
  syllables.forEach(({ hanzi, tone }, i) => {
    const prev = syllables[i - 1];
    const next = syllables[i + 1];
    if (hanzi === '一' && tone === 1) {
      const counting = !next || prev?.hanzi === '第' || NUMERALS.has(next.hanzi) || (prev && NUMERALS.has(prev.hanzi));
      if (!counting) tones[i] = next.tone === 4 ? 2 : 4;
    } else if (hanzi === '不' && tone === 4 && next) {
      if (prev?.hanzi === next.hanzi) tones[i] = 0;
      else if (next.tone === 4) tones[i] = 2;
    }
  });
  // ponytail: whole-run 3-3 rule ignores prosodic grouping (我很好 is said wǒ hén hǎo or wó hén hǎo);
  // exact for 1–3 syllable drill items, group by word boundaries if multi-word sentences need it.
  for (let i = 0; i < tones.length; i++) if (tones[i] === 3 && tones[i + 1] === 3) tones[i] = 2;
  return tones;
}

// ───────────── Grading ─────────────
export interface PinyinComparison {
  correct: boolean; // neutral-tone leniency and sandhi spellings accepted
  segmentsMatch: boolean; // sounds right, ignoring tones
  lengthMismatch: boolean;
  missingTones: boolean;
  toneErrors: { index: number; expected: number; given: number }[];
  segmentErrors: { index: number; expected: string; given: string }[];
  notes: string[];
}

/** Compare a learner's syllables to the expected ones. `surface` = pronounced (sandhi) tones. */
export function comparePinyin(expected: Syllable[], given: Syllable[], surface?: number[]): PinyinComparison {
  const r: PinyinComparison = {
    correct: false,
    segmentsMatch: expected.length === given.length,
    lengthMismatch: expected.length !== given.length,
    missingTones: false,
    toneErrors: [],
    segmentErrors: [],
    notes: [],
  };
  let sandhiSpelling = false;
  for (let i = 0; i < Math.min(expected.length, given.length); i++) {
    const e = expected[i];
    const g = given[i];
    if (e.base !== g.base) {
      r.segmentsMatch = false;
      r.segmentErrors.push({ index: i, expected: e.base, given: g.base });
      const [ef, gf] = [splitInitialFinal(e.base), splitInitialFinal(g.base)];
      const part = ef.initial !== gf.initial && ef.final === gf.final ? `initial is "${ef.initial}"` : ef.final !== gf.final && ef.initial === gf.initial ? `final is "${ef.final}"` : `syllable is "${e.base}"`;
      r.notes.push(`Syllable ${i + 1}: the ${part}, you wrote "${g.base}".`);
    }
    const et = e.tone ?? 0;
    if (g.tone === null) r.missingTones ||= et !== 0;
    else if (et === 0) {
      if (g.tone !== 0) r.notes.push(`"${e.base}" is normally neutral (light, unstressed) here.`);
    } else if (g.tone !== et) {
      if (surface?.[i] === g.tone) sandhiSpelling = true;
      else {
        r.toneErrors.push({ index: i, expected: et, given: g.tone });
        r.notes.push(`Syllable ${i + 1} (${e.base}) is ${toneName(et)}, not ${toneName(g.tone)}.`);
      }
    }
  }
  if (sandhiSpelling) {
    r.notes.unshift(`You wrote the pronounced tone. Standard spelling keeps the original: ${formatWord(expected)}.`);
  }
  if (r.missingTones) r.notes.push('Add tones (e.g. ni3 hao3 or nǐ hǎo).');
  r.correct = r.segmentsMatch && !r.toneErrors.length && !r.missingTones;
  return r;
}
