// L4 UI: draws the neon figure and its arms/hands on a canvas.
// Everything is measured in "R" units (R = head radius) relative to the
// base of the neck, so the figure scales to any panel size.
// The figure's RIGHT side is the viewer's LEFT (it faces you), so its
// right hand uses negative x. The left hand is drawn as a mirror image.
//
// Smoothness tricks used here:
//  - each arm's pieces are filled together with one gradient, so no seams
//  - each finger is ONE line through its joints with round joins
//  - glow is drawn in a separate pass underneath, so it never covers the arm

import { handPoints, palmOutline, HAND_SCALE } from '../engine/handmodel.js';
import { solveArm } from '../engine/ik.js';

const SHOULDER = [-2.2, 0.45]; // right shoulder joint; left is mirrored
const UPPER_ARM = 2.35;
const FOREARM = 2.15;
const VIEW_TOP = -3.0;         // what part of the body the canvas shows
const VIEW_BOTTOM = 5.4;
const VIEW_HALF_WIDTH = 4.2;

// Landmark chains drawn as one stroke each: thumb, index, middle, ring, pinky
const CHAINS = [
  [1, 2, 3, 4],
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
];

function cssVar(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? [...h].map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// amount < 0 darkens towards `dark`, > 0 lightens towards white
function shade(rgb, amount, dark = [10, 40, 90]) {
  const target = amount < 0 ? dark : [255, 255, 255];
  const t = Math.abs(amount);
  const c = rgb.map((v, i) => Math.round(v + (target[i] - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

export function createFigure(canvas) {
  const ctx = canvas.getContext('2d');
  const colors = {
    line: cssVar('--figure-line', '#bdf3ff'),
    glow: cssVar('--figure-glow', '#1e90ff'),
    arm: hexToRgb(cssVar('--arm', '#bfe8ff')),
    armDeep: hexToRgb(cssVar('--arm-deep', '#5aa9ec')),
    edge: cssVar('--arm-edge', '#1d5c9c'),
    armGlow: cssVar('--arm-glow', '#39c6ff'),
    pattern: cssVar('--pattern', 'rgba(90, 170, 255, 0.16)'),
    patternDot: cssVar('--pattern-dot', 'rgba(120, 220, 255, 0.35)'),
    tieLine: cssVar('--tie-line', '#d9fbff'),
    tieGlow: cssVar('--tie-glow', '#00d9ff'),
    tieFillTop: cssVar('--tie-fill-top', 'rgba(0, 217, 255, 0.35)'),
    tieFillBottom: cssVar('--tie-fill-bottom', 'rgba(30, 100, 255, 0.18)'),
  };

  let R = 40;
  let origin = [0, 0];
  let dpr = 1;
  let width = 0;
  let height = 0;

  function resize() {
    dpr = window.devicePixelRatio || 1;
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    R = Math.min(height / (VIEW_BOTTOM - VIEW_TOP), width / (VIEW_HALF_WIDTH * 2));
    origin = [width / 2, -VIEW_TOP * R + (height - (VIEW_BOTTOM - VIEW_TOP) * R) / 2];
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  // R units -> pixels
  const px = ([x, y]) => [origin[0] + x * R, origin[1] + y * R];

  // ---------- background spotlight ----------
  function drawSpotlight() {
    const [cx, cy] = px([0, 0.6]);
    const g = ctx.createRadialGradient(cx, cy, R * 0.5, cx, cy, R * 6.5);
    g.addColorStop(0, 'rgba(40, 140, 255, 0.16)');
    g.addColorStop(0.55, 'rgba(20, 80, 200, 0.06)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  }

  // ---------- the body: neon outline only ----------
  function sidePath(p, side, m) {
    p.lineTo(...m(0.36 * side, -0.12));
    p.quadraticCurveTo(...m(0.95 * side, 0.05), ...m(1.8 * side, 0.22));
    p.bezierCurveTo(...m(2.45 * side, 0.32), ...m(2.62 * side, 0.85), ...m(2.5 * side, 1.6));
    p.bezierCurveTo(...m(2.4 * side, 2.7), ...m(2.1 * side, 3.8), ...m(1.95 * side, 5.6));
  }

  function drawBody(breathe) {
    const m = (x, y) => px([x, y + breathe]);
    const [hx, hy] = m(0, -1.75);

    // faint glass fill so the torso reads as a body
    const torso = new Path2D();
    torso.moveTo(...m(-0.3, -0.85));
    sidePath(torso, -1, m);
    torso.lineTo(...m(1.95, 5.6));
    // walk back up the other side
    torso.bezierCurveTo(...m(2.1, 3.8), ...m(2.4, 2.7), ...m(2.5, 1.6));
    torso.bezierCurveTo(...m(2.62, 0.85), ...m(2.45, 0.32), ...m(1.8, 0.22));
    torso.quadraticCurveTo(...m(0.95, 0.05), ...m(0.36, -0.12));
    torso.lineTo(...m(0.3, -0.85));
    torso.closePath();

    const fill = ctx.createLinearGradient(0, hy, 0, m(0, 5.6)[1]);
    fill.addColorStop(0, 'rgba(60, 160, 255, 0.10)');
    fill.addColorStop(1, 'rgba(20, 70, 200, 0.02)');
    ctx.fillStyle = fill;
    ctx.fill(torso);
    ctx.beginPath();
    ctx.ellipse(hx, hy, 0.82 * R, 1.0 * R, 0, 0, Math.PI * 2);
    ctx.fill();

    drawDiamondPattern(torso, m);

    // outline
    const outline = new Path2D();
    outline.ellipse(hx, hy, 0.82 * R, 1.0 * R, 0, 0, Math.PI * 2);
    for (const side of [-1, 1]) {
      outline.moveTo(...m(0.3 * side, -0.85));
      sidePath(outline, side, m);
    }
    outline.moveTo(...m(-0.55, 0.15));
    outline.quadraticCurveTo(...m(0, 0.75), ...m(0.55, 0.15));

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.shadowColor = colors.glow;
    ctx.shadowBlur = 26;
    ctx.strokeStyle = colors.glow;
    ctx.lineWidth = Math.max(3, R * 0.1);
    ctx.globalAlpha = 0.85;
    ctx.stroke(outline);
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 6;
    ctx.strokeStyle = colors.line;
    ctx.lineWidth = Math.max(1.5, R * 0.035);
    ctx.stroke(outline);
    ctx.restore();

    drawTie(m);
  }

  // ---------- diamond (argyle) pattern, kept inside the torso ----------
  function drawDiamondPattern(torso, m) {
    ctx.save();
    ctx.clip(torso);                       // nothing is drawn outside the torso
    ctx.strokeStyle = colors.pattern;
    ctx.lineWidth = Math.max(1, R * 0.025);
    const w = 0.55;                        // half-width of one diamond
    const h = 0.8;                         // half-height of one diamond
    // Two families of slanted lines; where they cross, they make diamonds
    for (let k = -12; k <= 12; k++) {
      const x0 = k * w * 2;
      ctx.beginPath();
      ctx.moveTo(...m(x0 - 6 * w, -0.2));
      ctx.lineTo(...m(x0 + 6 * w, -0.2 + 12 * h));
      ctx.moveTo(...m(x0 + 6 * w, -0.2));
      ctx.lineTo(...m(x0 - 6 * w, -0.2 + 12 * h));
      ctx.stroke();
    }
    // a soft glowing dot where the lines cross, on every other row
    ctx.fillStyle = colors.patternDot;
    for (let row = 0; row < 8; row++) {
      for (let col = -5; col <= 5; col++) {
        const x = col * w * 2 + (row % 2 ? w : 0);
        const y = -0.2 + row * h + h;
        const [px0, py0] = m(x, y);
        ctx.beginPath();
        ctx.arc(px0, py0, R * 0.04, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // ---------- neon tie under the collar: diamond knot + diamond blade ----------
  function drawTie(m) {
    const knot = new Path2D();
    knot.moveTo(...m(0, 0.42));
    knot.lineTo(...m(0.22, 0.63));
    knot.lineTo(...m(0, 0.86));
    knot.lineTo(...m(-0.22, 0.63));
    knot.closePath();

    const blade = new Path2D();
    blade.moveTo(...m(-0.12, 0.88));
    blade.lineTo(...m(0.12, 0.88));
    blade.lineTo(...m(0.38, 2.75));
    blade.lineTo(...m(0, 3.3));
    blade.lineTo(...m(-0.38, 2.75));
    blade.closePath();

    const [, top] = m(0, 0.42);
    const [, bottom] = m(0, 3.3);
    const fill = ctx.createLinearGradient(0, top, 0, bottom);
    fill.addColorStop(0, colors.tieFillTop);
    fill.addColorStop(1, colors.tieFillBottom);

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.fillStyle = fill;
    ctx.fill(blade);
    ctx.fill(knot);

    // small diamonds down the middle of the blade
    ctx.fillStyle = colors.tieLine;
    ctx.globalAlpha = 0.55;
    for (let y = 1.3; y < 2.9; y += 0.42) {
      const d = new Path2D();
      d.moveTo(...m(0, y - 0.13));
      d.lineTo(...m(0.09, y));
      d.lineTo(...m(0, y + 0.13));
      d.lineTo(...m(-0.09, y));
      d.closePath();
      ctx.fill(d);
    }
    ctx.globalAlpha = 1;

    // neon edge: wide glow, then a bright thin core (same trick as the body)
    for (const [width, color, blur] of [[R * 0.07, colors.tieGlow, 18], [R * 0.025, colors.tieLine, 4]]) {
      ctx.strokeStyle = color;
      ctx.shadowColor = colors.tieGlow;
      ctx.shadowBlur = blur;
      ctx.lineWidth = Math.max(1, width);
      ctx.stroke(blade);
      ctx.stroke(knot);
    }
    ctx.restore();
  }

  // ---------- arms: tapered pieces with round joints, filled together ----------
  // A tapered tube from a (width wa) to b (width wb)
  function tube(a, b, wa, wb) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const n = [-dy / len, dx / len];
    const p = new Path2D();
    p.moveTo(a[0] + n[0] * wa, a[1] + n[1] * wa);
    p.lineTo(b[0] + n[0] * wb, b[1] + n[1] * wb);
    p.lineTo(b[0] - n[0] * wb, b[1] - n[1] * wb);
    p.lineTo(a[0] - n[0] * wa, a[1] - n[1] * wa);
    p.closePath();
    return p;
  }

  function circle(c, r) {
    const p = new Path2D();
    p.arc(c[0], c[1], r, 0, Math.PI * 2);
    return p;
  }

  function armParts(hand, mirror, breathe) {
    const sx = mirror ? -1 : 1;
    const shoulder = [SHOULDER[0] * sx, SHOULDER[1] + breathe];
    const target = [hand.pos[0] * sx, hand.pos[1]];
    const { elbow, wrist } = solveArm(shoulder, target, UPPER_ARM, FOREARM, sx === 1 ? -1 : 1);
    const s = px(shoulder);
    const e = px(elbow);
    const w = px(wrist);
    const shapes = [
      tube(s, e, R * 0.44, R * 0.33),
      tube(e, w, R * 0.33, R * 0.24),
      circle(s, R * 0.44),
      circle(e, R * 0.33),
      circle(w, R * 0.24),
    ];
    return { s, w, shapes };
  }

  function drawArm(hand, mirror, breathe) {
    const { s, w, shapes } = armParts(hand, mirror, breathe);
    const handInfo = handGeometry(hand, w, mirror);

    // Pass 1: glow underneath everything (arm + hand)
    ctx.save();
    ctx.shadowColor = colors.armGlow;
    ctx.shadowBlur = R * 0.6;
    ctx.fillStyle = colors.armGlow;
    ctx.globalAlpha = 0.55;
    shapes.forEach((shape) => ctx.fill(shape));
    traceHandSilhouette(handInfo, colors.armGlow);
    ctx.restore();

    // Pass 2: the solid arm, one gradient across all pieces so there are no seams
    const grad = ctx.createLinearGradient(s[0], s[1], w[0], w[1]);
    grad.addColorStop(0, shade(colors.armDeep, 0));
    grad.addColorStop(1, shade(colors.arm, 0));
    ctx.fillStyle = grad;
    shapes.forEach((shape) => ctx.fill(shape));

    // Pass 3: the hand on top
    drawHand(handInfo);
  }

  // ---------- hands ----------
  function handGeometry(hand, wristPx, mirror) {
    const sx = mirror ? -1 : 1;
    const unit = HAND_SCALE * R;
    const toScreen = ([x, y, z]) => [wristPx[0] + x * sx * unit, wristPx[1] + y * unit, z];
    const pts = handPoints(hand.pose, hand.ori).map(toScreen);
    const palm = palmOutline(hand.ori).map(toScreen);
    return { pts, palm, unit };
  }

  function palmPath(palm) {
    const p = new Path2D();
    palm.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
    p.closePath();
    return p;
  }

  function chainPath(points) {
    const p = new Path2D();
    points.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
    return p;
  }

  // A plain silhouette of the whole hand (used for the glow pass)
  function traceHandSilhouette({ pts, palm, unit }, color) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.lineWidth = unit * 0.2;
    const pp = palmPath(palm);
    ctx.stroke(pp);
    ctx.fill(pp);
    for (const chain of CHAINS) ctx.stroke(chainPath(chain.map((i) => pts[i])));
  }

  function drawHand({ pts, palm, unit }) {
    const palmZ = palm.reduce((sum, p) => sum + p[2], 0) / palm.length;

    // Far things first, so nearer fingers cover them ("painter's algorithm")
    const items = [{ kind: 'palm', z: palmZ }];
    CHAINS.forEach((chain, f) => {
      const z = chain.reduce((sum, i) => sum + pts[i][2], 0) / chain.length + 0.02;
      items.push({ kind: 'finger', z, points: chain.map((i) => pts[i]), thumb: f === 0 });
    });
    items.sort((a, b) => a.z - b.z);

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const item of items) {
      const light = Math.max(-0.3, Math.min(0.25, item.z * 0.35));
      const fill = shade(colors.arm, light);

      if (item.kind === 'palm') {
        const p = palmPath(palm);
        ctx.strokeStyle = colors.edge;
        ctx.lineWidth = unit * 0.2;
        ctx.stroke(p);
        ctx.strokeStyle = fill;
        ctx.lineWidth = unit * 0.15;
        ctx.stroke(p);
        ctx.fillStyle = fill;
        ctx.fill(p);
      } else {
        const p = chainPath(item.points);
        const w = unit * (item.thumb ? 0.21 : 0.18);
        ctx.strokeStyle = colors.edge;
        ctx.lineWidth = w + unit * 0.045;
        ctx.stroke(p);
        ctx.strokeStyle = fill;
        ctx.lineWidth = w;
        ctx.stroke(p);
        // soft highlight down the middle of each finger
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = w * 0.28;
        ctx.stroke(p);
      }
    }
    ctx.restore();
  }

  // state = { right: { pose, pos, ori }, left: { ... } }
  function draw(state, time = 0) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const breathe = Math.sin(time / 1400) * 0.04;
    drawSpotlight();
    drawBody(breathe);
    drawArm(state.left, true, breathe);   // left first so the right hand is in front
    drawArm(state.right, false, breathe);
  }

  return { draw, resize };
}
