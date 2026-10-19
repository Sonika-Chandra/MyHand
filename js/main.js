import { startTracker, onFrame, HAND_CONNECTIONS } from './tracker.js';

const video = document.getElementById('camera');
const canvas = document.getElementById('overlay');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');

let loggedOnce = false;

onFrame((frame) => {
  if (!loggedOnce && frame.hands.length > 0) {
    console.log('First frame with a hand:', frame);
    loggedOnce = true;
  }
  draw(frame);
});

function draw(frame) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (const hand of frame.hands) {
    const color = hand.side === 'Left' ? 'deepskyblue' : 'lime';

    // Skeleton lines
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    for (const { start, end } of HAND_CONNECTIONS) {
      const [x1, y1] = hand.pts[start];
      const [x2, y2] = hand.pts[end];
      ctx.beginPath();
      ctx.moveTo(x1 * canvas.width, y1 * canvas.height);
      ctx.lineTo(x2 * canvas.width, y2 * canvas.height);
      ctx.stroke();
    }

    // Joint dots
    ctx.fillStyle = color;
    for (const [x, y] of hand.pts) {
      ctx.beginPath();
      ctx.arc(x * canvas.width, y * canvas.height, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

async function main() {
  statusEl.textContent = 'Loading camera and hand tracker…';
  try {
    await startTracker(video);
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    statusEl.textContent = 'Show your hand to the camera';
  } catch (err) {
    console.error(err);
    if (err.name === 'NotAllowedError') {
      statusEl.textContent = 'Camera permission was denied. Allow it and reload.';
    } else if (err.name === 'NotFoundError') {
      statusEl.textContent = 'No camera found.';
    } else if (err.message === 'NoCameraAPI') {
      statusEl.textContent = 'Camera not available. Open this page from localhost or https.';
    } else {
      statusEl.textContent = 'Could not start: ' + (err.message || err.name);
    }
  }
}

main();