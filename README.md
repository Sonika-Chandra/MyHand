# Neon (MyHand) (WORK IN PROGRESS)

Neon turns English into American Sign Language. Type a sentence or speak it, and a neon figure signs it back to you.

<img width="1275" height="617" alt="image" src="https://github.com/user-attachments/assets/43277551-ff73-4eea-9b8e-1c6a8d683ef6" />

<img width="1257" height="583" alt="image" src="https://github.com/user-attachments/assets/66b6e140-ad1a-4a59-942f-0c451906cf3f" />


- **Known words** (155 of them, like HELLO, MOTHER, LEARN, SCHOOL, HUNGRY) are signed as whole signs. Word forms are understood too: SIGNS, SIGNING and SIGNED all use SIGN.
- **Anything else**, such as names, is fingerspelled letter by letter (A–Z and 0–9).
- **Optional AI:** add a Gemini API key and Neon rewrites your sentence into ASL word order first (*What is your name?* → YOUR NAME WHAT). Without a key, built-in rules do a simpler version.
- **Hand capture:** turn on the camera and see your hands traced live on black (left hand blue, right hand pink). Video stays in your browser.
- **Question mode** (needs a key): ask Neon a question. Gemini writes a detailed answer for the chat, plus a short summary using signs Neon knows, which the figure signs. At most 2 words get fingerspelled.

Plain HTML, CSS and JavaScript. No framework, no build step, nothing to install.

## Run it

```
cd MyHand
python -m http.server 8000
```

Open <http://localhost:8000> in Chrome or Edge. Speech input needs one of those two browsers; typing works anywhere.

To use AI, click **🔑 Add key**, paste a key from [Google AI Studio](https://aistudio.google.com/), and save. The key is stored only in your browser.

**All signs** (top bar) opens a page that plays any sign in the database and shows its data.

## Tests

The engine runs in Node without a browser:

```
node --test tests/engine.test.js
```

## How the code is organised

```
index.html, gallery.html   the two pages
css/style.css              all styling; colours are variables at the top
data/asl-signs.json        the sign database: handshapes, letters, words
js/engine/                 pure logic, no page (testable in Node)
  handmodel.js             finger angles -> 21 hand points
  ik.js                    where the elbow goes
  gloss.js                 English -> ASL gloss (offline rules)
  planner.js               gloss -> animation steps
js/ai/gemini.js            AI: gloss (Translate) and answers (Question mode), key storage
js/input/speech.js         speech recognition + loudness for the orb
js/capture/handcapture.js  Hand capture: camera + MediaPipe hand tracking
js/ui/                     drawing and page pieces
  figure.js, player.js     the signing figure and its animation
  orb.js, chat.js, topbar.js
js/main.js                 connects everything
tests/engine.test.js
```

See **GUIDE.md** for how a sentence flows through these files and how to change things.

## Honest limits

- The signs are hand-authored approximations. Check them against a dictionary (for example [Lifeprint](https://www.lifeprint.com/)) or, better, a Deaf signer.
- Real ASL also uses facial expression and body movement. Neon shows hands and arms only.
- The vocabulary is still small (155 signs). Everything outside it is fingerspelled, which is slow for long sentences.
- Speech recognition in Chrome is processed by Google's servers. Typed text only leaves your device if you add an AI key.

This is a learning aid, not a replacement for a human interpreter.


## Credits
Built by Sonika Chandra with help from Claude (Anthropic) for code and explanations.
