// L2 engine: the hand model. Pure maths, no page.
// A "hand pose" is a few angles (how bent each finger is). This file turns
// those angles into 21 points in the same order MediaPipe uses:
//   0 wrist, 1-4 thumb, 5-8 index, 9-12 middle, 13-16 ring, 17-20 pinky.
// Units: "palm units" (wrist to middle knuckle = 1).
// Axes: x right, y DOWN (like the screen), z towards the viewer.

export const FINGERS = ['index', 'middle', 'ring', 'pinky'];

// One palm unit measured in body units (head radius). The figure draws
// hands at this size, and the planner uses it to place a fingertip on the body.
export const HAND_SCALE = 1.15;

// Where each finger's base knuckle sits on the palm
const BASE = {
  index: [0.3, -0.95, 0],
  middle: [0.09, -1.0, 0],
  ring: [-0.12, -0.95, 0],
  pinky: [-0.31, -0.84, 0],
};

// Bone lengths: [first, second, third]
const LEN = {
  index: [0.44, 0.26, 0.2],
  middle: [0.48, 0.3, 0.21],
  ring: [0.45, 0.28, 0.2],
  pinky: [0.35, 0.21, 0.18],
  thumb: [0.4, 0.32, 0.26],
};

const THUMB_BASE = [0.24, -0.15, 0.05];
// The direction a bending thumb curls towards: across the palm, towards the viewer
const THUMB_BEND = normalize([-1, -0.15, 0.9]);

// Outline of the palm (drawn as one filled shape)
const PALM_OUTLINE = [
  [0.26, 0.02], [0.34, -0.3], [0.38, -0.62], [0.38, -0.95], [0.2, -1.03],
  [0.09, -1.05], [-0.12, -1.0], [-0.31, -0.89], [-0.38, -0.75],
  [-0.36, -0.35], [-0.27, 0.02],
].map(([x, y]) => [x, y, 0]);

// ---------- small vector helpers ----------
const rad = (deg) => (deg * Math.PI) / 180;
function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function normalize(a) {
  const len = Math.hypot(a[0], a[1], a[2]);
  return len < 1e-9 ? [0, 0, 1] : scale(a, 1 / len);
}

// ori = [yaw, pitch, roll, tilt] in degrees
//   yaw   turns the hand around its own up axis (palm towards / away from you)
//   pitch tips the fingers towards (-) or away from (+) the viewer
//   roll  spins the hand on the screen, clockwise (90 = fingers point right)
//   tilt  (optional) leans the result towards the viewer after everything else
export function rotate(p, ori = [0, 0, 0]) {
  const [yaw = 0, pitch = 0, roll = 0, tilt = 0] = ori;
  let [x, y, z] = p;
  let c = Math.cos(rad(yaw)), s = Math.sin(rad(yaw));
  [x, z] = [x * c + z * s, -x * s + z * c];
  c = Math.cos(rad(pitch)); s = Math.sin(rad(pitch));
  [y, z] = [y * c - z * s, y * s + z * c];
  c = Math.cos(rad(roll)); s = Math.sin(rad(roll));
  [x, y] = [x * c - y * s, x * s + y * c];
  c = Math.cos(rad(tilt)); s = Math.sin(rad(tilt));
  [y, z] = [y * c - z * s, y * s + z * c];
  return [x, y, z];
}

// The thumb's starting direction (t0) and the direction it bends towards (w)
function thumbFrame([abduct, oppose]) {
  const flat = [Math.sin(rad(abduct)), -Math.cos(rad(abduct)), 0];
  const t0 = add(scale(flat, Math.cos(rad(oppose))), [0, 0, Math.sin(rad(oppose))]);
  const w = normalize(sub(THUMB_BEND, scale(t0, dot(THUMB_BEND, t0))));
  const thumbDir = (deg) => add(scale(t0, Math.cos(rad(deg))), scale(w, Math.sin(rad(deg))));
  return { t0, w, thumbDir };
}

// pose = { fingers: [[mcp, pip, dip, spread] x4], thumb: [abduct, oppose, mcp, ip] }
// Returns 21 [x, y, z] points, already rotated by ori.
export function handPoints(pose, ori) {
  const pts = [[0, 0, 0]]; // 0: wrist

  // Thumb (1-4)
  const [, , tMcp, tIp] = pose.thumb;
  const { t0, thumbDir } = thumbFrame(pose.thumb);

  let p = THUMB_BASE;
  pts.push(p);
  p = add(p, scale(t0, LEN.thumb[0])); pts.push(p);
  p = add(p, scale(thumbDir(tMcp), LEN.thumb[1])); pts.push(p);
  p = add(p, scale(thumbDir(tMcp + tIp), LEN.thumb[2])); pts.push(p);

  // Fingers (5-20). Each joint angle adds to the previous one,
  // bending the finger from "up" towards the viewer (that's a curl).
  pose.fingers.forEach(([mcp, pip, dip, spread], f) => {
    const name = FINGERS[f];
    const up = [Math.sin(rad(spread)), -Math.cos(rad(spread)), 0];
    const dir = (deg) => add(scale(up, Math.cos(rad(deg))), [0, 0, Math.sin(rad(deg))]);

    let q = BASE[name];
    pts.push(q);
    [mcp, mcp + pip, mcp + pip + dip].forEach((angle, bone) => {
      q = add(q, scale(dir(angle), LEN[name][bone]));
      pts.push(q);
    });
  });

  return pts.map((pt) => rotate(pt, ori));
}

export function palmOutline(ori) {
  return PALM_OUTLINE.map((pt) => rotate(pt, ori));
}

// Blend two poses: t = 0 gives a, t = 1 gives b
export function lerpPose(a, b, t) {
  const mix = (x, y) => x + (y - x) * t;
  return {
    fingers: a.fingers.map((f, i) => f.map((v, k) => mix(v, b.fingers[i][k]))),
    thumb: a.thumb.map((v, k) => mix(v, b.thumb[k])),
  };
}
