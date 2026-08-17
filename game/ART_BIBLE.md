# SPACE RANGER PROJECT — Production Art Bible (v0.1)

Single source of truth for every asset in this game. All future art must
follow these rules exactly — identical proportions, lighting, color rules,
and visual consistency across formats.

## Global art direction

Clean flat vector illustration. Crisp geometric shapes, minimal linework,
restrained cel shading, readable silhouettes, graphic-design quality.
NOT painterly, concept-brush, photoreal, comic ink, or anime.
Readable from 100px. Simple enough to animate, complex enough to feel AAA.

## Color

- Primary armor greys: `#232532`, `#3f424d`, `#9397ab`
- Accent violets: `#9184d9`, `#b5abfc`
- Background: pure black `#000000`
- NO orange. NO teal. NO rainbow lights. NO colored reflections.
- Everything lives inside greys and violet.

## Lighting (always identical)

One cool key light from upper left. Hard violet rim light behind right.
Deep shadows. Characters feel carved out of darkness.

## Backgrounds

Pure black. No floor, environment, stars, fog, smoke, gradients, textures.
Characters float on black.

## Character design language

Military realism, hard sci-fi, used equipment. No fantasy, no exaggerated
proportions. Armor is scratched, scuffed, chipped, paint-worn, functional —
never shiny.

## The Space Rangers

### 01 — VEGA "ROOK" ANSARI · Breacher
South Asian, mid 30s. Close-cropped undercut, scar through right eyebrow,
strong jaw. Confident, unbothered, never smiling. Heavy breach armor with
oversized LEFT shoulder pauldron, large slab chest plate, thick forearm
guards, violet ident stripe. Heavy rail rifle; helmet carried under arm.
Pose: confident, weight on back foot, low camera, heroic.

### 02 — IMO TAL · Marksman
Older East African man. Silver hair, single braid, weathered face, calm
eyes, no helmet. Minimal armor: ribbed undersuit, chest harness, one
shoulder guard. Signature: brass ranging monocle over left eye with tiny
violet glow; marksman rifle behind shoulder. Pose: still, patient, quiet
confidence.

### 03 — CASS DURO · Bulwark
Largest ranger. Helmet never removed: rounded slab helmet, single
horizontal visor slit with violet light, no visible face. Largest armor in
roster — massive collar, huge layered plates, heavy neck clamps, tower
shield visible behind shoulder. Pose: immovable, silent, threatening.

### 04 — NIX-9 · Synthetic Ranger (locked)
Almost entirely silhouette. Smooth featureless head — no eyes, no mouth —
single thin violet visor band. Slim mechanical body, cable bundles,
segmented plating. Only rim light, visor, and bare silhouette readable.
Eerie.

## Portrait system

- **Portrait** (roster/dialogue/UI): 1:1, centered, head dominates frame,
  circle-crop safe, neutral expression, consistent eye line, only collar
  ring + shoulders visible.
- **Bust** (character select): 4:5, chest up, same crop/eye line/lighting/
  background across the roster.
- **Hero portrait** (character page): 4:5, low angle, three-quarter,
  centered, bottom third fades into black.
- Hierarchy: Portrait → Bust → Hero → Gameplay Sprite. Everything derives
  from the same design; no redesigns between formats.

## Vehicle language

**WASP-class interceptor** (starter fighter): wide, low, stubby; forward-
swept wings, bubble canopy, blunt armored nose, twin cannon pods, twin
engines. Panel lines, visible rivets, blue-grey hull, one violet ident
stripe. Standard render: three-quarter front, slightly above, centered,
16:9, no background. Arrival shot: head-on, slightly below, hard
silhouette — only violet rim, engine glow, landing lights.

## Backlog

- Characters: Assault, Medic, Engineer, Heavy Weapons, Scout, Commander,
  locked units
- Enemies: drones (scout/heavy), walkers (elite), tank, gunship, bosses
- Vehicles: dropship, transports, capital ships
- Weapons: rail rifle, scatter rifle, plasma rifle, marksman rifle, heavy
  shield, sidearms, grenades
- Environments: planet tilesets (asteroid, desert, ice, jungle,
  industrial, alien ruins)
- Icons: characters, abilities, weapons, upgrades, resources, enemies
- UI: character select, inventory, upgrade tree, mission select,
  victory/defeat, loading

## Status

✅ Visual, color, lighting language established
✅ Character hierarchy + ranger roster started
✅ Vehicle language established
✅ Ranger busts + gameplay sprites generated and wired in-game
✅ Enemy class reference art generated (scout drone, ram walker, siege tank, gunship)

## Asset registry (generated to this bible)

CDN prefix: `https://d8j0ntlcm91z4.cloudfront.net/user_3F047Iq9Ue5VPXNvJsfVjZtSn7t/`
(Bundle local copies under `assets/` before store submission.)

Ranger busts (4:5):
- Rook — `hf_20260817_032932_91071b76-594b-4136-9370-2d054600aaa3.png`
- Imo Tal — `hf_20260817_032932_21d7c78a-7d58-49d4-9365-9319f75a636d.png`
- Cass Duro — `hf_20260817_032932_c970f9d2-2cbe-4975-9c00-84244bd4f8e9.png`
- NIX-9 — `hf_20260817_032932_d51e819e-72b9-431b-a770-03a06c561392.png`

Ranger gameplay sprites (transparent cutouts):
- Rook — `hf_20260817_034346_120731a2-edbb-45ab-8da9-05890f9847d6.png`
- Imo Tal — `hf_20260817_034259_1bfe381c-9d05-4bbb-b789-40af02ed36ed.png`
- Cass Duro — `hf_20260817_034308_1afc5bc0-1f95-4b64-b989-899ff10bb8e3.png`
- NIX-9 — `hf_20260817_034317_a1a501a1-2d8c-4b04-b05e-d6cfeb740655.png`

Enemy class references (1:1):
- Scout Drone — `hf_20260817_033856_aab0452a-5a4a-4d48-ad03-4a2d89087af7.png`
- Ram Walker — `hf_20260817_033856_ba2eed89-0e0f-438a-b802-5fe019407ed8.png`
- Siege Tank — `hf_20260817_033856_8f44a0b8-b288-4ade-9271-ad70d47a54df.png`
- Gunship (boss) — `hf_20260817_033856_07b70c00-1edb-4db4-af16-0d6e854697a6.png`
