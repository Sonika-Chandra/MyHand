// Hand capture: camera + MediaPipe Hand Landmarker -> glowing hand skeletons.
// Shows ONLY the hands on black (the camera picture is never drawn):
//   left hand = blue, right hand = pink.
// MediaPipe is loaded the first time capture starts, so the rest of the
// page stays fast for people who never use it. Video never leaves the browser.

const VERSION = '0.10.14';
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`;
const MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const COLORS = {
  Left: { line: '#3aa0ff', glow: '#1e6bff', dot: '#bfe4ff' },
  Right: { line: '#ff4fa8', glow: '#ff1f8e', dot: '#ffd0e8' },
};

// MediaPipe labels hands as if the picture were a mirror (selfie view).
// We give it the camera's raw, un-mirrored picture, so its labels come out
// swapped: what it calls "Left" is really the person's RIGHT hand.
const REAL_SIDE = { Left: 'Right', Right: 'Left' };

let landmarkerPromise = null; // shared, so MediaPipe loads only once

async function loadLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const { FilesetResolver, HandLandmarker } = await import(`${CDN}/vision_bundle.mjs`);
      const vision = await FilesetResolver.forVisionTasks(`${CDN}/wasm`);
      const landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numHands: 2,
      });
      return { landmarker, connections: HandLandmarker.HAND_CONNECTIONS };
    })();
    landmarkerPromise.catch(() => { landmarkerPromise = null; }); // allow a retry
  }
  return landmarkerPromise;
}

export function createHandCapture({ layer, canvas, statusEl }) {
  const ctx = canvas.getContext('2d');
  let video = null;
  let stream = null;
  let running = false;
  let frameId = 0;
  let lastTime = -1;

  function show(text) {
    statusEl.textContent = text;
    statusEl.hidden = !text;
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Where the camera picture would sit inside the canvas without stretching
  function fitBox() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;
    const scale = Math.min(w / vw, h / vh);
    return { x: (w - vw * scale) / 2, y: (h - vh * scale) / 2, w: vw * scale, h: vh * scale };
  }

  function drawHands(result, connections) {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    const box = fitBox();
    // Mirror x so it feels like looking in a mirror
    const toPx = (p) => [box.x + (1 - p.x) * box.w, box.y + p.y * box.h];
    const labels = result.handedness ?? result.handednesses ?? [];

    result.landmarks.forEach((points, i) => {
      const reported = labels[i]?.[0]?.categoryName ?? 'Right';
      const side = REAL_SIDE[reported] ?? 'Right';
      const c = COLORS[side];
      const pts = points.map(toPx);

      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // glow pass, then a bright core (same neon trick as the figure)
      for (const [width, color, blur] of [[10, c.glow, 24], [4, c.line, 8]]) {
        ctx.strokeStyle = color;
        ctx.shadowColor = c.glow;
        ctx.shadowBlur = blur;
        ctx.lineWidth = width;
        ctx.beginPath();
        for (const { start, end } of connections) {
          ctx.moveTo(...pts[start]);
          ctx.lineTo(...pts[end]);
        }
        ctx.stroke();
      }
      ctx.shadowBlur = 10;
      ctx.fillStyle = c.dot;
      for (const [x, y] of pts) {
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });

    if (result.landmarks.length === 0) show('Show your hands to the camera');
    else show('');
  }

  async function start() {
    if (running) return;
    running = true;
    layer.hidden = false;
    resize();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera not available. Open the page from localhost or https.');
      }
      show('Starting camera…');
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false,
      });
      if (!running) return stop(); // turned off while waiting

      video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();

      show('Loading hand tracker…');
      const { landmarker, connections } = await loadLandmarker();
      if (!running) return;

      const loop = (now) => {
        if (!running) return;
        if (video.currentTime !== lastTime) { // only when the camera has a new picture
          lastTime = video.currentTime;
          drawHands(landmarker.detectForVideo(video, now), connections);
        }
        frameId = requestAnimationFrame(loop);
      };
      frameId = requestAnimationFrame(loop);
    } catch (err) {
      console.error(err);
      if (err.name === 'NotAllowedError') show('Camera permission was denied. Allow it in the address bar and try again.');
      else if (err.name === 'NotFoundError') show('No camera found.');
      else show(err.message?.startsWith('Camera') ? err.message : 'Could not start hand tracking. Check your internet connection (MediaPipe loads from the web).');
      stopCamera();
    }
  }

  function stopCamera() {
    cancelAnimationFrame(frameId);
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    video = null;
    lastTime = -1;
  }

  function stop() {
    running = false;
    stopCamera();
    layer.hidden = true;
    show('');
  }

  new ResizeObserver(() => { if (running) resize(); }).observe(canvas);

  return {
    toggle() { running ? stop() : start(); return running; },
    isRunning: () => running,
  };
}
