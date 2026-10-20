// L2 engine: offline English -> ASL gloss rules. Pure, no page.
// "Gloss" is the written form of signs, in capitals: "What is your name?"
// becomes YOUR NAME WHAT. These rules are simple; the optional AI does better.

const DROP = new Set([
  'a', 'an', 'the', 'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being',
  'to', 'of', 'do', 'does', 'did', 'and', 'at',
]);

const CONTRACTIONS = {
  "i'm": ['i'], "you're": ['you'], "it's": ['it'], "that's": ['that'],
  "don't": ['not'], "doesn't": ['not'], "didn't": ['not'], "isn't": ['not'],
  "aren't": ['not'], "can't": ['can', 'not'], "won't": ['will', 'not'],
  "what's": ['what'], "where's": ['where'], "how's": ['how'], "who's": ['who'],
  "i've": ['i'], "i'll": ['i', 'will'], "you'll": ['you', 'will'], "let's": ['we'],
};

const WH = new Set(['WHAT', 'WHERE', 'WHO', 'WHEN', 'WHY', 'HOW', 'WHICH']);

// db.words: { HELLO: {...}, ... }   db.aliases: { HI: "HELLO", ... }
export function simpleGloss(text, db) {
  const isQuestion = text.trim().endsWith('?');
  const known = (w) => Boolean(db.words[w] || db.aliases[w]);

  // 1. lowercase, keep letters/numbers/apostrophes/hyphens, split into words
  let words = text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9'\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  // 2. expand contractions, drop leftover apostrophes ("sonika's" -> "sonika")
  words = words.flatMap((w) => CONTRACTIONS[w] ?? [w.replace(/'s$/, '').replace(/'/g, '')]);

  // 3. join multi-word signs first ("thank you" -> THANK-YOU), longest first
  const tokens = [];
  for (let i = 0; i < words.length; ) {
    let matched = false;
    for (let n = Math.min(4, words.length - i); n >= 2; n--) {
      const phrase = words.slice(i, i + n).join('-').toUpperCase();
      if (known(phrase)) {
        tokens.push(phrase);
        i += n;
        matched = true;
        break;
      }
    }
    if (!matched) {
      const w = words[i];
      if (!DROP.has(w)) tokens.push(w.toUpperCase());
      i += 1;
    }
  }

  // 4. synonyms -> the sign we actually have (HI -> HELLO)
  const signs = tokens.map((t) => db.aliases[t] ?? t).filter(Boolean);

  // 5. ASL puts question words at the end: WHAT YOUR NAME -> YOUR NAME WHAT
  if (isQuestion && signs.length > 1 && WH.has(signs[0])) {
    signs.push(signs.shift());
  }
  return signs;
}
