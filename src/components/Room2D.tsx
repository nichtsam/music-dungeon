// Top-down dungeon room, rendered strictly on the 14x14 tile grid via
// roomLayout.ts (single source of geometry). Unified interaction model:
// walk into range, [SPACE] prompt appears, Space triggers. Nothing auto-fires.
// Secret passages hide behind cracked-floor suspect spots — some are decoys.
import { useEffect, useMemo, useRef, useState } from "react";
import { useDungeon } from "../store";
import { paletteFor, topMood } from "../theme";
import { SPR, TILE, spriteStyle, tilePattern, type Spr } from "../sprites";
import { hashKey, type CellExit, type ExitSlot } from "../dungeon";
import { buildLayout, ZONES, ROOM_PX, type Rect } from "../roomLayout";

const SIZE = ROOM_PX; // 672
const CHAR = 34; // collision box (feet)
const SPEED = 250; // px/s
const TRANSITION_MS = 350;
const INTERACT_PAD = 26;

// where the character appears after leaving through `slot`
const SPAWN: Record<CellExit["slot"], { x: number; y: number }> = {
  north: { x: 7 * TILE - CHAR / 2, y: 12 * TILE - CHAR - 8 },
  south: { x: 7 * TILE - CHAR / 2, y: 2 * TILE + 8 },
  west: { x: 12 * TILE - CHAR - 8, y: 7 * TILE - CHAR / 2 },
  east: { x: TILE + 8, y: 7 * TILE - CHAR / 2 },
  up: { x: 7 * TILE - CHAR / 2, y: 9 * TILE },
  down: { x: 7 * TILE - CHAR / 2, y: 9 * TILE },
  portal: { x: 7 * TILE - CHAR / 2, y: 9 * TILE },
};

const ENTER_DELTA: Record<CellExit["slot"], [number, number]> = {
  north: [0, -60], south: [0, 60], east: [60, 0], west: [-60, 0],
  up: [0, -100], down: [0, 100], portal: [0, 0],
};

const KEYMAP: Record<string, string> = {
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
  w: "up", s: "down", a: "left", d: "right",
};

// --- suspect spots (hidden-passage candidates + decoys) ----------------------

interface Suspect {
  idx: number;
  x: number;
  y: number;
  portalExit?: CellExit;
}

function suspectsFor(
  cellKey: string,
  exits: CellExit[],
  spots: { x: number; y: number }[],
): Suspect[] {
  const portals = exits.filter((e) => e.kind === "portal");
  const h = hashKey(cellKey);
  const count = Math.min(spots.length, Math.max(portals.length + 1, 2));
  return Array.from({ length: count }, (_, i) => {
    const cand = spots[(h + i * 5) % spots.length]; // 5 ⟂ 6: distinct picks
    return { idx: i, x: cand.x, y: cand.y, portalExit: portals[i] };
  });
}

// --- interactables ------------------------------------------------------------

type Interactable =
  | { id: string; rect: Rect; kind: "exit"; exit: CellExit; prompt: string }
  | { id: string; rect: Rect; kind: "suspect"; suspect: Suspect; prompt: string };

const EXIT_VERB: Record<string, string> = {
  north: "open the door", south: "enter the passage",
  east: "enter the passage", west: "enter the passage",
  up: "climb the ladder", down: "descend the trapdoor",
  portal: "enter the secret passage",
};

function useTilePattern(spr: Spr): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => tilePattern(spr, setUrl), [spr]);
  return url;
}

// fit the fixed-size room into the actual container (ResizeObserver so
// window managers that resize without events still trigger re-measure)
function useRoomScale(ref: React.RefObject<HTMLDivElement | null>): number {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () =>
      setScale(
        Math.min(1, (el.clientWidth - 32) / SIZE, (el.clientHeight - 90) / SIZE),
      );
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return scale;
}

const WARM_MOODS = new Set(["happy", "aggressive", "energetic", "romantic", "sexy", "uplifting"]);
const BANNER_BY_MOOD: Record<string, Spr> = {
  aggressive: SPR.bannerRed, energetic: SPR.bannerRed,
  calm: SPR.bannerBlue, sad: SPR.bannerBlue, ethereal: SPR.bannerBlue,
  happy: SPR.bannerYellow, uplifting: SPR.bannerYellow,
};

