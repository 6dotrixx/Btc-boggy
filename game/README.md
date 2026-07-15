# Nova Guardians

An original cosmic roguelite arcade shooter for the browser. Pick a galactic
guardian, fly to dodge, hold still to unload your guns — clear each sector of
space monsters, then salvage a new power and push deeper into the drift.

It shares the *genre feel* of move/stop/shoot roguelites, but all heroes,
monsters, art, names, weapons, numbers, and code here are original.

## Play

Open `index.html` in any modern browser. No build step, no dependencies.

- **Move:** WASD / arrow keys, or drag anywhere (touch/mouse)
- **Fire:** automatic — you shoot the nearest enemy whenever you stop moving
- **Goal:** survive rooms, collect shards, pick upgrades, go as deep as you can

## Features

- 4 playable guardians, each with original portrait art, a different ship,
  and a starting edge (Vex Corran, Kaela Vorn, Thornroot, Rax-9).
  Hero-select cards load the art from a CDN and fall back to an icon if
  offline — drop local copies in `assets/heroes/` to self-host.
- Move-to-dodge / stop-to-shoot combat with auto-targeting
- 5 space-monster archetypes with distinct AI
  (voidling, glowspit, ramhorn, starwisp, devourer)
- 6 distinct weapon types, each with its own feel and projectile behavior:
  - **Pulse Blaster** — fast, accurate straight bolts
  - **Rail Lance** — slow, heavy shots that pierce several foes
  - **Scatter Coil** — short-range shotgun spread of pellets
  - **Spore Burst** — homing spores that seek enemies
  - **Nova Orb** — a slow, heavy orb that hunts targets down
  - **Saw Disc** — a blade that flies out and boomerangs back, hitting on both passes

  Each guardian starts with a signature weapon, and new weapons drop as
  choices between sectors (shown as gold cards).
- 12 stackable weapon upgrades across common / rare / epic tiers that stack
  on top of any weapon (Split Cannon, Rail Slug, Bouncer Rounds, Wing Guns,
  Siphon Beam, …)
- Boss sectors every 5th sector: three rotating crowned sovereigns
  (Riftmaw Sovereign, Void Tyrant, Star Devourer) with a named health bar
  and a four-phase attack cycle — radial burst, aimed fan, minion summon,
  and charge. Boss kills pay 25 crystals and guarantee a weapon offer.
- Sector-by-sector difficulty scaling, ranks, and a death/restart loop
- Parallax starfield + nebula backdrop, dodgeable enemy fire, particles,
  screen shake on hits
- `window.NOVA_DEBUG` automation hook (snapshot / warpTo / setWeapon / buff)
  for scripted QA and balance testing

## Structure

- `index.html` — markup, styles, screens (start / upgrade / game-over)
- `game.js` — the full engine (input, combat, AI, spawning, render loop)

Everything is vanilla JS on a single canvas; tweak the tuning constants near the
top of `game.js` (enemy stats, upgrade pool, room budget) to reshape the game.
