import { useEffect, useRef } from "react";
import { useDungeon } from "../store";
import { audioUrl } from "../api";

// ponytail: no preload of door-neighbor tracks; add hidden <audio preload="auto">
// per exit if room-switch playback lag is noticeable on the real API
export default function AudioPlayer() {
  const view = useDungeon((s) => s.view);
  const track = useDungeon((s) =>
    s.currentKey ? s.tracks[s.cells[s.currentKey]?.trackId ?? ""] : undefined,
  );
  const ref = useRef<HTMLAudioElement>(null);
  const src = track ? audioUrl(track) : null;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // map tabs will get their own music later; room audio yields while map is open
    if (view === "map") el.pause();
    else el.play().catch(() => {}); // autoplay may be blocked until first gesture
  }, [view, src]);

  if (!src) return null; // mock tracks have no audio
  return <audio ref={ref} src={src} autoPlay loop />;
}
