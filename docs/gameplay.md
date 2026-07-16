# Gameplay Reference

## Controls

| Key | Action |
|---|---|
| WASD / arrows | move |
| Shift (hold) | sprint — burns stamina; releases when empty |
| Space | interact with nearest exit |
| Click an exit | enter room |
| Tab / M | open / close map |
| 1 / 2 / 3 / 4 | switch map mode while map is open |
| Esc | pause menu (volume control) |
| ↩ new dungeon | start a new run (meta-progress persists) |

---

## Rooms

Every track you discover is a room. Exits link to musically similar tracks — the door labels hint at the shift in mood or tempo waiting on the other side.

Three room types are assigned by the dungeon's seed, not by you:

| Type | Frequency | Effect |
|---|---|---|
| **Combat** | ~80% | 30-second room lock on entry; enemies spawn and attack automatically. Survive to explore. |
| **Treasure** | ~10% | Attunement accumulates at double speed — great rooms to linger in. |
| **Rest** | ~10% | Fully restores HP on entry. |

Room mood also shapes combat: the track's dominant emotion applies a modifier (e.g. aggressive tracks buff enemy HP, calm tracks slow enemy movement).

---

## Attunement

Attunement is the core progression loop. The longer you listen, the stronger you become.

- Dwell time accumulates while you are in a room. Roughly **30 seconds** of listening earns full attunement for that track.
- Attunement is **proportional** — leaving at 15 seconds earns half points, not zero.
- A **bonus** is granted when you reach the full 30-second threshold, rewarding patience.
- A track that has been attuned shows on the Attunements map as a fully lit node.

Each attuned track grants **stat points** shaped by its tempo:

| BPM | Stat gained |
|---|---|
| Fast (≥ 140 BPM) | **Agility** — sprint speed |
| Slow (≤ 80 BPM) | **Stamina** — sprint duration |
| Mid | Split between both |

Agility and stamina together also scale HP and attack power.

---

## Meta-progression

Progress carries across runs. When you start a new dungeon (↩), your **accumulated listening time** is remembered. Veteran players begin each new run with a slight difficulty offset — the dungeon scales to meet you where you are.

What resets on a new run: the dungeon map, current HP, room locks.

What persists: total listening time, attunement bonuses, the Attunements graph (all tracks you've ever visited).

---

## Map Modes

Open the map with **Tab** or **M**, then press **1–4** to switch modes:

| Key | Mode | What you see |
|---|---|---|
| 1 | **Floor** | 2D floor plan of visited rooms |
| 2 | **Structure** | 3D lattice — the dungeon's spatial shape |
| 3 | **Attunements** | Force-directed graph of all tracks you've visited, with similarity edges |
| 4 | **Stats** | Your current agility, stamina, HP, attack, and attunement breakdown |

The Attunements graph is deterministic — same tracks always arrange the same way across sessions.