export default function Room2D() {
  const {
    cells, tracks, currentKey, visitedKeys, discovered, searched,
    loading, error, reset, discover, markSearched,
  } = useDungeon();
  const enterRoom = useDungeon((s) => s.enterRoom);
  const cell = currentKey ? cells[currentKey] : null;
  const track = cell ? tracks[cell.trackId] : null;

  const containerRef = useRef<HTMLDivElement>(null);
  const scale = useRoomScale(containerRef);
  const floorUrl = useTilePattern(SPR.floor1);

  const charRef = useRef<HTMLDivElement>(null);
  const pos = useRef({ x: SPAWN.portal.x, y: SPAWN.portal.y });
  const leavingRef = useRef(false);
  const [enterDelta, setEnterDelta] = useState<[number, number]>([0, 60]);
  const [leaving, setLeaving] = useState(false);
  const [focus, setFocus] = useState<Interactable | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [flourish, setFlourish] = useState<string | null>(null);
  const toastTimer = useRef<number>(0);
  const prevFloor = useRef<number | null>(null);

  const addDwell = useDungeon((s) => s.addDwell);
  // dwell accrues while actually playing (map view doesn't count as listening)
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

  const showToast = (msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2400);
  };

  // floor-change flourish
  const floor = cell?.pos[2] ?? 0;
  useEffect(() => {
    if (prevFloor.current !== null && prevFloor.current !== floor) {
      setFlourish(`FLOOR ${floor >= 0 ? `+${floor}` : floor}`);
      const t = setTimeout(() => setFlourish(null), 1300);
      prevFloor.current = floor;
      return () => clearTimeout(t);
    }
    prevFloor.current = floor;
  }, [floor]);

  const trackHash = cell ? hashKey(cell.trackId) : 0;
  const layout = useMemo(
    () => (currentKey && cell ? buildLayout(currentKey, trackHash, cell.exits) : null),
    [currentKey, trackHash, cell?.exits],
  );

  const suspects = useMemo(
    () =>
      cell?.exits && currentKey && layout
        ? suspectsFor(currentKey, cell.exits, layout.suspectSpots)
        : [],
    [currentKey, cell?.exits, layout],
  );
  const revealedKeys = (currentKey && discovered[currentKey]) || [];
  const searchedIdxs = (currentKey && searched[currentKey]) || [];

  const interactables = useMemo<Interactable[]>(() => {
    if (!cell?.exits || !currentKey) return [];
    const list: Interactable[] = [];
    for (const ex of cell.exits) {
      if (ex.kind === "portal") continue; // surfaced via suspects below
      list.push({
        id: `exit:${ex.toKey}`,
        rect: ZONES[ex.slot as ExitSlot],
        kind: "exit",
        exit: ex,
        prompt: `${EXIT_VERB[ex.slot]} — ${ex.toTitle} · ${ex.label}`,
      });
    }
    for (const s of suspects) {
      const rect = { x: s.x, y: s.y, w: TILE, h: TILE };
      if (s.portalExit && revealedKeys.includes(s.portalExit.toKey)) {
        list.push({
          id: `portal:${s.portalExit.toKey}`,
          rect,
          kind: "exit",
          exit: s.portalExit,
          prompt: `${EXIT_VERB.portal} — ${s.portalExit.toTitle} · ${s.portalExit.label}`,
        });
      } else if (!searchedIdxs.includes(s.idx)) {
        list.push({
          id: `suspect:${s.idx}`,
          rect,
          kind: "suspect",
          suspect: s,
          prompt: "search the cracked floor",
        });
      }
    }
    return list;
  }, [cell?.exits, currentKey, suspects, revealedKeys, searchedIdxs]);

  const interactablesRef = useRef(interactables);
  interactablesRef.current = interactables;
  const focusRef = useRef<Interactable | null>(null);
  focusRef.current = focus;

  const walkThrough = (exit: CellExit) => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    setFocus(null);
    setTimeout(() => {
      pos.current = { ...SPAWN[exit.slot] };
      setEnterDelta(ENTER_DELTA[exit.slot]);
      enterRoom(exit.toKey);
      setLeaving(false);
      leavingRef.current = false;
      if (exit.kind === "portal") showToast("you emerged from a secret passage…");
    }, TRANSITION_MS);
  };
  const walkRef = useRef(walkThrough);
  walkRef.current = walkThrough;

  const doInteract = (target?: Interactable) => {
    const f = target ?? focusRef.current;
    if (!f || leavingRef.current || !currentKey) return;
    if (f.kind === "exit") {
      walkRef.current(f.exit);
    } else {
      markSearched(currentKey, f.suspect.idx);
      if (f.suspect.portalExit) {
        discover(currentKey, f.suspect.portalExit.toKey);
        showToast("✨ a secret passage appears!");
      } else {
        showToast("…nothing but dust");
      }
    }
  };
  const interactRef = useRef(doInteract);
  interactRef.current = doInteract;

  useEffect(() => {
    const held = new Set<string>();
    const down = (e: KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault();
        if (useDungeon.getState().view === "dungeon") interactRef.current();
        return;
      }
      const dir = KEYMAP[e.key];
      if (dir) { held.add(dir); e.preventDefault(); }
    };
    const up = (e: KeyboardEvent) => held.delete(KEYMAP[e.key]);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);

    let raf = 0;
    let last = performance.now();
    let focusId: string | null = null;
    const tick = (t: number) => {
      const dt = Math.min((t - last) / 1000, 0.05);
      last = t;
      if (useDungeon.getState().view !== "dungeon") {
        held.clear();
        raf = requestAnimationFrame(tick);
        return;
      }
      const p = pos.current;
      const moving = held.size > 0 && !leavingRef.current;
      if (moving) {
        if (held.has("up")) p.y -= SPEED * dt;
        if (held.has("down")) p.y += SPEED * dt;
        if (held.has("left")) p.x -= SPEED * dt;
        if (held.has("right")) p.x += SPEED * dt;
        p.x = Math.max(TILE, Math.min(13 * TILE - CHAR, p.x));
        p.y = Math.max(2 * TILE, Math.min(13 * TILE - CHAR, p.y));
      }
      // nearest interactable within padded range gets focus; Space acts on it
      let best: Interactable | null = null;
      let bestD = Infinity;
      for (const it of interactablesRef.current) {
        const r = it.rect;
        if (
          p.x < r.x + r.w + INTERACT_PAD && p.x + CHAR > r.x - INTERACT_PAD &&
          p.y < r.y + r.h + INTERACT_PAD && p.y + CHAR > r.y - INTERACT_PAD
        ) {
          const d = Math.hypot(
            r.x + r.w / 2 - (p.x + CHAR / 2),
            r.y + r.h / 2 - (p.y + CHAR / 2),
          );
          if (d < bestD) { bestD = d; best = it; }
        }
      }
      if ((best?.id ?? null) !== focusId) {
        focusId = best?.id ?? null;
        setFocus(best);
      }
      const el = charRef.current;
      if (el) {
        el.style.transform = `translate(${p.x}px, ${p.y}px)`;
        el.classList.toggle("walking", moving);
        if (held.has("left")) el.classList.add("face-left");
        else if (held.has("right")) el.classList.remove("face-left");
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      cancelAnimationFrame(raf);
    };
  }, []);

  if (!cell || !track || !layout) return null;
  const pal = paletteFor(track.models);
  const mood = topMood(track.models);
  const pulseSec = track.models?.bpm ? (60 / track.models.bpm) * 4 : 3;
  const warm = mood ? WARM_MOODS.has(mood) : false;
  const banner = (mood && BANNER_BY_MOOD[mood]) || SPR.bannerGreen;
  const doorExits = cell.exits?.filter((ex) => ex.kind === "door") ?? [];

  return (
    <div
      ref={containerRef}
      style={{
        height: "100%",
        display: "grid",
        placeItems: "center",
        background: `radial-gradient(ellipse at center, ${pal.wall}, #0c0a14 85%)`,
        transition: "background 0.6s",
      }}
    >
      <div style={{ width: SIZE * scale, height: SIZE * scale }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
      <div
        key={currentKey}
        className="room"
        style={
          {
            width: SIZE,
            height: SIZE,
            position: "relative",
            backgroundImage: floorUrl ? `url(${floorUrl})` : undefined,
            backgroundColor: floorUrl ? undefined : "#3b3147",
            backgroundSize: TILE,
            imageRendering: "pixelated",
            boxShadow: `0 0 90px ${pal.glow}38`,
            opacity: leaving ? 0 : 1,
            transition: `opacity ${TRANSITION_MS}ms`,
            "--dx": `${enterDelta[0]}px`,
            "--dy": `${enterDelta[1]}px`,
          } as React.CSSProperties
        }
      >
        {/* static tile layer: floor patches, walls, corners, dressing */}
        {layout.tiles.map((t, i) => (
          <div
            key={i}
            style={{ ...spriteStyle(t.spr), position: "absolute", left: t.col * TILE, top: t.row * TILE }}
          />
        ))}

        {/* open passages (S/E/W): the floor runs out through the wall gap,
            gently dimming toward the exit — an opening, not a black hole */}
        {layout.archways.map((a) => (
          <div
            key={a.slot}
            style={{
              position: "absolute",
              left: a.rect.x,
              top: a.rect.y,
              width: a.rect.w,
              height: a.rect.h,
              backgroundImage: floorUrl ? `url(${floorUrl})` : undefined,
              backgroundColor: "#241c30",
              backgroundSize: TILE,
              imageRendering: "pixelated",
              filter: "brightness(0.7)",
              boxShadow: `0 0 14px ${pal.glow}60`,
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: `linear-gradient(${
                  a.slot === "south" ? "180deg" : a.slot === "west" ? "270deg" : "90deg"
                }, transparent 25%, #0c0a14e0 100%)`,
              }}
            />
          </div>
        ))}

        {/* mood banners on the wall face, flanking the north doorway */}
        {layout.bannerCols.map((c) => (
          <div key={c} style={{ ...spriteStyle(banner), position: "absolute", left: c * TILE, top: 1 * TILE }} />
        ))}

        {/* animated fountain (mid on the face row, basin on the floor edge) */}
        <div className="fountain" style={{ ...spriteStyle(warm ? SPR.fountainMidRed : SPR.fountainMidBlue), position: "absolute", left: layout.fountainCol * TILE, top: 1 * TILE }} />
        <div className="fountain" style={{ ...spriteStyle(warm ? SPR.fountainBasinRed : SPR.fountainBasinBlue), position: "absolute", left: layout.fountainCol * TILE, top: 2 * TILE }} />

        {/* mood tint + BPM pulse */}
        <div style={{ position: "absolute", inset: 0, background: pal.glow, opacity: 0.16, mixBlendMode: "color", pointerEvents: "none", zIndex: 1 }} />
        <div className="pulse" style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at center, ${pal.glow}26, transparent 70%)`, animationDuration: `${pulseSec}s`, pointerEvents: "none", zIndex: 1 }} />

        {/* vignette */}
        <div style={{ position: "absolute", inset: 0, boxShadow: "inset 0 0 80px #000000a0", pointerEvents: "none", zIndex: 1 }} />

        {/* track info card — over the top wall, grid-aligned */}
        <div
          style={{
            position: "absolute",
            top: 2 * TILE + 6,
            left: "50%",
            transform: "translateX(-50%)",
            textAlign: "center",
            pointerEvents: "none",
            maxWidth: "66%",
            zIndex: 3,
            background: "#0c0a14f5",
            border: `2px solid ${pal.glow}80`,
            borderRadius: 4,
            padding: "6px 14px",
            boxShadow: `0 0 20px ${pal.glow}30`,
          }}
        >
          <div style={{ fontSize: 21, fontWeight: 700, color: pal.accent, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            🎵 {track.title}
          </div>
          <div style={{ fontSize: 15, opacity: 0.75 }}>
            {mood && `${mood} · `}
            {track.models?.genre && `${track.models.genre} · `}
            {track.models?.bpm && `${track.models.bpm} BPM`}
          </div>
          {loading && <div style={{ fontSize: 14, opacity: 0.5 }}>carving out exits…</div>}
          {error && <div style={{ fontSize: 14, color: "#ff8080" }}>{error}</div>}
        </div>

        {/* exits: north = native 2x2 wooden door; S/E/W = archway zones;
            up = ladder tile; down = hole tile. All grid-placed via ZONES. */}
        {doorExits.map((ex) => (
          <ExitFixture
            key={ex.toKey}
            exit={ex}
            pal={pal}
            visited={visitedKeys.includes(ex.toKey)}
            focused={focus?.kind === "exit" && focus.exit === ex}
            onClick={() =>
              doInteract({ id: "", rect: ZONES[ex.slot as ExitSlot], kind: "exit", exit: ex, prompt: "" })
            }
          />
        ))}

        {/* suspect spots: cracked floor, maybe hiding a passage */}
        {suspects.map((s) => {
          const revealed = s.portalExit && revealedKeys.includes(s.portalExit.toKey);
          const spent = !s.portalExit && searchedIdxs.includes(s.idx);
          return (
            <div
              key={s.idx}
              onClick={() => {
                const it = interactablesRef.current.find(
                  (i) => i.id === `suspect:${s.idx}` || (s.portalExit && i.id === `portal:${s.portalExit.toKey}`),
                );
                if (it) doInteract(it);
              }}
              style={{ position: "absolute", left: s.x, top: s.y, width: TILE, height: TILE, cursor: spent ? "default" : "pointer", zIndex: 1, display: "grid", placeItems: "center" }}
            >
              {revealed ? (
                <div
                  className="portal-rune rune-reveal"
                  style={{
                    width: 44, height: 44, borderRadius: "50%",
                    border: "3px dashed #c890ff",
                    boxShadow: "0 0 20px #7b2dff90, inset 0 0 14px #7b2dff60",
                    display: "grid", placeItems: "center", fontSize: 16, color: "#e0c8ff",
                  }}
                >
                  ✦
                </div>
              ) : (
                <div style={{ ...spriteStyle(SPR.floor8), opacity: spent ? 0.3 : 0.85, filter: spent ? "grayscale(1)" : "none" }} />
              )}
            </div>
          );
        })}

        {/* sealed walls: cobwebs, grid-centered on the missing gap */}
        {layout.sealed.map((s) => (
          <div key={s.slot} style={{ position: "absolute", left: s.x - 12, top: s.y - 12, width: 24, height: 24, display: "grid", placeItems: "center", opacity: 0.4, fontSize: 14, zIndex: 1 }} title="sealed — the dungeon offers no exit here">
            🕸
          </div>
        ))}

        {/* interaction prompt chip */}
        {focus && !leaving && (
          <div
            style={{
              position: "absolute",
              left: Math.max(80, Math.min(SIZE - 80, focus.rect.x + focus.rect.w / 2)),
              top: Math.max(6, focus.rect.y - 42),
              transform: "translateX(-50%)",
              background: "#0c0a14ee",
              border: `1px solid ${pal.accent}`,
              borderRadius: 4,
              padding: "5px 10px",
              fontSize: 16,
              whiteSpace: "nowrap",
              zIndex: 4,
              pointerEvents: "none",
              boxShadow: "0 2px 10px #000c",
            }}
          >
            <span style={{ background: pal.accent, color: "#0c0a14", borderRadius: 3, padding: "1px 5px", fontWeight: 700, marginRight: 6, fontSize: 13 }}>
              SPACE
            </span>
            {focus.prompt}
          </div>
        )}

        {/* character */}
        <div ref={charRef} className="char" style={{ position: "absolute", top: 0, left: 0, width: CHAR, height: CHAR, willChange: "transform", zIndex: 3 }}>
          <div className="wiz" style={{ position: "absolute", left: -7, bottom: 0 }} />
        </div>

        {/* toast + floor flourish */}
        {toast && (
          <div className="toast" style={{ position: "absolute", bottom: TILE + 14, left: "50%", transform: "translateX(-50%)", background: "#0c0a14ee", border: "1px solid #5a4a8a", borderRadius: 4, padding: "6px 14px", fontSize: 17, whiteSpace: "nowrap", zIndex: 4 }}>
            {toast}
          </div>
        )}
        {flourish && (
          <div className="flourish" style={{ position: "absolute", top: "42%", left: "50%", transform: "translate(-50%,-50%)", fontSize: 44, fontWeight: 800, letterSpacing: 6, color: pal.accent, textShadow: `0 0 30px ${pal.glow}`, zIndex: 5, pointerEvents: "none" }}>
            {flourish}
          </div>
        )}
      </div>
      </div>
      </div>

      <div style={{ position: "absolute", top: 16, left: 16, fontSize: 15, opacity: 0.75, lineHeight: 1.7, letterSpacing: 0.5 }}>
        ⛏ rooms explored: {visitedKeys.length} · floor {floor >= 0 ? `+${floor}` : floor}
        <br />
        WASD / arrows move · SPACE interact · Tab map
      </div>
      <button
        onClick={reset}
        style={{ position: "absolute", top: 16, right: 16, padding: "6px 12px", fontSize: 14, borderRadius: 4, border: "1px solid #5a4a8a", background: "#171226aa", color: "inherit", opacity: 0.8 }}
      >
        ↩ new dungeon
      </button>
    </div>
  );
}

function ExitFixture({
  exit, pal, visited, focused, onClick,
}: {
  exit: CellExit;
  pal: { glow: string; accent: string; wall: string };
  visited: boolean;
  focused: boolean;
  onClick: () => void;
}) {
  const slot = exit.slot as ExitSlot;
  const zone = ZONES[slot];
  const labelStyle: React.CSSProperties = {
    position: "absolute",
    fontSize: 15,
    whiteSpace: "nowrap",
    color: pal.accent,
    textShadow: "0 1px 3px #000, 0 0 6px #000",
    zIndex: 2,
    ...(slot === "north" && { top: "100%", left: "50%", transform: "translateX(-50%)", marginTop: 4 }),
    ...(slot === "south" && { bottom: "100%", left: "50%", transform: "translateX(-50%)", marginBottom: 4 }),
    ...(slot === "west" && { left: "100%", top: "50%", transform: "translateY(-50%)", marginLeft: 6 }),
    ...(slot === "east" && { right: "100%", top: "50%", transform: "translateY(-50%)", marginRight: 6 }),
    ...((slot === "up" || slot === "down") && { top: "100%", left: "50%", transform: "translateX(-50%)", marginTop: 2 }),
  };
  return (
    <div
      onClick={onClick}
      title={`${exit.toTitle} — ${exit.label}`}
      style={{
        position: "absolute",
        left: zone.x,
        top: zone.y,
        width: zone.w,
        height: zone.h,
        cursor: "pointer",
        zIndex: 2,
        overflow: "visible",
        filter: focused ? `brightness(1.35) drop-shadow(0 0 8px ${pal.glow})` : "none",
      }}
    >
      {/* north — the far, camera-facing wall — is the only direction with a
          native door sprite. South/east/west stay open: the gap itself plus
          turned wall-end caps (in the static tile layer) mark the exit. */}
      {slot === "north" && (
        <div style={{ ...spriteStyle(SPR.doorsAll), position: "absolute", left: -TILE, top: 2 * TILE - 105, filter: `drop-shadow(0 0 10px ${pal.glow}90)` }} />
      )}
      {slot === "up" && <div style={spriteStyle(SPR.ladder)} />}
      {slot === "down" && <div style={spriteStyle(SPR.hole)} />}
      <div style={labelStyle}>
        {exit.toTitle} · {exit.label}
        {visited && " ✓"}
      </div>
    </div>
  );
}
