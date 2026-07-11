import { useEffect, useState } from "react";
import { tilePattern, type Spr } from "../sprites";

export function useTilePattern(spr: Spr): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => tilePattern(spr, setUrl), [spr]);
  return url;
}
