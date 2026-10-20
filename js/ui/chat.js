// L4 UI: the chat log in the right panel (Vocalis-style bubbles),
// plus the progress dashes in the panel header.

export function createChat(logEl, dashesEl, emptyEl) {
  let activeChips = [];

  function scrollDown() {
    logEl.scrollTop = logEl.scrollHeight;
  }

  function hideEmpty() {
    emptyEl.hidden = true;
  }

  function addUser(text) {
    hideEmpty();
    const div = document.createElement('div');
    div.className = 'msg user';
    div.textContent = text;
    logEl.appendChild(div);
    scrollDown();
  }

  function neonRow() {
    const row = document.createElement('div');
    row.className = 'msg-row';
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = 'N';
    const bubble = document.createElement('div');
    bubble.className = 'msg neon';
    row.append(avatar, bubble);
    logEl.appendChild(row);
    return { row, bubble };
  }

  function addThinking() {
    hideEmpty();
    const { row, bubble } = neonRow();
    bubble.innerHTML = '<span class="dots"><i></i><i></i><i></i></span>';
    scrollDown();
    return { remove: () => row.remove() };
  }

  // items: [{ text, kind: 'word' | 'spell' }]
  // source: 'ai' | 'offline' | 'answer'   answer: Gemini's English reply (Question mode)
  // signed: the short summary that is actually signed (Question mode)
  // onFull: if given, shows a "Sign full answer" button that calls it once
  function addNeon(items, source, { onChip, onReplay, answer = '', signed = '', onFull = null }) {
    const { bubble } = neonRow();

    const label = document.createElement('div');
    label.className = 'msg-label';
    label.textContent = {
      ai: 'ASL gloss · AI',
      offline: 'ASL gloss · offline rules',
      answer: 'Answer',
      full: 'Full answer · signed in ASL',
    }[source];
    bubble.appendChild(label);

    if (answer) {
      const text = document.createElement('p');
      text.className = 'answer';
      text.textContent = answer;
      bubble.appendChild(text);

      const signLabel = document.createElement('div');
      signLabel.className = 'msg-label signed-label';
      signLabel.textContent = 'Signed in ASL';
      bubble.appendChild(signLabel);
      if (signed) {
        const summary = document.createElement('p');
        summary.className = 'signed-summary';
        summary.textContent = signed;
        bubble.appendChild(summary);
      }
    }

    const chips = document.createElement('div');
    chips.className = 'chips';
    const chipEls = items.map((item, i) => {
      const chip = document.createElement('button');
      chip.className = 'chip' + (item.kind === 'spell' ? ' spell' : '');
      chip.textContent = item.kind === 'spell' ? [...item.text].join('·') : item.text;
      chip.title = item.kind === 'spell' ? 'Fingerspelled: click to replay' : 'Sign: click to replay';
      chip.addEventListener('click', () => onChip(i));
      chips.appendChild(chip);
      return chip;
    });

    const replay = document.createElement('button');
    replay.className = 'link-btn';
    replay.textContent = '↻ Replay';
    replay.addEventListener('click', onReplay);

    if (items.length === 0) {
      chips.textContent = 'Nothing I can sign in that.';
    }
    const actions = document.createElement('div');
    actions.className = 'bubble-actions';
    actions.appendChild(replay);
    if (onFull) {
      const full = document.createElement('button');
      full.className = 'link-btn';
      full.textContent = '✋ Sign full answer';
      full.title = 'Sign the whole answer above. Slower, with more fingerspelling.';
      full.addEventListener('click', () => {
        full.disabled = true;
        full.textContent = 'Full answer below ↓';
        onFull();
      });
      actions.appendChild(full);
    }
    bubble.append(chips, actions);
    scrollDown();
    return chipEls;
  }

  function addNotice(text) {
    hideEmpty();
    const div = document.createElement('div');
    div.className = 'notice';
    div.textContent = text;
    logEl.appendChild(div);
    scrollDown();
  }

  function setActiveChips(chipEls) {
    activeChips = chipEls;
  }

  // Progress in the header: one dash per sign, or one bar when there are many
  const MAX_DASHES = 14;
  let dashCount = 0;

  function highlight(index) {
    activeChips.forEach((chip, i) => chip.classList.toggle('active', i === index));
    if (index >= 0) activeChips[index]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (dashCount > MAX_DASHES) {
      const fill = dashesEl.querySelector('.bar-fill');
      if (fill) fill.style.width = index < 0 ? '0%' : `${((index + 1) / dashCount) * 100}%`;
      return;
    }
    [...dashesEl.children].forEach((dash, i) => {
      dash.classList.toggle('done', i < index);
      dash.classList.toggle('active', i === index);
    });
  }

  function setDashes(count) {
    dashCount = count;
    dashesEl.innerHTML = '';
    dashesEl.classList.toggle('as-bar', count > MAX_DASHES);
    if (count > MAX_DASHES) {
      const bar = document.createElement('div');
      bar.className = 'bar';
      bar.innerHTML = '<div class="bar-fill"></div>';
      dashesEl.appendChild(bar);
      return;
    }
    for (let i = 0; i < count; i++) dashesEl.appendChild(document.createElement('span'));
  }

  function clear() {
    logEl.querySelectorAll('.msg, .msg-row, .notice').forEach((el) => el.remove());
    emptyEl.hidden = false;
    setDashes(0);
    activeChips = [];
  }

  return { addUser, addThinking, addNeon, addNotice, setActiveChips, highlight, setDashes, clear };
}
