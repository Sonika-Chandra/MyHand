// L4 UI: plays a list of steps smoothly, frame by frame.
// Each step says where the hands should be. The player blends from the
// current position to the next one ("move"), waits ("hold"), then goes on.

import { lerpPose } from '../engine/handmodel.js';

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const mix = (a, b, t) => a + (b - a) * t;

function lerpHand(a, b, t) {
  return {
    pose: lerpPose(a.pose, b.pose, t),
    pos: [mix(a.pos[0], b.pos[0], t), mix(a.pos[1], b.pos[1], t)],
    ori: a.ori.map((v, i) => mix(v, b.ori[i], t)),
  };
}

function lerpState(a, b, t) {
  return { right: lerpHand(a.right, b.right, t), left: lerpHand(a.left, b.left, t) };
}

export function createPlayer(figure, restState) {
  let shown = { right: restState.right, left: restState.left };
  let from = shown;
  let queue = [];
  let current = null;
  let startedAt = 0;
  let speed = 1;
  let index = -1;
  const handlers = { step: () => {}, done: () => {} };

  function startNext(now) {
    current = queue.shift() ?? null;
    if (!current) {
      handlers.done();
      return;
    }
    index += 1;
    from = shown;
    startedAt = now;
    handlers.step(current, index);
  }

  function frame(now) {
    if (current) {
      const move = current.move / speed;
      const hold = current.hold / speed;
      const elapsed = now - startedAt;
      if (elapsed < move) {
        shown = lerpState(from, current, ease(elapsed / move));
      } else {
        shown = { right: current.right, left: current.left };
        if (elapsed >= move + hold) startNext(now);
      }
    }
    figure.draw(shown, now);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    play(steps) {
      queue = steps.slice();
      index = -1;
      startNext(performance.now());
    },
    stop() {
      queue = [];
      current = null;
    },
    setSpeed(value) {
      speed = value;
    },
    isPlaying: () => current !== null,
    onStep(fn) { handlers.step = fn; },
    onDone(fn) { handlers.done = fn; },
  };
}
