import { useEffect } from "react";
import { useDungeon } from "./store";
import Entrance from "./components/Entrance";
import Room2D from "./components/Room2D";
import MapOverlay from "./components/MapOverlay";
import Minimap from "./components/Minimap";
import AudioPlayer from "./components/AudioPlayer";
import PauseMenu from "./components/PauseMenu";
import GameOver from "./components/GameOver";

export default function App() {
  const view = useDungeon((s) => s.view);
  const gameOver = useDungeon((s) => s.gameOver);
  const setView = useDungeon((s) => s.setView);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useDungeon.getState();
      if (s.gameOver || s.view === "entrance") return;
      if (e.key === "Escape") {
        e.preventDefault();
        if (s.view === "map") setView("dungeon");
        else setView(s.view === "menu" ? "dungeon" : "menu");
        return;
      }
      if (e.key !== "Tab" && e.key !== "m") return;
      e.preventDefault();
      setView(s.view === "map" ? "dungeon" : "map");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setView]);

  if (view === "entrance") return <Entrance />;
  if (gameOver) return <GameOver />;
  return (
    <>
      <Room2D />
      <AudioPlayer />
      {view === "dungeon" && <Minimap />}
      {view === "map" && <MapOverlay />}
      {view === "menu" && <PauseMenu />}
    </>
  );
}
