// Canvas that renders enemies (sprite sheet) + projectiles in world space.
// Reads refs each RAF tick — no React state, no re-renders.
import { useEffect, useRef } from "react";
import type { Enemy, Projectile } from "../combat";
import { ROOM_PX } from "../roomLayout";
import { SHEET, SCALE } from "../sprites";

// goblin (charger): 4-frame idle at row y=32, x starts at 368, step +16
// necromancer (shooter): 4-frame idle at row y=268, x starts at 368, step +16
const GOBLIN = { sx: 368, sy: 32, w: 16, h: 16 };
const NECRO = { sx: 368, sy: 268, w: 16, h: 20 };

export default function CombatOverlay({
  enemiesRef,
  projectilesRef,
}: {
  enemiesRef: React.MutableRefObject<Enemy[]>;
  projectilesRef: React.MutableRefObject<Projectile[]>;
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

      for (const p of projectilesRef.current) {
        ctx.save();
        ctx.shadowBlur = p.fromPlayer ? 12 : 8;
        ctx.shadowColor = p.fromPlayer ? "#88aaff" : "#ffaa00";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.fromPlayer ? 10 : 8, 0, Math.PI * 2);
        ctx.fillStyle = p.fromPlayer ? "#aaccff" : "#ffcc44";
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
