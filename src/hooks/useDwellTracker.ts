import { useEffect } from "react";
import { useDungeon } from "../store";

export function useDwellTracker(currentKey: string | null): void {
  const addDwell = useDungeon((s) => s.addDwell);
  useEffect(() => {
    if (!currentKey) return;
    let last = performance.now();
    const flush = () => {
      const now = performance.now();
      if (useDungeon.getState().view === "dungeon")
        addDwell(currentKey, (now - last) / 1000);
      last = now;
    };
    const iv = setInterval(flush, 5000);
    return () => {
      flush();
      clearInterval(iv);
    };
  }, [currentKey, addDwell]);
}
