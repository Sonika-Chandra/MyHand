// L4 UI: the orb. A few thick, soft, glowing rings in neon blues that
// wobble and drift over each other. Louder speech = bigger wobble and glow.
//
// How each ring is drawn:
//  - a circle whose radius changes around the loop (sine waves) = the wobble
//  - a conic gradient, so the colour changes as you go around the ring
//  - drawn a few times slightly behind in time, fainter each time = soft trail

const RINGS = [
  { colors: ['#00e5ff', '#2f6bff', '#7df9ff', '#00e5ff'], harmonic: 3, phase: 0.0, speed: 0.55, drift: 0.12, size: 1.0 },
  { colors: ['#1a4dff', '#38b6ff', '#a6ecff', '#1a4dff'], harmonic: 2, phase: 2.1, speed: 0.4, drift: -0.09, size: 0.93 },
  { colors: ['#5ad1ff', '#0057ff', '#00f0ff', '#5ad1ff'], harmonic: 4, phase: 4.2, speed: 0.7, drift: 0.07, size: 1.06 },
];
const TRAIL = 4;      // copies per ring
const POINTS = 140;   // points around each ring

export function createOrb(canvas) {
  const ctx = canvas.getContext('2d');
  let level = 0;  // smoothed loudness 0..1
  let target = 0;
  let pulse = 0;  // short kick when a sign plays
  let dpr = 1;

  function resize() {
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  function ringPath(cx, cy, base, ring, t, amp) {
    const p = new Path2D();
    for (let i = 0; i <= POINTS; i++) {
      const a = (i / POINTS) * Math.PI * 2;
      const wave =
        Math.sin(ring.harmonic * a + ring.phase + t * ring.speed) * 0.65 +
        Math.sin((ring.harmonic + 1) * a - ring.phase - t * ring.speed * 0.7) * 0.35;
      const r = base * (1 + amp * wave);
      const x = cx + Math.cos(a + t * ring.drift) * r;
      const y = cy + Math.sin(a + t * ring.drift) * r;
      i ? p.lineTo(x, y) : p.moveTo(x, y);
    }
    p.closePath();
    return p;
  }

  function ringStyle(cx, cy, ring, t) {
    if (!ctx.createConicGradient) return ring.colors[0]; // very old browsers
    const g = ctx.createConicGradient(t * ring.drift * 2 + ring.phase, cx, cy);
    ring.colors.forEach((c, i) => g.addColorStop(i / (ring.colors.length - 1), c));
    return g;
  }

  function draw(now) {
    const t = now / 1000;
    level += (target - level) * 0.15;
    pulse *= 0.93;

    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    const cx = w / 2;
    const cy = h * 0.4;
    const base = Math.min(w, h) * 0.24 * (1 + level * 0.1 + pulse * 0.05);
    const amp = 0.06 + level * 0.12 + pulse * 0.04;
    const thickness = Math.max(4, base * (0.07 + level * 0.05));

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    RINGS.forEach((ring, r) => {
      // each ring sits a little off-centre and moves slowly
      const ox = Math.cos(t * 0.3 + r * 2.1) * base * 0.09;
      const oy = Math.sin(t * 0.25 + r * 1.7) * base * 0.09;
      const style = ringStyle(cx + ox, cy + oy, ring, t);

      for (let k = TRAIL - 1; k >= 0; k--) {
        const path = ringPath(cx + ox, cy + oy, base * ring.size, ring, t - k * 0.09, amp);
        ctx.strokeStyle = style;
        ctx.globalAlpha = (0.55 + level * 0.35 + pulse * 0.2) * (1 - k / TRAIL) ** 1.6;
        ctx.lineWidth = thickness * (1 + k * 0.25);
        ctx.shadowColor = ring.colors[1];
        ctx.shadowBlur = k === 0 ? 18 + level * 20 : 0;
        ctx.stroke(path);
      }
    });

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = 'source-over';
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);

  return {
    setLevel(value) { target = Math.max(0, Math.min(1, value)); },
    pulse() { pulse = 1; },
  };
}
