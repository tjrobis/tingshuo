// Word segmentation and comprehensibility (known-word coverage).
// Curated text is pre-tokenised with spaces (`splitTokenised`). Arbitrary text (AI output) uses
// the platform's ICU segmenter, then splits any ICU word the lexicon doesn't know but whose parts
// it does (ICU joins 去了; the lexicon has 去 and 了).

export type TokenKind = 'han' | 'punct' | 'latin' | 'number' | 'space';

export interface Token {
  text: string;
  kind: TokenKind;
  /** Lexicon key: surface plus optional `#disambiguator` ("了#le"). Absent for unknown words. */
  ref?: string;
}

function classify(text: string): TokenKind {
  if (/^\p{Script=Han}/u.test(text)) return 'han';
  if (/^\p{Nd}/u.test(text)) return 'number';
  if (/^[A-Za-zÀ-ɏ]/u.test(text)) return 'latin';
  return /^\s/u.test(text) ? 'space' : 'punct';
}

/** "我 叫 了#le 。" → tokens; the part after # disambiguates lexicon entries. */
export function splitTokenised(zh: string): Token[] {
  return zh.trim().split(/\s+/).filter(Boolean).map((ref) => {
    const text = ref.split('#')[0];
    return { text, kind: classify(text), ref };
  });
}

const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });

/** Segment arbitrary text. `has` says whether a word is in the lexicon. */
export function segment(text: string, has: (word: string) => boolean): Token[] {
  const tokens: Token[] = [];
  for (const { segment: word } of segmenter.segment(text)) {
    const kind = classify(word);
    if (kind !== 'han' || has(word)) {
      tokens.push(kind === 'han' ? { text: word, kind, ref: word } : { text: word, kind });
      continue;
    }
    // Longest lexicon match left to right; unknown characters stay glued together as one word.
    const chars = Array.from(word);
    let unknown = '';
    for (let i = 0; i < chars.length; ) {
      let len = chars.length - i;
      while (len > 0 && !has(chars.slice(i, i + len).join(''))) len--;
      if (!len) {
        unknown += chars[i++];
        continue;
      }
      if (unknown) tokens.push({ text: unknown, kind });
      unknown = '';
      const w = chars.slice(i, i + len).join('');
      tokens.push({ text: w, kind, ref: w });
      i += len;
    }
    if (unknown) tokens.push({ text: unknown, kind });
  }
  return tokens;
}

export interface Coverage {
  coverage: number; // known / content tokens; 1 when there is no content
  contentTokens: number;
  knownTokens: number;
  unknown: string[]; // unique, in order of appearance
}

/** Share of Chinese word tokens the learner knows. Filter out names etc. before calling. */
export function computeCoverage(tokens: Token[], isKnown: (t: Token) => boolean): Coverage {
  const content = tokens.filter((t) => t.kind === 'han');
  const known = content.filter(isKnown);
  const unknown = [...new Set(content.filter((t) => !isKnown(t)).map((t) => t.text))];
  return {
    coverage: content.length ? known.length / content.length : 1,
    contentTokens: content.length,
    knownTokens: known.length,
    unknown,
  };
}
