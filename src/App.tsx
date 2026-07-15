import { useEffect } from "react";
import { useDungeon } from "./store";
import Entrance from "./components/Entrance";
import Room2D from "./components/Room2D";
import MapOverlay from "./components/MapOverlay";
import Minimap from "./components/Minimap";
import AudioPlayer from "./components/AudioPlayer";

export default function App() {
  const view = useDungeon((s) => s.view);
  const setView = useDungeon((s) => s.setView);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" && e.key !== "m") return;
      const { view } = useDungeon.getState();
      if (view === "entrance") return;
      e.preventDefault();
      setView(view === "map" ? "dungeon" : "map");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setView]);

  if (view === "entrance") return <Entrance />;
  return (
    <>
      <Room2D />
      <AudioPlayer />
      {view === "dungeon" && <Minimap />}
      {view === "map" && <MapOverlay />}
    </>
  );
}
