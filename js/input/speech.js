// Input: speech recognition plus a loudness meter for the orb.
// Speech-to-text uses the browser's built-in recogniser (Chrome / Edge).
// Note: Chrome sends the audio to Google's servers to recognise it.

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export const speechSupported = Boolean(Recognition);

export function createSpeech({ onInterim, onFinal, onLevel, onState, onError }) {
  let recognition = null;
  let stream = null;
  let audioCtx = null;
  let meterId = 0;
  let listening = false;

  // Loudness: read the microphone and turn it into a number 0..1
  async function startMeter() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioCtx = new AudioContext();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      audioCtx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);

      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += ((v - 128) / 128) ** 2;
        onLevel(Math.min(1, Math.sqrt(sum / data.length) * 4));
        meterId = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // The orb just won't react; recognition can still work
    }
  }

  function stopMeter() {
    cancelAnimationFrame(meterId);
    stream?.getTracks().forEach((t) => t.stop());
    audioCtx?.close();
    stream = null;
    audioCtx = null;
    onLevel(0);
  }

  function start() {
    if (!Recognition || listening) return;
    recognition = new Recognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      let interim = '';
      let final = '';
      for (const result of event.results) {
        if (result.isFinal) final += result[0].transcript;
        else interim += result[0].transcript;
      }
      if (final) onFinal(final.trim());
      else onInterim(interim);
    };
    recognition.onerror = (event) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') onError(event.error);
    };
    recognition.onend = () => {
      listening = false;
      stopMeter();
      onState(false);
    };

    recognition.start();
    listening = true;
    onState(true);
    startMeter();
  }

  function stop() {
    recognition?.stop();
  }

  return {
    toggle() { listening ? stop() : start(); },
    stop,
  };
}
