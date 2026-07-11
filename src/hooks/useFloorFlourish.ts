import { useEffect, useRef, useState } from "react";

export function useFloorFlourish(floor: number): string | null {
  const [flourish, setFlourish] = useState<string | null>(null);
  const prevFloor = useRef<number | null>(null);
  useEffect(() => {
    if (prevFloor.current !== null && prevFloor.current !== floor) {
      setFlourish(`FLOOR ${floor >= 0 ? `+${floor}` : floor}`);
      const t = setTimeout(() => setFlourish(null), 1300);
      prevFloor.current = floor;
      return () => clearTimeout(t);
    }
    prevFloor.current = floor;
  }, [floor]);
  return flourish;
}
