# How Neon works, and how to change it

## 1. What happens when you press Send

Follow the sentence **"What is your name?"** through the files.

```
you type ─► main.js ─► gemini.js  (if you saved a key)  ─┐
                    └► gloss.js   (otherwise, or if AI fails) ─┤
                                                               ▼
                         gloss: ["YOUR", "NAME", "WHAT"]
                                                               ▼
                       planner.js + data/asl-signs.json
                                                               ▼
              steps: [ {right hand, left hand, move ms, hold ms}, ... ]
                                                               ▼
                    player.js  (blends between steps, 60 times a second)
                                                               ▼
               figure.js  (ik.js for elbows, handmodel.js for fingers)
```

1. **`main.js`** gets the text from the box (or from `speech.js`).
2. **Gloss.** "Gloss" is sign language written in capitals, in sign order. `gemini.js` asks the AI for it. `gloss.js` is the offline fallback: it drops words ASL leaves out (*is*, *the*), joins phrases (*thank you* → THANK-YOU), swaps synonyms (*hi* → HELLO), and moves question words to the end.
3. **Plan.** `planner.js` looks each gloss word up in `data/asl-signs.json`. If the word is there, it uses that sign's frames. If not, it fingerspells the word, one frame per letter. The output is a list of **steps**: where each hand should be, its shape, and how long to move and hold.
4. **Play.** `player.js` runs every animation frame. It blends smoothly from the current pose to the next step, waits, and moves on. It tells `main.js` when each step starts, so the caption, chips and dashes can light up.
5. **Draw.** `figure.js` draws a soft spotlight and the neon outline, then each arm in three passes: a blurred glow underneath, the solid light-blue arm, then the hand. `ik.js` works out the elbow from the shoulder and wrist positions, and `handmodel.js` turns finger angles into 21 points that the hand is drawn from. `ik.js` works out the elbow from the shoulder and wrist positions. `handmodel.js` turns finger angles into 21 points, and the hand is drawn from those.

**Question mode** takes a different path at step 2. `askGemini()` sends the question and gets back three things in one request: a detailed `answer` (shown in the chat), a short `signed` summary, and the `gloss` of that summary. The prompt sends Gemini the full list of signs and tells it to rephrase with them, fingerspelling at most 2 words. `limitSpelling()` in `planner.js` enforces that limit too, in case Gemini ignores it. The gloss then goes into the planner exactly as in Translate mode.

The same reply also carries `full_gloss`, the gloss of the whole answer. **✋ Sign full answer** plans and plays it in a second bubble, with no spelling limit. If Gemini leaves it out, `main.js` makes one from the written answer with the offline rules in `gloss.js`. Question mode has no offline fallback, because the rules in `gloss.js` can reorder a sentence but can't answer a question.

The layer rule from the original spec still holds: **`js/engine/` never touches the page**, which is why `tests/` can run it in Node.

### Hand capture
`js/capture/handcapture.js` is separate from the signing flow. It's the M1 tracker idea again: camera → MediaPipe Hand Landmarker → 21 points per hand, drawn as glowing skeletons on black. MediaPipe loads only the first time you press the button. Its handedness labels assume a mirrored (selfie) picture; we pass the raw camera picture, so the labels come out swapped, and `REAL_SIDE` swaps them back. The colours are in `COLORS`.

## 2. The database: `data/asl-signs.json`

### Handshapes
A handshape is a list of finger angles in degrees:

```json
"B": {"fingers": [[0,0,0,2], [0,0,0,0], [0,0,0,-2], [0,0,0,-4]], "thumb": [25,75,45,30]}
```

- `fingers`: index, middle, ring, pinky. Each is `[knuckle bend, middle joint bend, tip joint bend, spread]`. `0,0,0` is straight. About `88,105,60` is a fist. Spread tilts the finger sideways (+ towards the thumb).
- `thumb`: `[out to the side, across in front of the palm, base bend, tip bend]`.

### Locations
Wrist positions in head-radius units, measured from the base of the neck. **Negative x is the figure's right side** (your left, because it faces you). **y goes down.**

```json
"chin": [-0.35, 0.95]
```

### Body points
Points on the body (head-radius units, same axes as locations) that a hand can touch: `forehead`, `temple`, `eye`, `nose`, `mouth`, `chin`, `cheek`, `jaw`, `ear`, `throat`, `chest`, `chest-right`, `chest-left`, `stomach`, `left-palm`, `left-arm`.

### Letters and words
Each sign is a list of **frames**. A frame says which handshape, how the hand is turned (`ori`), and where it goes. There are two ways to say where:

- **`at`** puts the **wrist** at a location: `"at": "spell"` or `"at": [-1.2, 2.3]`.
- **`touch` + `with`** puts a **part of the hand** on a body point, and Neon works out where the wrist must be: `"touch": "chin", "with": "thumb"`. Parts: `thumb`, `index`, `middle`, `ring`, `pinky`, `knuckles`, `palm`, `wrist`.

`off` nudges the result afterwards (useful for taps: touch, lift a little, touch again). Most new signs use `touch`, because "thumb on the chin" is how dictionaries describe signs.

