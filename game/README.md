# Rift Runner

An original roguelite arcade shooter for the browser. Move to dodge, stop to
fire — clear each room, then pick a power and descend deeper into the rift.

It shares the *genre feel* of move/stop/shoot roguelites, but all art, names,
enemies, weapons, numbers, and code here are original.

## Play

Open `index.html` in any modern browser. No build step, no dependencies.

- **Move:** WASD / arrow keys, or drag anywhere (touch/mouse)
- **Fire:** automatic — you shoot the nearest enemy whenever you stop moving
- **Goal:** survive rooms, collect shards, pick upgrades, go as deep as you can

## Features

- Move-to-dodge / stop-to-shoot combat with auto-targeting
- 5 enemy archetypes with distinct AI (chaser, spitter, charger, orbiter, brute)
- 12 stackable upgrades across common / rare / epic tiers
  (multishot, pierce, ricochet, crit, flank/rear fire, lifesteal, …)
- Room-by-room difficulty scaling, XP levels, and a death/restart loop
- Dodgeable enemy projectiles, particles, floating damage numbers

## Structure

- `index.html` — markup, styles, screens (start / upgrade / game-over)
- `game.js` — the full engine (input, combat, AI, spawning, render loop)

Everything is vanilla JS on a single canvas; tweak the tuning constants near the
top of `game.js` (enemy stats, upgrade pool, room budget) to reshape the game.
