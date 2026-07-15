// Canvas that renders enemies (sprite sheet) + projectiles + lightning arcs in world space.
// Reads refs each RAF tick — no React state, no re-renders.
import { useEffect, useRef } from "react";
import type { Enemy, Projectile, LightningArc } from "../combat";
import { ROOM_PX } from "../roomLayout";
import { SHEET, SCALE } from "../sprites";

// goblin (charger): 4-frame idle at row y=32, x starts at 368, step +16
// necromancer (shooter): 4-frame idle at row y=268, x starts at 368, step +16
const GOBLIN = { sx: 368, sy: 32, w: 16, h: 16 };
const NECRO = { sx: 368, sy: 268, w: 16, h: 20 };

// Draw a jagged lightning bolt between two points.
function drawArc(ctx: CanvasRenderingContext2D, arc: LightningArc, alpha: number) {
  const SEGS = 6;
  const dx = arc.x2 - arc.x1, dy = arc.y2 - arc.y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len; // normal
  const jitter = Math.min(len * 0.22, 28);

  // build zigzag points
  const pts: [number, number][] = [[arc.x1, arc.y1]];
  for (let i = 1; i < SEGS; i++) {
    const t = i / SEGS;
    // deterministic offset: alternate sides, vary amplitude
    const side = i % 2 === 0 ? 1 : -1;
    const amp = jitter * (0.5 + 0.5 * Math.sin(i * 1.9 + arc.x1 * 0.01));
    pts.push([
      arc.x1 + dx * t + nx * amp * side,
      arc.y1 + dy * t + ny * amp * side,
    ]);
  }
  pts.push([arc.x2, arc.y2]);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "#00ffff";
  ctx.shadowBlur = 18;
  ctx.shadowColor = "#00e5ff";
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
  ctx.stroke();
  // thin bright core
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#ffffff";
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
  ctx.stroke();
  ctx.restore();
}

export default function CombatOverlay({
  enemiesRef,
  projectilesRef,
  lightningRef,
}: {
  enemiesRef: React.MutableRefObject<Enemy[]>;
  projectilesRef: React.MutableRefObject<Projectile[]>;
  lightningRef: React.MutableRefObject<LightningArc[]>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const sheet = new Image();
    sheet.src = SHEET;

    let raf = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!ctx || !canvas) { raf = requestAnimationFrame(draw); return; }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;

      const frame = Math.floor(Date.now() / 160) % 4;

      for (const e of enemiesRef.current) {
        const spr = e.kind === "charger" ? GOBLIN : NECRO;
        const dw = spr.w * SCALE;
        const dh = spr.h * SCALE;
        const dx = e.x - dw / 2;
        const dy = e.y - dh / 2; // center sprite on e.y to match collision center

        if (sheet.complete) {
          ctx.drawImage(sheet, spr.sx + frame * 16, spr.sy, spr.w, spr.h, dx, dy, dw, dh);
        } else {
          // fallback circles while sheet loads
          ctx.beginPath();
          ctx.arc(e.x, e.y, 22, 0, Math.PI * 2);
          ctx.fillStyle = e.kind === "charger" ? "#cc2222" : "#cc6600";
          ctx.fill();
        }

        // HP bar — positioned above sprite top
        const bw = dw, bh = 5;
        const bx = dx, by = dy - dh / 2 - 8;
        ctx.fillStyle = "#111a";
        ctx.fillRect(bx, by, bw, bh);
        const frac = e.hp / e.maxHp;
        ctx.fillStyle = frac > 0.5 ? "#44ee44" : frac > 0.25 ? "#eeaa00" : "#ee3333";
        ctx.fillRect(bx, by, bw * frac, bh);
      }

      for (const arc of lightningRef.current) {
        const alpha = Math.min(1, arc.ttl / 0.08); // fast fade in last 80ms
        drawArc(ctx, arc, alpha);
      }

      for (const p of projectilesRef.current) {
        ctx.save();
        ctx.shadowBlur = 8;
        ctx.shadowColor = "#ffaa00";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
        ctx.fillStyle = "#ffcc44";
        ctx.fill();
        ctx.restore();
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <canvas
      ref={canvasRef}
      width={ROOM_PX}
      height={ROOM_PX}
      style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none", zIndex: 2 }}
    />
  );
}
