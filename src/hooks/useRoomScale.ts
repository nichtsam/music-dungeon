import { useEffect, useState } from "react";
import { TILE } from "../sprites";

const SIZE = 14 * TILE; // viewport reference: 14 tiles wide

// Compute scale so 14 tiles fit the viewport. Writes viewport dimensions into
// viewportRef for the camera RAF loop.
export function useRoomScale(
  ref: React.RefObject<HTMLDivElement | null>,
  viewportRef: React.RefObject<{ w: number; h: number }>,
): number {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      viewportRef.current.w = w;
      viewportRef.current.h = h;
      setScale(Math.min(1, (w - 32) / SIZE, (h - 90) / SIZE));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, viewportRef]);
  return scale;
}
