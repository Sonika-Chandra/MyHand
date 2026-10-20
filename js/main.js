// Neon: wires everything together.
// Translate mode: text or speech -> gloss (AI or offline rules) -> steps -> figure signs it.
// Question mode:  question -> Gemini writes a short answer + its gloss -> figure signs the answer.

import { simpleGloss } from './engine/gloss.js';
import { planSigns, restStep, limitSpelling } from './engine/planner.js';
import { glossWithGemini, askGemini, getSettings, countRequest } from './ai/gemini.js';
import { createFigure } from './ui/figure.js';
import { createPlayer } from './ui/player.js';
import { createOrb } from './ui/orb.js';
import { createChat } from './ui/chat.js';
import { initTopbar } from './ui/topbar.js';
import { createSpeech, speechSupported } from './input/speech.js';
import { createHandCapture } from './capture/handcapture.js';

const $ = (id) => document.getElementById(id);
const MODE_STORE = 'neon-mode';

async function loadDatabase() {
  const response = await fetch('data/asl-signs.json');
  if (!response.ok) throw new Error('Could not load data/asl-signs.json');
  return response.json();
}

async function main() {
  const topbar = initTopbar();
  const chat = createChat($('chat-log'), $('dashes'), $('chat-empty'));
  const orb = createOrb($('orb'));
  const input = $('text-input');
  const sendBtn = $('send-btn');
  const micBtn = $('mic-btn');
  const modeBtn = $('mode-btn');
  const caption = $('caption-sign');
  const captionNote = $('caption-note');

  let db;
  try {
    db = await loadDatabase();
  } catch (err) {
    chat.addNotice(err.message + '. Run a local server (see README).');
    return;
  }

  const figure = createFigure($('figure'));
  const player = createPlayer(figure, restStep(db));
  const vocabulary = Object.keys(db.words);

  let lastPlan = null;
  let busy = false;
  let listening = false;

  // ---------- mode: 'translate' or 'ask' ----------
  let mode = 'translate';
  try { mode = localStorage.getItem(MODE_STORE) === 'ask' ? 'ask' : 'translate'; } catch { /* ignore */ }

  function placeholder() {
    if (listening) return 'Listening…';
    return mode === 'ask' ? 'Ask Neon a question, or tap Speak' : 'Type a sentence, or tap Speak';
  }

  function applyMode() {
    const ask = mode === 'ask';
    modeBtn.setAttribute('aria-pressed', String(ask));
    $('session-title').textContent = ask ? 'Ask Neon' : 'English → ASL';
    $('session-sub').textContent = ask ? 'Neon answers in sign' : 'Type or speak a sentence';
    $('send-label').textContent = ask ? 'Ask' : 'Send';
    input.placeholder = placeholder();
  }

  modeBtn.addEventListener('click', () => {
    mode = mode === 'ask' ? 'translate' : 'ask';
    try { localStorage.setItem(MODE_STORE, mode); } catch { /* ignore */ }
    applyMode();
    if (mode === 'ask' && !getSettings().key) {
      chat.addNotice('Question mode needs a Gemini key. Click 🔑 Add key in the top bar.');
    }
  });
  applyMode();

  // ---------- playing ----------
  player.onStep((step) => {
    if (step.item >= 0) {
      const item = lastPlan.items[step.item];
      caption.textContent = step.label;
      captionNote.textContent = item.kind === 'spell' ? `Fingerspelling ${item.text}` : 'Sign';
      orb.pulse();
    }
    chat.highlight(step.item);
  });
  player.onDone(() => {
    caption.textContent = '';
    captionNote.textContent = 'Ready';
    chat.highlight(-1);
  });

  function play(plan, onlyItem = null) {
    lastPlan = plan;
    const steps = onlyItem === null
      ? plan.steps
      : [...plan.steps.filter((s) => s.item === onlyItem), plan.steps[plan.steps.length - 1]];
    player.play(steps);
  }

  // Show a Neon bubble for a plan and start signing it
  function showAndPlay(plan, source, answer = '', signed = '', fullPlan = null) {
    let chips = [];
    const replay = (onlyItem) => {
      chat.setActiveChips(chips);
      chat.setDashes(plan.items.length);
      play(plan, onlyItem);
    };
    chips = chat.addNeon(plan.items, source, {
      answer,
      signed,
      // "Sign full answer": a second bubble with the whole answer's signs
      onFull: fullPlan ? () => showAndPlay(fullPlan, 'full') : null,
      onChip: (i) => replay(i),
      onReplay: () => replay(null),
    });
    replay(null);
  }

  // ---------- Translate mode ----------
  async function translate(text) {
    let tokens = null;
    let source = 'offline';
    const settings = getSettings();
    if (settings.key) {
      try {
        tokens = await glossWithGemini(text, settings, vocabulary);
        source = 'ai';
        countRequest();
        topbar.refresh();
      } catch (err) {
        chat.addNotice(`${err.message} Using offline rules instead.`);
      }
    }
    if (!tokens) tokens = simpleGloss(text, db);
    return { plan: planSigns(tokens, db), source };
  }

  // ---------- Question mode ----------
  async function ask(question) {
    const settings = getSettings();
    if (!settings.key) {
      chat.addNotice('Question mode needs a Gemini key. Click 🔑 Add key in the top bar.');
      return null;
    }
    try {
      const { answer, signed, gloss, fullGloss } = await askGemini(question, settings, vocabulary);
      countRequest();
      topbar.refresh();
      // Gemini is asked to fingerspell at most 2 words; make sure of it here too
      const plan = planSigns(limitSpelling(gloss, db, 2), db);
      // The whole answer, signed only when the user asks (no limit on spelling here)
      const fullPlan = planSigns(fullGloss ?? simpleGloss(answer, db), db);
      return { plan, source: 'answer', answer, signed, fullPlan };
    } catch (err) {
      chat.addNotice(err.message);
      return null;
    }
  }

  async function submit(text) {
    text = text.trim();
    if (!text || busy) return;
    busy = true;
    sendBtn.disabled = true;
    chat.addUser(text);
    const thinking = chat.addThinking();

    const result = mode === 'ask' ? await ask(text) : await translate(text);

    thinking.remove();
    if (result) showAndPlay(result.plan, result.source, result.answer, result.signed, result.fullPlan);
    busy = false;
    sendBtn.disabled = false;
  }

  sendBtn.addEventListener('click', () => {
    submit(input.value);
    input.value = '';
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendBtn.click();
    }
  });

  $('clear-btn').addEventListener('click', () => {
    player.play([restStep(db)]);
    chat.clear();
  });
  $('replay-btn').addEventListener('click', () => lastPlan && play(lastPlan));
  $('speed').addEventListener('input', (e) => {
    player.setSpeed(Number(e.target.value));
    $('speed-value').textContent = `${Number(e.target.value).toFixed(2)}×`;
  });

  // ---------- hand capture ----------
  const capture = createHandCapture({
    layer: $('capture-layer'),
    canvas: $('capture-canvas'),
    statusEl: $('capture-status'),
  });
  $('capture-btn').addEventListener('click', () => {
    const on = capture.toggle();
    $('capture-btn').setAttribute('aria-pressed', String(on));
  });

  // ---------- speech ----------
  if (!speechSupported) {
    micBtn.disabled = true;
    micBtn.title = 'Speech input needs Chrome or Edge';
  } else {
    const speech = createSpeech({
      onInterim: (text) => { input.value = text; },
      onFinal: (text) => { input.value = ''; submit(text); },
      onLevel: (level) => orb.setLevel(level),
      onState: (on) => {
        listening = on;
        micBtn.classList.toggle('listening', on);
        $('mic-label').textContent = on ? 'Stop' : 'Speak';
        input.placeholder = placeholder();
      },
      onError: (error) => chat.addNotice(
        error === 'not-allowed' ? 'Microphone permission was denied.' : `Speech error: ${error}`,
      ),
    });
    micBtn.addEventListener('click', () => speech.toggle());
  }
}

main();
