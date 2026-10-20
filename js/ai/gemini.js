// AI helper: talks to Google's Gemini API. Two jobs:
//   1. glossWithGemini: English sentence -> ASL gloss (Translate mode)
//   2. askGemini:       a question -> a short answer + its ASL gloss (Question mode)
// The API key is typed in on the website and kept in this browser only
// (localStorage). It is sent only to Google's API, nowhere else.

const KEY_STORE = 'neon-gemini-key';
const MODEL_STORE = 'neon-gemini-model';
export const DEFAULT_MODEL = 'gemini-3.5-flash';

function safeGet(name) {
  try { return localStorage.getItem(name); } catch { return null; }
}
function safeSet(name, value) {
  try { localStorage.setItem(name, value); } catch { /* storage blocked */ }
}
function safeRemove(name) {
  try { localStorage.removeItem(name); } catch { /* storage blocked */ }
}

export function getSettings() {
  return {
    key: safeGet(KEY_STORE) ?? '',
    model: safeGet(MODEL_STORE) || DEFAULT_MODEL,
  };
}

export function saveSettings({ key, model }) {
  if (key) safeSet(KEY_STORE, key.trim());
  safeSet(MODEL_STORE, (model || DEFAULT_MODEL).trim());
}

export function clearKey() {
  safeRemove(KEY_STORE);
}

// Requests made today, so the top bar can show "· 6 req" like Vocalis
function todayKey() {
  return 'neon-requests-' + new Date().toISOString().slice(0, 10);
}
export function getRequestCount() {
  return Number(safeGet(todayKey()) ?? 0);
}
export function countRequest() {
  safeSet(todayKey(), String(getRequestCount() + 1));
}

// The gloss rules both modes share
function glossRules(vocabulary) {
  return `ASL gloss rules:
- Use ASL word order: time words first, topic before comment, question words (WHAT, WHERE, WHO, HOW, WHY, WHEN) at the END.
- Drop articles (a, an, the) and forms of "to be".
- When a word's meaning matches one of these available signs, use that sign exactly: ${vocabulary.join(', ')}.
- For anything else (names, places, other words), write the English word in capitals. It will be fingerspelled, so keep words short and use as few as possible.
- Only letters A-Z, digits and hyphens.`;
}

// Status codes that mean "Google's side is busy or had a hiccup, try again":
// 500 internal error, 502 bad gateway, 503 overloaded/unavailable, 504 timeout.
const RETRYABLE = new Set([500, 502, 503, 504]);
const RETRY_DELAYS = [800, 1600, 3200]; // wait longer each time ("backoff")
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Send one prompt, get back parsed JSON. Shared by both modes.
async function callGemini(prompt, { key, model }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const request = () => fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.3 },
    }),
  });

  let response;
  for (let attempt = 0; ; attempt++) {
    try {
      response = await request();
    } catch {
      throw new Error('Could not reach Gemini (are you online?).');
    }
    // Busy server: wait and try again, up to 3 more times
    if (RETRYABLE.has(response.status) && attempt < RETRY_DELAYS.length) {
      await wait(RETRY_DELAYS[attempt]);
      continue;
    }
    break;
  }

  if (!response.ok) {
    if (response.status === 400 || response.status === 403) throw new Error('Gemini rejected the API key.');
    if (response.status === 404) throw new Error(`Model "${model}" was not found. Change it in Your key.`);
    if (response.status === 429) throw new Error('Gemini rate limit reached. Wait a minute.');
    if (RETRYABLE.has(response.status)) {
      throw new Error(`Gemini is overloaded right now (error ${response.status}). I tried 4 times. Wait a minute and ask again, or pick another model in Your key.`);
    }
    throw new Error(`Gemini error ${response.status}.`);
  }

  const data = await response.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('Gemini sent back something that was not JSON.');
  }
}

function cleanGloss(list) {
  const clean = (Array.isArray(list) ? list : [])
    .map((g) => String(g).toUpperCase().replace(/[^A-Z0-9-]/g, ''))
    .filter(Boolean);
  if (clean.length === 0) throw new Error('Gemini returned an empty gloss.');
  return clean;
}

// ---------- Translate mode ----------
export async function glossWithGemini(text, settings, vocabulary) {
  const prompt = `You convert English into ASL gloss for an animated signing avatar.

${glossRules(vocabulary)}

Return JSON only, like {"gloss": ["YOUR", "NAME", "WHAT"]}.

English: ${JSON.stringify(text)}`;

  const parsed = await callGemini(prompt, settings);
  return cleanGloss(Array.isArray(parsed) ? parsed : parsed.gloss);
}

// ---------- Question mode ----------
// Gemini sends back FOUR things:
//   answer     - a detailed written answer, shown in the chat
//   signed     - a very short summary that Neon can sign with words it knows
//   gloss      - the ASL gloss of that summary (what the figure signs first)
//   full_gloss - the ASL gloss of the WHOLE answer (for "Sign full answer")
export async function askGemini(question, settings, vocabulary) {
  const prompt = `You are Neon, a friendly assistant. Your answers are shown as text AND signed in ASL by an animated avatar that only knows a fixed list of signs.

Return JSON with three fields:

1. "answer": a clear, accurate, helpful answer in English for the chat. 3 to 6 sentences, under 120 words, plain text (no markdown). Include the important details (for example names of gases, steps, numbers).

2. "signed": a VERY short, simple summary of the answer (at most 12 words) written so it can be signed with the sign list below.

3. "gloss": the ASL gloss of "signed".

4. "full_gloss": the ASL gloss of the WHOLE "answer", so it can be signed in full. Use signs from the list wherever the meaning fits. Names and technical terms with no sign are fingerspelled, so keep them short (use abbreviations like CO2). At most 60 entries.

Strict rules for "gloss" (the summary):
- Build it ONLY from these signs: ${vocabulary.join(', ')}.
- Rephrase ideas using those signs. Examples: food -> EAT, sunlight -> SUN LIGHT, plants -> GROW, kids -> BABY, buy groceries -> BUY EAT.
- At most 2 words that are NOT in the list, and only for a name or a key term with no sign (for example CO2). Those get fingerspelled letter by letter, which is slow.
- At most 10 signs in total.
- Use ASL word order: time first, topic before comment, question words last. Drop a/an/the and forms of "to be".
- Only letters A-Z, digits and hyphens.

If you don't know the answer, say so briefly in all three fields.

Return JSON only, like:
{"answer": "Photosynthesis is how plants make food...", "signed": "Plants use sun, water and air to make food.", "gloss": ["GROW", "NEED", "SUN", "WATER", "MAKE", "EAT"], "full_gloss": ["PHOTOSYNTHESIS", "HOW", "GROW", "MAKE", "EAT", "..."]}

Question: ${JSON.stringify(question)}`;

  const parsed = await callGemini(prompt, settings);
  const answer = String(parsed.answer ?? '').trim();
  if (!answer) throw new Error('Gemini did not send an answer.');
  const signed = String(parsed.signed ?? '').trim();
  let fullGloss = null; // optional: main.js falls back to offline rules if it's missing
  try { fullGloss = cleanGloss(parsed.full_gloss).slice(0, 80); } catch { /* not sent */ }
  return { answer, signed, gloss: cleanGloss(parsed.gloss), fullGloss };
}
