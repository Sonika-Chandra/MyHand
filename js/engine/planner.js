// L2 engine: gloss -> a list of animation "steps". Pure, no page.
// Each gloss token becomes either a whole-word sign from the database,
// or (if the database doesn't have it) one sign per letter: fingerspelling.

import { handPoints, HAND_SCALE } from './handmodel.js';

const LETTER_TIMING = { move: 220, hold: 380 };
const WORD_TIMING = { move: 300, hold: 120 };

function copyPose(pose) {
  return { fingers: pose.fingers.map((f) => [...f]), thumb: [...pose.thumb] };
}

// Which landmark touches the body when a frame says "with": "thumb", etc.
const CONTACT = { wrist: 0, thumb: 4, index: 8, middle: 12, ring: 16, pinky: 20, knuckles: 10 };

// Where the wrist must be so that one part of the hand lands on `target`
function wristForTouch(pose, ori, target, part = 'palm') {
  const pts = handPoints(pose, ori);
  const p = part === 'palm'
    ? [(pts[0][0] + pts[9][0]) / 2, (pts[0][1] + pts[9][1]) / 2] // middle of the palm
    : pts[CONTACT[part]];
  if (!p) throw new Error(`Unknown hand part "${part}"`);
  return [target[0] - p[0] * HAND_SCALE, target[1] - p[1] * HAND_SCALE];
}

// spec: "rest" or { hs, at | touch, with, off, ori } -> { pose, pos, ori }
//   at:    where the WRIST goes (a location name or [x, y])
//   touch: where a PART of the hand goes (a body point name or [x, y]);
//          "with" names the part: thumb, index, middle, ring, pinky, knuckles, palm
export function resolveHand(spec, db) {
  if (!spec || spec === 'rest') spec = db.rest;
  const hs = db.handshapes[spec.hs];
  if (!hs) throw new Error(`Unknown handshape "${spec.hs}"`);
  const ori = [...(spec.ori ?? [0, 0, 0]), 0].slice(0, 4);

  let pos;
  if (spec.touch !== undefined) {
    const target = Array.isArray(spec.touch) ? spec.touch : db.body?.[spec.touch];
    if (!target) throw new Error(`Unknown body point "${spec.touch}"`);
    pos = wristForTouch(hs, ori, target, spec.with);
  } else {
    pos = Array.isArray(spec.at) ? spec.at : db.locations[spec.at ?? 'spell'];
    if (!pos) throw new Error(`Unknown location "${spec.at}"`);
  }

  const off = spec.off ?? [0, 0];
  return { pose: copyPose(hs), pos: [pos[0] + off[0], pos[1] + off[1]], ori };
}

// Find the sign for a gloss word: exact, then synonym, then simple word endings
// (SIGNS -> SIGN, LEARNING -> LEARN, WORKED -> WORK, STUDIES -> STUDY)
export function findWord(token, db) {
  const has = (w) => (db.words[w] ? w : db.aliases[w] && db.words[db.aliases[w]] ? db.aliases[w] : null);
  const direct = has(token);
  if (direct) return direct;
  const tries = [];
  if (token.endsWith('IES')) tries.push(token.slice(0, -3) + 'Y');
  if (token.endsWith('ES')) tries.push(token.slice(0, -2));
  if (token.endsWith('S')) tries.push(token.slice(0, -1));
  if (token.endsWith('ING')) tries.push(token.slice(0, -3), token.slice(0, -3) + 'E');
  if (token.endsWith('ED')) tries.push(token.slice(0, -2), token.slice(0, -1));
  for (const t of tries) {
    // Short stems are risky: USING minus -ING is "US", which would play WE
    if (t.length > 2 && has(t)) return has(t);
  }
  return null;
}

function frameToStep(frame, db, timing, label, item) {
  // A frame either lists the right hand directly ({ hs, at, ... })
  // or has separate "right" and "left" entries for two-handed signs.
  const rightSpec = frame.right ?? frame;
  return {
    right: resolveHand(rightSpec, db),
    left: resolveHand(frame.left ?? 'rest', db),
    move: frame.move ?? timing.move,
    hold: frame.hold ?? timing.hold,
    label,
    item,
  };
}

export function restStep(db) {
  return {
    right: resolveHand('rest', db),
    left: resolveHand('rest', db),
    move: 450,
    hold: 0,
    label: '',
    item: -1,
  };
}

// Keep at most `max` words that would be fingerspelled (the first ones, which
// are usually the key term or name). Fingerspelling is slow, so a signed
// summary with lots of it is hard to follow.
export function limitSpelling(tokens, db, max = 2) {
  let spelled = 0;
  return tokens.filter((t) => {
    if (findWord(String(t).toUpperCase(), db)) return true;
    spelled += 1;
    return spelled <= max;
  });
}

// tokens: ["HELLO", "SONIKA"]
// returns { items: [{ text, kind }], steps: [...] }
export function planSigns(tokens, db) {
  const items = [];
  const steps = [];

  for (const raw of tokens) {
    const token = String(raw).toUpperCase().trim();
    const word = findWord(token, db);
    const key = word ?? token;
    const itemIndex = items.length;

    if (word) {
      items.push({ text: key, kind: 'word' });
      const frames = db.words[key].frames;
      frames.forEach((frame, i) => {
        const step = frameToStep(frame, db, WORD_TIMING, key, itemIndex);
        if (i === frames.length - 1 && frame.hold === undefined) step.hold = 380;
        steps.push(step);
      });
    } else {
      const letters = [...key].filter((ch) => db.letters[ch]);
      if (letters.length === 0) continue; // nothing we can sign (e.g. punctuation)
      items.push({ text: letters.join(''), kind: 'spell' });

      letters.forEach((ch, i) => {
        db.letters[ch].frames.forEach((frame) => {
          const step = frameToStep(frame, db, LETTER_TIMING, ch, itemIndex);
          // Double letters (the LL in HELLO) slide sideways so you can see two
          if (i > 0 && letters[i - 1] === ch) step.right.pos[0] -= 0.35;
          steps.push(step);
        });
      });
    }

    // A small pause between words
    if (steps.length) steps[steps.length - 1].hold += 150;
  }

  steps.push(restStep(db));
  return { items, steps };
}
