// L2 engine: arm solver ("inverse kinematics"). Pure maths, no page.
// Given where the shoulder is and where the wrist should be, work out
// where the elbow goes. Two bones, two possible elbows: pick the one that
// hangs lower and points outward, like a real arm.

export function solveArm(shoulder, target, upperLen, foreLen, outward) {
  const dx = target[0] - shoulder[0];
  const dy = target[1] - shoulder[1];
  const dist = Math.hypot(dx, dy);

  // The wrist can't be further than the arm can reach, or closer than it can fold
  const reach = Math.min(Math.max(dist, Math.abs(upperLen - foreLen) + 1e-3), upperLen + foreLen - 1e-3);
  const ux = dist > 1e-9 ? dx / dist : 0;
  const uy = dist > 1e-9 ? dy / dist : 1;
  const wrist = [shoulder[0] + ux * reach, shoulder[1] + uy * reach];

  // How far along the shoulder-wrist line the elbow sits, and how far off it
  const along = (upperLen ** 2 - foreLen ** 2 + reach ** 2) / (2 * reach);
  const off = Math.sqrt(Math.max(0, upperLen ** 2 - along ** 2));
  const base = [shoulder[0] + ux * along, shoulder[1] + uy * along];
  const perp = [-uy, ux];

  const elbowA = [base[0] + perp[0] * off, base[1] + perp[1] * off];
  const elbowB = [base[0] - perp[0] * off, base[1] - perp[1] * off];

  // Prefer an elbow that hangs low (bigger y), a little out to the side,
  // and never swings across the middle of the chest
  const score = (e) => {
    const inward = -outward * e[0];                 // > 0 means towards the other side
    const crossing = Math.max(0, inward + 0.8);     // past ~0.8 from the centre line
    return e[1] + outward * e[0] * 0.4 - crossing * 2.5;
  };
  const elbow = score(elbowA) >= score(elbowB) ? elbowA : elbowB;

  return { elbow, wrist };
}
