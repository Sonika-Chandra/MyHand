// --- Grab the elements from the page ---
const video = document.getElementById('camera');
const canvas = document.getElementById('overlay');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');

// --- Part A: start the camera ---
async function startCamera() {
  // No camera API usually means the page isn't on localhost/https
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    statusEl.textContent = 'Camera not available. Open this page from localhost or https.';
    return;
  }

  // Set up the listener BEFORE connecting the stream
  video.addEventListener('loadedmetadata', () => {
    canvas.width = video.videoWidth;    // drawing grid = real camera size
    canvas.height = video.videoHeight;
    statusEl.textContent = 'Camera on';
    requestAnimationFrame(drawLoop);    // start the loop only once sizes are known
  });

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' },
      audio: false,
    });
    video.srcObject = stream;
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      statusEl.textContent = 'Camera permission was denied. Allow it in the address bar and reload.';
    } else if (err.name === 'NotFoundError') {
      statusEl.textContent = 'No camera found.';
    } else {
      statusEl.textContent = 'Could not start the camera: ' + err.name;
    }
    console.error(err);
  }
}

// --- Part B: the every-frame loop ---
function drawLoop(time) {
  // 1. wipe last frame
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 2. work out where the dot goes (swings left and right over time)
  const x = canvas.width / 2 + Math.sin(time / 500) * 150;
  const y = canvas.height / 2;

  // 3. draw the dot
  ctx.beginPath();
  ctx.arc(x, y, 12, 0, Math.PI * 2);
  ctx.fillStyle = 'lime';
  ctx.fill();

  // 4. ask for the next frame
  requestAnimationFrame(drawLoop);
}

startCamera();