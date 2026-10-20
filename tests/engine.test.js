// Engine tests. They run in Node with no browser and no camera:
//   node --test tests/engine.test.js
// This works because the engine (js/engine/) never touches the page.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { handPoints, HAND_SCALE } from '../js/engine/handmodel.js';
import { solveArm } from '../js/engine/ik.js';
import { simpleGloss } from '../js/engine/gloss.js';
import { planSigns, resolveHand, findWord, limitSpelling } from '../js/engine/planner.js';

const db = JSON.parse(readFileSync(new URL('../data/asl-signs.json', import.meta.url)));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test('a hand pose gives 21 points', () => {
  assert.equal(handPoints(db.handshapes.B).length, 21);
});

test('a fist pulls the fingertips closer to the wrist than a flat hand', () => {
  const flat = handPoints(db.handshapes.B);
  const fist = handPoints(db.handshapes.A);
  for (const tip of [8, 12, 16, 20]) {
    assert.ok(dist(fist[0], fist[tip]) < dist(flat[0], flat[tip]), `tip ${tip}`);
  }
});

test('the arm solver puts the wrist on a reachable target', () => {
  const { elbow, wrist } = solveArm([0, 0], [1, 2], 2.35, 2.15, -1);
  assert.ok(Math.hypot(wrist[0] - 1, wrist[1] - 2) < 1e-6);
  assert.ok(Math.abs(Math.hypot(elbow[0], elbow[1]) - 2.35) < 1e-6, 'upper arm keeps its length');
});

test('touch puts the named finger exactly on the body point', () => {
  const hand = resolveHand({ hs: '5', touch: 'chin', with: 'thumb', ori: [65, 0, 0] }, db);
  const thumb = handPoints(hand.pose, hand.ori)[4];
  const at = [hand.pos[0] + thumb[0] * HAND_SCALE, hand.pos[1] + thumb[1] * HAND_SCALE];
  assert.ok(Math.hypot(at[0] - db.body.chin[0], at[1] - db.body.chin[1]) < 1e-9);
});

test('word forms find their sign', () => {
  assert.equal(findWord('SIGNS', db), 'SIGN');
  assert.equal(findWord('LEARNING', db), 'LEARN');
  assert.equal(findWord('STUDIES', db), 'STUDY');
  assert.equal(findWord('MOM', db), 'MOTHER');
  assert.equal(findWord('ZEBRA', db), null);
  assert.equal(findWord('USING', db), null); // not US -> WE
});

test('every handshape and location used by a sign exists', () => {
  const all = [...Object.values(db.letters), ...Object.values(db.words)];
  for (const sign of all) {
    for (const frame of sign.frames) {
      for (const hand of [frame.right ?? frame, frame.left].filter((h) => h && h !== 'rest')) {
        assert.ok(db.handshapes[hand.hs], `handshape ${hand.hs}`);
        if (typeof hand.at === 'string') assert.ok(db.locations[hand.at], `location ${hand.at}`);
        if (typeof hand.touch === 'string') assert.ok(db.body[hand.touch], `body point ${hand.touch}`);
      }
    }
  }
});

test('offline gloss moves the question word to the end', () => {
  assert.deepEqual(simpleGloss('What is your name?', db), ['YOUR', 'NAME', 'WHAT']);
});

test('offline gloss joins phrases and uses aliases', () => {
  assert.deepEqual(simpleGloss('Hi, thank you!', db), ['HELLO', 'THANK-YOU']);
  assert.deepEqual(simpleGloss("I don't know", db), ['I', 'NOT-KNOW']);
});

test('unknown words are fingerspelled, one step per letter', () => {
  const plan = planSigns(['SONIKA'], db);
  assert.deepEqual(plan.items, [{ text: 'SONIKA', kind: 'spell' }]);
  assert.equal(plan.steps.length, 6 + 1); // 6 letters + return to rest
});

test('double letters slide sideways', () => {
  const plan = planSigns(['BOOT'], db); // not a sign, so it's spelled B-O-O-T
  const [, l1, l2] = plan.steps;
  assert.ok(l2.right.pos[0] < l1.right.pos[0]);
});

test('signed answers keep at most 2 fingerspelled words', () => {
  const out = limitSpelling(['GROW', 'CO2', 'SUN', 'OXYGEN', 'CHLOROPHYLL', 'MAKE', 'EAT'], db, 2);
  assert.deepEqual(out, ['GROW', 'CO2', 'SUN', 'OXYGEN', 'MAKE', 'EAT']);
});
