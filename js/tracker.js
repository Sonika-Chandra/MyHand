// L1: camera + MediaPipe -> frames. This file never draws anything.

import {
  FilesetResolver,
  HandLandmarker,
} from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs';

const WASM_PATH =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_PATH =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

// Which of the 21 points join up (used to draw the skeleton)
export const HAND_CONNECTIONS = HandLandmarker.HAND_CONNECTIONS;

const subscribers = [];
let landmarker = null;
let video = null;
let lastVideoTime = -1;

// Anyone who wants frames hands us a function; we call it every frame
export function onFrame(fn) {
  subscribers.push(fn);
}

export async function startTracker(videoEl) {
  video = videoEl;
  await startCamera();

  const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
  landmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numHands: 2,
  });

  requestAnimationFrame(loop);
}

async function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('NoCameraAPI');
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480, facingMode: 'user' },
    audio: false,
  });
  video.srcObject = stream;

  // Turn the "loadedmetadata" event into something we can await
  await new Promise((resolve) =>
    video.addEventListener('loadedmetadata', resolve, { once: true })
  );
}

function loop(now) {
  // Only run detection when the camera has produced a NEW picture
  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const result = landmarker.detectForVideo(video, now);
    const frame = toFrame(result, now);
    subscribers.forEach((fn) => fn(frame));
  }
  requestAnimationFrame(loop);
}

// Convert MediaPipe's result into the spec's frame shape
function toFrame(result, now) {
  const labels = result.handedness ?? result.handednesses ?? [];
  const hands = result.landmarks.map((points, i) => ({
    side: labels[i]?.[0]?.categoryName ?? 'Unknown',
    pts: points.map((p) => [p.x, p.y, p.z]),
  }));
  return { t: now / 1000, hands };
}