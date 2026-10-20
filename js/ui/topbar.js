// L4 UI: top bar. "About Neon" dialog, the API key dialog and the key pill.

import {
  getSettings, saveSettings, clearKey, getRequestCount, DEFAULT_MODEL,
} from '../ai/gemini.js';

export function initTopbar() {
  const pill = document.getElementById('key-pill');
  const keyBtn = document.getElementById('key-btn');
  const aboutBtn = document.getElementById('about-btn');
  const aboutDialog = document.getElementById('about-dialog');
  const keyDialog = document.getElementById('key-dialog');
  const keyInput = document.getElementById('key-input');
  const modelInput = document.getElementById('model-input');
  const keyForm = document.getElementById('key-form');
  const removeBtn = document.getElementById('key-remove');

  function refresh() {
    const { key, model } = getSettings();
    if (key) {
      pill.classList.add('on');
      pill.innerHTML = `<i class="dot"></i>Your key · ${model} · ${getRequestCount()} req`;
      keyBtn.textContent = '🔑 Your key ✓';
    } else {
      pill.classList.remove('on');
      pill.innerHTML = '<i class="dot"></i>No key · offline rules';
      keyBtn.textContent = '🔑 Add key';
    }
  }

  aboutBtn.addEventListener('click', () => aboutDialog.showModal());

  keyBtn.addEventListener('click', () => {
    const { key, model } = getSettings();
    keyInput.value = key;
    modelInput.value = model || DEFAULT_MODEL;
    keyDialog.showModal();
  });

  // <form method="dialog"> closes the dialog by itself after "Save"
  keyForm.addEventListener('submit', () => {
    saveSettings({ key: keyInput.value, model: modelInput.value });
    refresh();
  });
  document.getElementById('key-cancel').addEventListener('click', () => keyDialog.close());

  removeBtn.addEventListener('click', () => {
    clearKey();
    keyInput.value = '';
    refresh();
    keyDialog.close();
  });

  // Close a dialog when you click the dark area around it
  for (const dialog of [aboutDialog, keyDialog]) {
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close();
    });
  }

  refresh();
  return { refresh };
}