```json
"HELLO": {"frames": [
  {"hs": "B", "at": "forehead", "ori": [0, 0, 30], "hold": 150},
  {"hs": "B", "at": "forehead", "off": [-0.9, 0.35], "ori": [0, 0, 5]}
]}
```

`ori` is `[yaw, pitch, roll]`, plus an optional fourth `tilt`:

| angle | what it does |
|---|---|
| yaw | turns the hand around its own up axis. 180 shows the back of the hand |
| pitch | tips the fingers towards you (−) or away (+) |
| roll | spins the hand on screen, clockwise. 90 = fingers point right |
| tilt | leans the finished hand towards you a little |

`move` and `hold` are milliseconds (optional; defaults are in `planner.js`).

**Two-handed signs** use `right` and `left` inside a frame. The left hand is written as if it were a right hand, and Neon mirrors it. So identical numbers give a symmetric sign:

```json
{"right": {"hs": "1", "at": [-0.55, 2.1], "ori": [90, 0, 0]},
 "left":  {"hs": "1", "at": [-0.55, 2.1], "ori": [90, 0, 0]}}
```

### Aliases and word forms
Other words that should play an existing sign: `"THANKS": "THANK-YOU"`. You don't need aliases for simple endings: `findWord()` in `planner.js` tries removing -S, -ES, -IES, -ING and -ED (STUDIES → STUDY, SIGNING → SIGN). Irregular forms (WENT → GO, SAW → SEE) need an alias.

## 3. Recipes for changing things

After any change: save, hard refresh (**Ctrl + Shift + R**), and check. Commit when it works.

### Change colours
Top of `css/style.css`:
- `--arm` is the hand and forearm colour, `--arm-deep` the upper arm, `--arm-edge` the thin line between fingers, `--arm-glow` the glow around them.
- `--figure-glow` and `--figure-line` are the body outline.
- `--bg-black` and `--bg-blue` are the background.

### Add a new word
1. Look the sign up (Lifeprint, Handspeak, or ask a signer). Note the handshape, where it happens, and how it moves.
2. Add it under `"words"` in `data/asl-signs.json`. Start by copying a similar sign. For example, "GRANDMOTHER" is MOTHER (5-hand, thumb on the chin) plus two small hops forward:
   ```json
   "GRANDMOTHER": {"frames": [
     {"hs": "5", "touch": "chin", "with": "thumb", "ori": [65, 0, 0]},
     {"hs": "5", "touch": "chin", "with": "thumb", "ori": [65, 0, 0], "off": [-0.3, 0.3], "move": 180, "hold": 0},
     {"hs": "5", "touch": "chin", "with": "thumb", "ori": [65, 0, 0], "off": [-0.6, 0.6], "move": 180}
   ]}
   ```
3. Open **All signs**, click it, and adjust the numbers until it looks right. Nudge `at` first, then `ori`, then the handshape.
4. Add aliases if needed (`"MOM": "MOTHER"`).
5. Run `node --test tests/engine.test.js`. One test checks that every handshape and location you used exists.

The AI picks up new words automatically, because `main.js` sends it the list of word names.

### Add a new handshape
Copy the nearest one under `"handshapes"`, rename it, and change one finger at a time. Use it in a sign, then check it on the All signs page.

### Change how the AI translates or answers
In `js/ai/gemini.js`: `glossRules()` holds the ASL rules both modes share, `glossWithGemini()` has the Translate prompt, and `askGemini()` has the Question prompt. To make answers longer or chattier, change "at most 20 words" there. Remember every unknown word gets fingerspelled, so long answers are slow to sign. To use a different model, change it in the **Your key** dialog; no code change is needed.

### Change the offline rules
`js/engine/gloss.js`. Add words to `DROP` to ignore them, or to `CONTRACTIONS` to expand them. Add a test in `tests/engine.test.js` for each new rule.

### Change speed, hand size or the figure
- Default timings: `LETTER_TIMING` and `WORD_TIMING` in `planner.js`.
- Hand size: `HAND_SCALE` in `js/engine/handmodel.js` (the planner uses it too, so touches stay accurate). Arm lengths: `UPPER_ARM`, `FOREARM` in `figure.js`.
- Body outline: `drawBody()` and `sidePath()` in `figure.js`. The tie is `drawTie()` and the torso pattern is `drawDiamondPattern()`; their colours are the `--tie-*` and `--pattern*` variables in `style.css`.

### Change the orb
`js/ui/orb.js`: each entry in `RINGS` is one ring: its colours (going round the ring), `harmonic` (how many bumps), `speed`, `drift` (slow rotation) and `size`. `TRAIL` sets how many soft copies follow each ring. `level` is your voice loudness: it makes the rings wobble more, thicken and glow.

## 4. When something breaks

1. Open DevTools (**Ctrl + Shift + J**) and read the first red line.
2. Before fixing it, guess which layer it's in: data (a typo in the JSON), engine (wrong numbers), or UI (drawing or buttons).
3. A broken JSON file stops everything: the app shows "Could not load data/asl-signs.json". A missing comma is the usual cause. VS Code underlines it in red.
4. If you're unsure whether the engine is right, run the tests. They don't need the browser.
5. Gemini errors in the 500s (500, 502, 503, 504) mean Google's servers are busy, not that your code is wrong. `callGemini()` retries those automatically, waiting a bit longer each time.
