// Shared CSS-3D machinery for the fullscreen map views (Structure3D, Nest3D).
import { useEffect, useRef } from "react";

export type V3 = [number, number, number];

// a div of thickness t whose local +x axis runs P1 -> P2 in scene space
export function lineStyle(p1: V3, p2: V3, t = 3): React.CSSProperties {
  const dx = p2[0] - p1[0], dy = p2[1] - p1[1], dz = p2[2] - p1[2];
  const len = Math.hypot(dx, dy, dz);
  return {
    position: "absolute",
    left: 0,
    top: 0,
    width: len,
    height: t,
    transformOrigin: "0 50%",
    transform:
      `translate3d(${p1[0]}px, ${p1[1] - t / 2}px, ${p1[2]}px) ` +
      `rotateZ(${Math.atan2(dy, dx)}rad) rotateY(${Math.asin(-dz / len)}rad)`,
    pointerEvents: "none",
  };
}

export const edgeKey = (a: string, b: string) =>
  a < b ? `${a}|${b}` : `${b}|${a}`;

// six cube faces with fake lighting. Shading is baked into the color via
// color-mix — NOT filter: brightness(), which trips Safari 3D flattening.
export const CUBE_FACES = [
  { t: "", b: 1.0 },
  { t: "rotateY(180deg)", b: 0.6 },
  { t: "rotateY(90deg)", b: 0.8 },
  { t: "rotateY(-90deg)", b: 0.8 },
  { t: "rotateX(90deg)", b: 0.55 },
  { t: "rotateX(-90deg)", b: 1.25 },
];

// precomputed hex (not color-mix()): dynamic color functions inside gradients
// on 3D-transformed layers repaint expensively during scene rotation
const shadeCache = new Map<string, string>();
export function shade(glow: string, b: number): string {
  const key = `${glow}|${b}`;
  const hit = shadeCache.get(key);
  if (hit) return hit;
  const h = glow.replace("#", "");
  const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  const target = b >= 1 ? [255, 255, 255] : [10, 6, 20];
  const t = b >= 1 ? Math.min(1, (b - 1) * 0.8) : 1 - b;
  const out =
    "#" +
    c
      .map((v, i) =>
        Math.round(v + (target[i] - v) * t)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("");
  shadeCache.set(key, out);
  return out;
}

// drag = yaw/pitch, native non-passive wheel = zoom, slow auto-rotate until
// the first drag. Transform is written straight to the scene div via refs —
// it must never appear in the scene's JSX style.
export function useOrbitCamera(initial = { yaw: 0, pitch: 55, zoom: 0.8 }) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const cam = useRef({ ...initial, panX: 0, panY: 0, auto: true });
  const drag = useRef<{ x: number; y: number; mode: "rotate" | "pan" } | null>(null);

  const apply = () => {
    const c = cam.current;
    const el = sceneRef.current;
    if (!el) return;
    // outermost translate = screen-space pan (grab the view and slide it);
    // scale3d, not scale(): 2D scale leaves translateZ distances (node depth,
    // cube face offsets) unscaled and the geometry warps when zooming
    el.style.transform =
      `translate(${c.panX}px, ${c.panY}px) ` +
      `rotateX(${c.pitch}deg) rotateZ(${c.yaw}deg) scale3d(${c.zoom}, ${c.zoom}, ${c.zoom})`;
  };

  useEffect(() => {
    apply();
    let raf = requestAnimationFrame(function tick() {
      if (cam.current.auto) {
        cam.current.yaw += 0.1;
        apply();
      }
      raf = requestAnimationFrame(tick);
    });
    const el = overlayRef.current;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      cam.current.zoom = Math.min(
        2.2,
        Math.max(0.35, cam.current.zoom * Math.exp(-e.deltaY * 0.001)),
      );
      apply();
    };
    el?.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      cancelAnimationFrame(raf);
      el?.removeEventListener("wheel", onWheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pointerHandlers = {
    onPointerDown: (e: React.PointerEvent) => {
      cam.current.auto = false;
      drag.current = {
        x: e.clientX,
        y: e.clientY,
        // right button or shift+drag pans; plain drag rotates
        mode: e.button === 2 || e.shiftKey ? "pan" : "rotate",
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (d.mode === "pan") {
        cam.current.panX += dx;
        cam.current.panY += dy;
      } else {
        cam.current.yaw += dx * 0.35;
        cam.current.pitch = Math.min(80, Math.max(20, cam.current.pitch - dy * 0.25));
      }
      drag.current = { ...d, x: e.clientX, y: e.clientY };
      apply();
    },
    onPointerUp: () => (drag.current = null),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(), // right-drag = pan
    onDoubleClick: () => {
      cam.current.panX = 0;
      cam.current.panY = 0;
      apply();
    },
  };

  return { overlayRef, sceneRef, pointerHandlers };
}
