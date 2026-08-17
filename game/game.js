/* ============================================================
   NOVA GUARDIANS  —  an original cosmic roguelite shooter
   Same genre feel as move/stop/shoot roguelites, 100% original
   heroes, monsters, names, numbers and code. Single-file JS.
   ============================================================ */
(() => {
'use strict';

// ---------- Canvas & world ----------
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const WORLD = { w: 480, h: 800 };
let scale = 1, offX = 0, offY = 0;

function resize() {
  const vw = window.innerWidth, vh = window.innerHeight;
  scale = Math.min(vw / WORLD.w, vh / WORLD.h);
  canvas.width = Math.round(WORLD.w * scale);
  canvas.height = Math.round(WORLD.h * scale);
  offX = 0; offY = 0;
}
window.addEventListener('resize', resize);
resize();

// ---------- Helpers ----------
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const dist2 = (a, b) => { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; };
const now = () => performance.now();
const TAU = Math.PI * 2;

// ---------- Starfield (parallax) ----------
const stars = [];
for (let i = 0; i < 90; i++) {
  stars.push({ x: rand(0, WORLD.w), y: rand(0, WORLD.h), z: rand(0.2, 1), tw: rand(0, TAU) });
}
const nebulae = [
  { x: 120, y: 180, r: 220, c: 'rgba(120,70,200,0.14)' },
  { x: 380, y: 560, r: 260, c: 'rgba(50,120,220,0.12)' },
  { x: 240, y: 700, r: 200, c: 'rgba(200,60,140,0.10)' },
];
let starPhase = 0;

// ---------- Input ----------
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.key.toLowerCase()] = true;
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase())) e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

const drag = { active: false, sx: 0, sy: 0, dx: 0, dy: 0 };
function pointerStart(x, y) { drag.active = true; drag.sx = x; drag.sy = y; drag.dx = 0; drag.dy = 0; }
function pointerMove(x, y) {
  if (!drag.active) return;
  drag.dx = x - drag.sx; drag.dy = y - drag.sy;
  const mag = Math.hypot(drag.dx, drag.dy), max = 60;
  if (mag > max) { drag.dx = drag.dx / mag * max; drag.dy = drag.dy / mag * max; }
}
function pointerEnd() { drag.active = false; drag.dx = 0; drag.dy = 0; }
canvas.addEventListener('touchstart', e => { const t = e.touches[0]; pointerStart(t.clientX, t.clientY); }, { passive: true });
canvas.addEventListener('touchmove', e => { const t = e.touches[0]; pointerMove(t.clientX, t.clientY); }, { passive: true });
canvas.addEventListener('touchend', pointerEnd);
canvas.addEventListener('mousedown', e => pointerStart(e.clientX, e.clientY));
window.addEventListener('mousemove', e => pointerMove(e.clientX, e.clientY));
window.addEventListener('mouseup', pointerEnd);

function moveVector() {
  let mx = 0, my = 0;
  if (keys['a'] || keys['arrowleft']) mx -= 1;
  if (keys['d'] || keys['arrowright']) mx += 1;
  if (keys['w'] || keys['arrowup']) my -= 1;
  if (keys['s'] || keys['arrowdown']) my += 1;
  if (mx || my) { const m = Math.hypot(mx, my); return { x: mx / m, y: my / m, moving: true }; }
  if (drag.active && (Math.abs(drag.dx) > 6 || Math.abs(drag.dy) > 6)) {
    const m = Math.hypot(drag.dx, drag.dy);
    return { x: drag.dx / m, y: drag.dy / m, moving: true };
  }
  return { x: 0, y: 0, moving: false };
}

// ---------- Game state ----------
const State = { START: 0, HEROES: 1, PLAY: 2, UPGRADE: 3, OVER: 4, PAUSE: 5 };
let state = State.START;

// ---------- Persistent save (best run, settings) ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('ng_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('ng_' + k, JSON.stringify(v)); } catch (e) {} },
};
let bestRoom = store.get('best', 0);

// ---------- Sound (synthesized — no audio files) ----------
const SFX = (() => {
  let actx = null;
  let on = store.get('sound', true);
  function ac() {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }
  // one tiny synth: pitch, duration, wave, volume, pitch slide
  function blip(freq, dur, type, vol, slide) {
    if (!on) return;
    try {
      const a = ac(), o = a.createOscillator(), g = a.createGain();
      o.type = type || 'square'; o.frequency.setValueAtTime(freq, a.currentTime);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), a.currentTime + dur);
      g.gain.setValueAtTime(vol || 0.12, a.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
      o.connect(g); g.connect(a.destination);
      o.start(); o.stop(a.currentTime + dur);
    } catch (e) { /* audio unavailable — play silently */ }
  }
  return {
    get on() { return on; },
    toggle() { on = !on; store.set('sound', on); return on; },
    shoot() { blip(760, 0.07, 'square', 0.05, -320); },
    hit()   { blip(220, 0.08, 'sawtooth', 0.07, -70); },
    pop()   { blip(460, 0.16, 'triangle', 0.14, 320); },
    hurt()  { blip(150, 0.22, 'sawtooth', 0.16, -70); },
    gate()  { blip(520, 0.35, 'sine', 0.14, 520); },
    pick()  { blip(700, 0.12, 'sine', 0.13, 260); setTimeout(() => blip(1050, 0.18, 'sine', 0.13, 150), 90); },
    boss()  { blip(95, 0.5, 'sawtooth', 0.2, -35); setTimeout(() => blip(75, 0.6, 'sawtooth', 0.2, -25), 250); },
    die()   { blip(320, 0.3, 'sawtooth', 0.18, -180); setTimeout(() => blip(180, 0.5, 'sawtooth', 0.16, -120), 200); },
    win()   { blip(620, 0.12, 'triangle', 0.15, 0); setTimeout(() => blip(780, 0.12, 'triangle', 0.15, 0), 110); setTimeout(() => blip(1040, 0.22, 'triangle', 0.15, 0), 220); },
    click() { blip(640, 0.05, 'square', 0.08, 0); },
  };
})();

// ---------- Guardian roster (original heroes) ----------
// Portrait art (generated). Falls back to the emoji icon if a URL fails to load.
const ART = 'https://d8j0ntlcm91z4.cloudfront.net/user_3F047Iq9Ue5VPXNvJsfVjZtSn7t/';
// THE SPACE RANGERS — per the production bible (ART_BIBLE.md)
const HEROES = [
  { id:'rook', ico:'⚔️', name:'Vega "Rook" Ansari', role:'Breacher', color:'#9397ab', perk:'Scatter rifle — brutal up close',
    art: ART + 'hf_20260817_032932_91071b76-594b-4136-9370-2d054600aaa3.png',
    sprite: ART + 'hf_20260817_034346_120731a2-edbb-45ab-8da9-05890f9847d6.png',
    base:{ fireRate:0.68, dmg:12, maxHp:130, speed:195, weapon:'scatter' } },
  { id:'imo',  ico:'🎯', name:'Imo Tal',            role:'Marksman', color:'#b5abfc', perk:'Rail rifle — one slug, three kills',
    art: ART + 'hf_20260817_032932_21d7c78a-7d58-49d4-9365-9319f75a636d.png',
    sprite: ART + 'hf_20260817_034259_1bfe381c-9d05-4bbb-b789-40af02ed36ed.png',
    base:{ fireRate:0.85, dmg:18, maxHp:95,  speed:205, weapon:'rail' } },
  { id:'cass', ico:'🛡️', name:'Cass Duro',          role:'Bulwark',  color:'#7d8299', perk:'Shield discs — immovable, unstoppable',
    art: ART + 'hf_20260817_032932_c970f9d2-2cbe-4975-9c00-84244bd4f8e9.png',
    sprite: ART + 'hf_20260817_034308_1afc5bc0-1f95-4b64-b989-899ff10bb8e3.png',
    base:{ fireRate:0.80, dmg:11, maxHp:170, speed:165, weapon:'disc' } },
  { id:'nix',  ico:'👁️', name:'NIX-9',              role:'Synthetic', color:'#9184d9', perk:'Nova orbs — eerie, relentless',
    art: ART + 'hf_20260817_032932_d51e819e-72b9-431b-a770-03a06c561392.png',
    sprite: ART + 'hf_20260817_034317_a1a501a1-2d8c-4b04-b05e-d6cfeb740655.png',
    base:{ fireRate:0.60, dmg:10, maxHp:100, speed:225, weapon:'nova' } },
];

// ---------- Weapons (original) ----------
// fireRate = multiplier on the hero's base interval (lower = faster).
// dmgMult scales per-projectile damage; count is base projectiles per shot;
// behaviour drives special motion. All stack with the upgrade pool.
// the ranger armory — names from the production bible, violet-family bolts
const WEAPONS = {
  pulse:   { name:'Plasma Rifle',   ico:'🔫', fireRate:1.00, dmgMult:1.0, projSpeed:480, count:1, spread:0.16, r:5, range:1.0,  color:'#d3ccff', behavior:'straight',  desc:'Fast, accurate plasma bolts' },
  rail:    { name:'Rail Rifle',     ico:'🔩', fireRate:1.55, dmgMult:2.3, projSpeed:640, count:1, spread:0.04, r:7, range:1.2,  color:'#eef0ff', behavior:'straight', pierce:3, desc:'Slow, heavy slugs that punch through' },
  scatter: { name:'Scatter Rifle',  ico:'💠', fireRate:0.80, dmgMult:0.70,projSpeed:430, count:5, spread:0.30, r:4, range:0.85, color:'#b5abfc', behavior:'straight',  desc:'A short-range blast of flechettes' },
  spore:   { name:'Seeker Swarm',   ico:'🎯', fireRate:1.10, dmgMult:0.8, projSpeed:300, count:3, spread:0.30, r:6, range:1.4,  color:'#a795ff', behavior:'homing',   desc:'Smart rounds that hunt their mark' },
  nova:    { name:'Nova Orb',       ico:'🌀', fireRate:1.35, dmgMult:1.5, projSpeed:250, count:1, spread:0.0,  r:9, range:1.6,  color:'#9184d9', behavior:'homing', pierce:1, desc:'A slow orb that hunts down foes' },
  disc:    { name:'Shield Discs',   ico:'🛡️', fireRate:0.95, dmgMult:1.0, projSpeed:420, count:2, spread:0.55, r:8, range:1.0,  color:'#9397ab', behavior:'boomerang', pierce:99, desc:'Twin discs that fly out and return' },
};
let heroDef = HEROES[0];

const player = { x: WORLD.w/2, y: WORLD.h-140, r: 15 };

function initPlayerFromHero(h) {
  const b = h.base;
  Object.assign(player, {
    x: WORLD.w/2, y: WORLD.h-140, r: 15, color: h.color,
    speed: b.speed, hp: b.maxHp, maxHp: b.maxHp,
    fireRate: b.fireRate, dmg: b.dmg, projSpeed: 470, range: 350,
    multishot: b.multishot || 1, spread: 0.16, pierce: 0, ricochet: 0,
    crit: 0.05, critMult: 2, lifesteal: b.lifesteal || 0,
    sideShot: false, backShot: false, fireCd: 0, inv: 0, facing: -Math.PI/2, thrust: 0,
    weapon: WEAPONS[b.weapon] || WEAPONS.pulse,
  });
}

let bullets = [], ebullets = [], enemies = [], particles = [], floaters = [];
let coins = 0, room = 1, level = 1, xp = 0, xpNext = 3;
let roomTarget = 0, roomActive = false, spawnTimer = 0, toSpawn = [];
let portal = null;      // open gate when the room is cleared; walk in to advance
let warpFx = 0;         // transition flash when entering a new room
let obstacles = [];     // pools (block walking) and crates (block walking + shots)

// ---------- Room theming (station chambers, palette shifts as you go deeper) ----------
const PAD = 24;                     // wall thickness — playfield is inset by this
// production-bible palette: greys and violet only, carved out of darkness
const ROOM_THEMES = [
  { floorA:'#232532', floorB:'#282a3a', wall:'#3f424d', glow:'#b5abfc' },   // outpost deck
  { floorA:'#221e33', floorB:'#28233c', wall:'#453a63', glow:'#b5abfc' },   // violet vault
  { floorA:'#1c1e28', floorB:'#212430', wall:'#394153', glow:'#9184d9' },   // dark hold
  { floorA:'#2a2333', floorB:'#302840', wall:'#4d3f5e', glow:'#b5abfc' },   // deep bay
];
const roomTheme = () => ROOM_THEMES[Math.floor((room - 1) / 3) % ROOM_THEMES.length];

// ---------- Space-monster archetypes (original) ----------
// hostile machines — bible designs: drones, walkers, tanks in grey/violet
const ENEMY_TYPES = {
  voidling: { r:13, hp:22, speed:60,  color:'#8b7bd9', touch:12, score:1, ai:'chase',  shape:'drone',  label:'SCOUT DRONE' },
  glowspit: { r:15, hp:32, speed:32,  color:'#a795ff', touch:10, score:2, ai:'ranged', shape:'gunner', label:'GUNNER DRONE', fireEvery:1.8, projSpeed:210 },
  ramhorn:  { r:17, hp:46, speed:42,  color:'#6b7089', touch:18, score:2, ai:'charge', shape:'walker', label:'RAM WALKER' },
  starwisp: { r:12, hp:26, speed:95,  color:'#cfc8ff', touch:10, score:2, ai:'orbit',  shape:'probe',  label:'ORBIT PROBE', fireEvery:2.4, projSpeed:180 },
  devourer: { r:26, hp:150, speed:34, color:'#e0719b', touch:26, score:5, ai:'chase',  shape:'tank',   label:'SIEGE TANK' },
};

// ---------- Bosses (every 5th sector) ----------
const BOSS_TYPES = [
  { name:'SIEGE COLOSSUS', color:'#e0719b', shape:'tank',   r:36 },
  { name:'HIVE CARRIER',   color:'#9184d9', shape:'drone',  r:34 },
  { name:'WAR STRIDER',    color:'#b5abfc', shape:'walker', r:36 },
];

function spawnBoss(n) {
  const def = BOSS_TYPES[((n / 5 - 1) | 0) % BOSS_TYPES.length];
  const hp = 340 + n * 46;
  enemies.push({
    kind: 'devourer', boss: true, name: def.name,
    x: WORLD.w / 2, y: 150, r: def.r, color: def.color, shape: def.shape,
    hp, maxHp: hp, speed: 42, touch: 30, ai: 'boss',
    attackCd: 1.6, patternIdx: 0,
    orbT: rand(0, TAU), chargeVX: 0, chargeVY: 0, charging: 0,
    flash: 0, wobble: rand(0, TAU),
  });
  floaters.push({ x: WORLD.w / 2, y: 260, txt: def.name + ' AWAKENS', t: 1.8, crit: true, vy: -10 });
  SFX.boss();
}

// ---------- Upgrade pool (space-weapon names) ----------
const UPGRADES = [
  { id:'dmg',   ico:'🔥', name:'Plasma Core',    rar:'common', desc:'+25% weapon damage', apply:p=>p.dmg*=1.25 },
  { id:'rate',  ico:'⚡', name:'Overclock',       rar:'common', desc:'+18% fire rate',     apply:p=>p.fireRate*=0.82 },
  { id:'hp',    ico:'🛡️', name:'Shield Cell',     rar:'common', desc:'+30 max hull & repair', apply:p=>{p.maxHp+=30;p.hp+=30;} },
  { id:'speed', ico:'🚀', name:'Ion Thrusters',   rar:'common', desc:'+12% flight speed',  apply:p=>p.speed*=1.12 },
  { id:'multi', ico:'🎯', name:'Split Cannon',    rar:'rare',   desc:'+1 projectile',      apply:p=>p.multishot+=1 },
  { id:'pierce',ico:'🏹', name:'Rail Slug',       rar:'rare',   desc:'Shots pierce +1 foe', apply:p=>p.pierce+=1 },
  { id:'ric',   ico:'💫', name:'Bouncer Rounds',  rar:'rare',   desc:'Shots ricochet +1 time', apply:p=>p.ricochet+=1 },
  { id:'crit',  ico:'✨', name:'Targeting AI',    rar:'rare',   desc:'+12% critical chance', apply:p=>p.crit+=0.12 },
  { id:'side',  ico:'↔️', name:'Wing Guns',       rar:'epic',   desc:'Fire from both wings', apply:p=>p.sideShot=true },
  { id:'back',  ico:'🔄', name:'Tail Gun',        rar:'epic',   desc:'Also fire backward',  apply:p=>p.backShot=true },
  { id:'leech', ico:'🩸', name:'Siphon Beam',     rar:'epic',   desc:'Heal 6% of damage',   apply:p=>p.lifesteal+=0.06 },
  { id:'big',   ico:'💥', name:'Heavy Cannon',    rar:'epic',   desc:'+50% dmg, -10% rate', apply:p=>{p.dmg*=1.5;p.fireRate*=1.10;} },
];
const RAR_COLOR = { common:'#9fb2cf', rare:'#5ad1ff', epic:'#c07bff', weapon:'#ffd15a' };

function pickUpgrades(n) {
  const pool = [...UPGRADES], out = [];
  const weight = u => u.rar === 'common' ? 5 : u.rar === 'rare' ? 3 : 1.4;
  while (out.length < n && pool.length) {
    let total = pool.reduce((s, u) => s + weight(u), 0);
    let roll = Math.random() * total, idx = 0;
    for (let i = 0; i < pool.length; i++) { roll -= weight(pool[i]); if (roll <= 0) { idx = i; break; } }
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

// ---------- Sector / wave generation ----------
function buildRoom(n) {
  roomActive = true; toSpawn = []; spawnTimer = 0;
  // furnish the room: pools you walk around, crates that also block shots
  obstacles = [];
  if (n % 5 !== 0) {          // boss arenas stay clear
    const spots = [
      { x: 110, y: 250 }, { x: WORLD.w - 110, y: 250 },
      { x: 130, y: 460 }, { x: WORLD.w - 130, y: 460 },
      { x: WORLD.w / 2, y: 350 }, { x: WORLD.w / 2 - 140, y: 590 }, { x: WORLD.w / 2 + 140, y: 590 },
    ].sort(() => Math.random() - 0.5);
    const count = 2 + Math.floor(rand(0, 2));
    for (let i = 0; i < count; i++) {
      const s = spots[i];
      obstacles.push({ x: s.x, y: s.y, w: rand(76, 116), h: rand(52, 72), type: Math.random() < 0.5 ? 'pool' : 'crate' });
    }
  }
  if (n % 5 === 0) {          // boss sector
    roomTarget = 1;
    spawnBoss(n);
    return;
  }
  const budget = 3 + n * 1.7;
  let spent = 0;
  while (spent < budget) {
    let choices = ['voidling'];
    if (n >= 2) choices.push('glowspit');
    if (n >= 3) choices.push('ramhorn', 'starwisp');
    if (n >= 6 && Math.random() < 0.28) choices.push('devourer');
    const k = choices[Math.floor(Math.random() * choices.length)];
    toSpawn.push(k); spent += ENEMY_TYPES[k].score;
  }
  roomTarget = toSpawn.length;
  toSpawn = toSpawn.map((k, i) => ({ k, at: i * rand(0.25, 0.6) }));
}

function spawnEnemy(kind) {
  const t = ENEMY_TYPES[kind];
  const hpScale = 1 + (room - 1) * 0.15;
  let x, y, tries = 0;
  do {
    const edge = Math.floor(rand(0, 3));
    if (edge === 0) { x = rand(30, WORLD.w - 30); y = rand(-20, 60); }
    else if (edge === 1) { x = rand(-20, 60); y = rand(40, WORLD.h * 0.55); }
    else { x = rand(WORLD.w - 60, WORLD.w + 20); y = rand(40, WORLD.h * 0.55); }
    tries++;
  } while (dist2({ x, y }, player) < 140 * 140 && tries < 8);
  enemies.push({
    kind, x, y, r: t.r, color: t.color, shape: t.shape,
    hp: t.hp * hpScale, maxHp: t.hp * hpScale, speed: t.speed, touch: t.touch, ai: t.ai,
    fireCd: rand(0.5, (t.fireEvery || 2)), fireEvery: t.fireEvery, projSpeed: t.projSpeed,
    orbT: rand(0, TAU), chargeCd: rand(1, 2.5), chargeVX: 0, chargeVY: 0, charging: 0,
    flash: 0, wobble: rand(0, TAU),
  });
}

// ---------- Combat ----------
function fire() {
  const w = player.weapon;
  const target = nearestEnemy();
  let baseAng = target ? Math.atan2(target.y - player.y, target.x - player.x) : player.facing;
  player.facing = baseAng;
  const count = w.count + (player.multishot - 1);   // multishot upgrades add extra projectiles
  const shots = [];
  for (let i = 0; i < count; i++) shots.push(baseAng + (i - (count - 1) / 2) * w.spread);
  if (player.sideShot) { shots.push(baseAng + Math.PI / 2); shots.push(baseAng - Math.PI / 2); }
  if (player.backShot) shots.push(baseAng + Math.PI);
  const dmg = player.dmg * w.dmgMult;
  const speed = w.projSpeed;
  const flight = (player.range * w.range) / speed;      // time to cover full range
  // boomerangs fly the whole range out, then need time to curve home
  const life = w.behavior === 'boomerang' ? flight * 2 + 0.5 : flight + 0.1;
  for (const ang of shots) {
    bullets.push({
      x: player.x + Math.cos(ang) * player.r, y: player.y + Math.sin(ang) * player.r,
      vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, speed,
      r: w.r, life, dmg, color: w.color,
      pierce: player.pierce + (w.pierce || 0), ricochet: player.ricochet, hitSet: new Set(),
      behavior: w.behavior, age: 0, turnAt: flight,
    });
  }
  spawnParticles(player.x + Math.cos(baseAng) * player.r, player.y + Math.sin(baseAng) * player.r, w.color, 3);
  SFX.shoot();
}

// push a circle {x,y} of given radius out of a rect obstacle
function pushOutOfRect(c, o, radius) {
  const cx = clamp(c.x, o.x - o.w / 2, o.x + o.w / 2);
  const cy = clamp(c.y, o.y - o.h / 2, o.y + o.h / 2);
  const dx = c.x - cx, dy = c.y - cy, d2 = dx * dx + dy * dy;
  if (d2 >= radius * radius) return false;
  if (d2 === 0) { c.y = o.y - o.h / 2 - radius; return true; }   // dead center: eject upward
  const d = Math.sqrt(d2), push = (radius - d) / d;
  c.x += dx * push; c.y += dy * push;
  return true;
}

function pointInRect(x, y, o) {
  return x > o.x - o.w / 2 && x < o.x + o.w / 2 && y > o.y - o.h / 2 && y < o.y + o.h / 2;
}

function nearestEnemy() {
  let best = null, bd = Infinity;
  for (const e of enemies) { const d = dist2(e, player); if (d < bd) { bd = d; best = e; } }
  return best;
}

function nearestEnemyTo(p) {
  let best = null, bd = Infinity;
  for (const e of enemies) { const d = dist2(e, p); if (d < bd) { bd = d; best = e; } }
  return best;
}

function damageEnemy(e, dmg, isCrit) {
  e.hp -= dmg; e.flash = 0.12;
  floaters.push({ x: e.x, y: e.y - e.r, txt: Math.round(dmg), t: 0.6, crit: isCrit, vy: -40 });
  if (player.lifesteal) heal(dmg * player.lifesteal);
  SFX.hit();
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e) {
  const idx = enemies.indexOf(e); if (idx >= 0) enemies.splice(idx, 1);
  spawnParticles(e.x, e.y, e.color, e.boss ? 40 : 14);
  const gain = e.boss ? 25 : ENEMY_TYPES[e.kind].score;
  if (e.boss) { floaters.push({ x: e.x, y: e.y - 40, txt: e.name + ' DOWN', t: 1.6, crit: true, vy: -12 }); SFX.win(); }
  else SFX.pop();
  coins += gain;
  floaters.push({ x: e.x, y: e.y, txt: '+' + gain, t: 0.8, coin: true, vy: -30 });
  xp += gain;
  if (xp >= xpNext) { xp -= xpNext; level++; xpNext = Math.round(xpNext * 1.5); player.maxHp += 4; player.hp += 4; }
}

function heal(v) { player.hp = clamp(player.hp + v, 0, player.maxHp); }

let shake = 0;
function hurtPlayer(v) {
  if (player.inv > 0) return;
  player.hp -= v; player.inv = 0.6; shake = 0.3;
  spawnParticles(player.x, player.y, '#ff5a7a', 8);
  SFX.hurt();
  if (player.hp <= 0) { player.hp = 0; gameOver(); }
}

function spawnParticles(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    const a = rand(0, TAU), s = rand(40, 190);
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.7), color, r: rand(1.5, 3.5) });
  }
  // a few spinning stars make every pop feel like a win
  if (count >= 10) {
    for (let i = 0; i < 4; i++) {
      const a = rand(0, TAU), s = rand(60, 150);
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.5, 0.9),
        color: '#b5abfc', r: rand(5, 8), star: true, rot: rand(0, TAU), vr: rand(-8, 8) });
    }
  }
}

function drawStar(x, y, r, rot) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + i / 10 * TAU, rr = i % 2 ? r * 0.45 : r;
    ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath(); ctx.fill();
}

// ---------- Update ----------
let last = now();
function update(dt) {
  starPhase += dt;
  if (state !== State.PLAY) return;

  const mv = moveVector();
  if (mv.moving) {
    player.x = clamp(player.x + mv.x * player.speed * dt, PAD + player.r, WORLD.w - PAD - player.r);
    player.y = clamp(player.y + mv.y * player.speed * dt, PAD + player.r, WORLD.h - PAD - player.r);
    player.facing = Math.atan2(mv.y, mv.x);
    player.thrust = Math.min(1, player.thrust + dt * 5);
    player.walkT = (player.walkT || 0) + dt * 13;   // run cycle
  } else {
    player.thrust = Math.max(0, player.thrust - dt * 5);
  }
  for (const o of obstacles) pushOutOfRect(player, o, player.r * 0.8);
  player.inv = Math.max(0, player.inv - dt);

  player.fireCd -= dt;
  if (!mv.moving && enemies.length && player.fireCd <= 0) { fire(); player.fireCd = player.fireRate; }

  if (roomActive && toSpawn.length) {
    spawnTimer += dt;
    while (toSpawn.length && toSpawn[0].at <= spawnTimer) spawnEnemy(toSpawn.shift().k);
  }

  updateBullets(dt); updateEnemies(dt); updateEbullets(dt); updateParticles(dt);

  // room cleared → open a portal; the guardian must fly into it to advance
  if (roomActive && toSpawn.length === 0 && enemies.length === 0) {
    roomActive = false;
    portal = { x: WORLD.w / 2, y: PAD + 34, r: 34, t: 0 };
    floaters.push({ x: WORLD.w / 2, y: 170, txt: 'GATE OPEN — WALK IN', t: 2.0, coin: true, vy: -8 });
    SFX.gate();
  }
  if (portal) {
    portal.t += dt;
    const rr = portal.r + player.r;
    if (dist2(player, portal) <= rr * rr) { portal = null; openUpgrades(); }
  }
  warpFx = Math.max(0, warpFx - dt * 1.6);
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.age += dt;

    // ---- special motion ----
    if (b.behavior === 'homing') {
      const t = nearestEnemyTo(b);
      if (t) {
        const desired = Math.atan2(t.y - b.y, t.x - b.x);
        const cur = Math.atan2(b.vy, b.vx);
        let diff = desired - cur;
        while (diff > Math.PI) diff -= TAU; while (diff < -Math.PI) diff += TAU;
        const turn = clamp(diff, -5 * dt, 5 * dt);   // steer rate (rad/s)
        const a = cur + turn;
        b.vx = Math.cos(a) * b.speed; b.vy = Math.sin(a) * b.speed;
      }
    } else if (b.behavior === 'boomerang') {
      if (b.age > 4) { bullets.splice(i, 1); continue; }   // hard cap: never live forever
      if (b.age >= b.turnAt && !b.returned) { b.returned = true; b.hitSet.clear(); }  // return pass re-hits
      if (b.age >= b.turnAt) {                        // curve back toward the ship
        const a = Math.atan2(player.y - b.y, player.x - b.x);
        const cur = Math.atan2(b.vy, b.vx);
        let diff = a - cur; while (diff > Math.PI) diff -= TAU; while (diff < -Math.PI) diff += TAU;
        const na = cur + clamp(diff, -7 * dt, 7 * dt);
        b.vx = Math.cos(na) * b.speed; b.vy = Math.sin(na) * b.speed;
        b.life = Math.max(b.life, 0.15);              // stay alive until it returns
        if (b.age > b.turnAt + 0.15 && dist2(b, player) < (player.r + b.r) * (player.r + b.r)) { bullets.splice(i, 1); continue; }
      }
    }

    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;

    // crates soak up shots
    let blocked = false;
    for (const o of obstacles) {
      if (o.type === 'crate' && pointInRect(b.x, b.y, o)) { spawnParticles(b.x, b.y, '#c9d6f2', 3); bullets.splice(i, 1); blocked = true; break; }
    }
    if (blocked) continue;

    // wall handling (discs and homing shots pass through; others ricochet or die)
    if (b.behavior === 'straight') {
      let bounced = false;
      if (b.x < PAD || b.x > WORLD.w - PAD) { b.vx *= -1; b.x = clamp(b.x, PAD, WORLD.w - PAD); bounced = true; }
      if (b.y < PAD || b.y > WORLD.h - PAD) { b.vy *= -1; b.y = clamp(b.y, PAD, WORLD.h - PAD); bounced = true; }
      if (bounced) { if (b.ricochet > 0) b.ricochet--; else { bullets.splice(i, 1); continue; } }
    }

    for (const e of enemies) {
      if (b.hitSet.has(e)) continue;
      const rr = b.r + e.r;
      if (dist2(b, e) <= rr * rr) {
        const isCrit = Math.random() < player.crit;
        damageEnemy(e, b.dmg * (isCrit ? player.critMult : 1), isCrit);
        b.hitSet.add(e);
        if (b.pierce > 0) { b.pierce--; }
        else if (b.ricochet > 0) {
          const nxt = enemies.find(o => o !== e && !b.hitSet.has(o));
          if (nxt) { const a = Math.atan2(nxt.y - b.y, nxt.x - b.x); b.vx = Math.cos(a) * b.speed; b.vy = Math.sin(a) * b.speed; b.ricochet--; b.hitSet = new Set([e]); }
          else { bullets.splice(i, 1); }
        } else { bullets.splice(i, 1); }
        break;
      }
    }
    if (b.life <= 0 && bullets[i] === b) bullets.splice(i, 1);
  }
}

function updateEnemies(dt) {
  for (const e of enemies) {
    e.flash = Math.max(0, e.flash - dt); e.wobble += dt * 6;
    const ang = Math.atan2(player.y - e.y, player.x - e.x);
    const d = Math.sqrt(dist2(e, player));
    if (e.ai === 'chase') {
      e.x += Math.cos(ang) * e.speed * dt; e.y += Math.sin(ang) * e.speed * dt;
    } else if (e.ai === 'ranged') {
      const dir = d > 220 ? 1 : -0.6;
      e.x += Math.cos(ang) * e.speed * dt * dir; e.y += Math.sin(ang) * e.speed * dt * dir;
      e.fireCd -= dt; if (e.fireCd <= 0) { enemyShoot(e, ang); e.fireCd = e.fireEvery; }
    } else if (e.ai === 'orbit') {
      e.orbT += dt * 1.5;
      const tx = player.x + Math.cos(e.orbT) * 170, ty = player.y + Math.sin(e.orbT) * 170;
      const oa = Math.atan2(ty - e.y, tx - e.x);
      e.x += Math.cos(oa) * e.speed * dt; e.y += Math.sin(oa) * e.speed * dt;
      e.fireCd -= dt; if (e.fireCd <= 0) { enemyShoot(e, ang); e.fireCd = e.fireEvery; }
    } else if (e.ai === 'charge') {
      if (e.charging > 0) { e.charging -= dt; e.x += e.chargeVX * dt; e.y += e.chargeVY * dt; }
      else {
        e.x += Math.cos(ang) * e.speed * 0.5 * dt; e.y += Math.sin(ang) * e.speed * 0.5 * dt;
        e.chargeCd -= dt;
        if (e.chargeCd <= 0 && d < 320) { e.charging = 0.5; e.chargeVX = Math.cos(ang) * 330; e.chargeVY = Math.sin(ang) * 330; e.chargeCd = rand(2, 3.5); }
      }
    } else if (e.ai === 'boss') {
      if (e.charging > 0) {
        e.charging -= dt; e.x += e.chargeVX * dt; e.y += e.chargeVY * dt;
      } else {
        // hold mid-range from the player
        const want = 230, dir = d > want ? 1 : -0.7;
        e.x += Math.cos(ang) * e.speed * dt * dir; e.y += Math.sin(ang) * e.speed * dt * dir;
      }
      e.attackCd -= dt;
      if (e.attackCd <= 0 && e.charging <= 0) {
        const pattern = ['radial', 'fan', 'summon', 'charge'][e.patternIdx % 4];
        e.patternIdx++;
        if (pattern === 'radial') {
          for (let i = 0; i < 14; i++) { const a = i / 14 * TAU + e.wobble; bossShoot(e, a, 150); }
        } else if (pattern === 'fan') {
          for (let i = -2; i <= 2; i++) bossShoot(e, ang + i * 0.22, 240);
        } else if (pattern === 'summon') {
          const cap = Math.max(0, 8 - enemies.length);
          for (let i = 0; i < Math.min(3, cap); i++) spawnEnemy('voidling');
        } else if (pattern === 'charge') {
          e.charging = 0.6; e.chargeVX = Math.cos(ang) * 340; e.chargeVY = Math.sin(ang) * 340;
        }
        e.attackCd = 2.0;
      }
    }
    e.x = clamp(e.x, PAD + e.r * 0.6, WORLD.w - PAD - e.r * 0.6);
    e.y = clamp(e.y, PAD + e.r * 0.6, WORLD.h - PAD - e.r * 0.6);
    // ground units get stopped by furniture; hovering probes float over pools
    for (const o of obstacles) if (o.type === 'crate' || e.shape !== 'probe') pushOutOfRect(e, o, e.r * 0.7);
    const rr = e.r + player.r;
    if (dist2(e, player) <= rr * rr) hurtPlayer(e.touch);
  }
}

function enemyShoot(e, ang) {
  ebullets.push({ x: e.x, y: e.y, vx: Math.cos(ang) * e.projSpeed, vy: Math.sin(ang) * e.projSpeed, r: 6, life: 4, color: e.color });
}

function bossShoot(e, ang, speed) {
  ebullets.push({ x: e.x + Math.cos(ang) * e.r, y: e.y + Math.sin(ang) * e.r,
    vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, r: 7, life: 6, color: e.color });
}

function updateEbullets(dt) {
  for (let i = ebullets.length - 1; i >= 0; i--) {
    const b = ebullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    let blocked = false;
    for (const o of obstacles) {
      if (o.type === 'crate' && pointInRect(b.x, b.y, o)) { ebullets.splice(i, 1); blocked = true; break; }
    }
    if (blocked) continue;
    const rr = b.r + player.r;
    if (dist2(b, player) <= rr * rr) { hurtPlayer(8); ebullets.splice(i, 1); continue; }
    if (b.life <= 0 || b.x < -20 || b.x > WORLD.w + 20 || b.y < -20 || b.y > WORLD.h + 20) ebullets.splice(i, 1);
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i]; f.y += f.vy * dt; f.vy *= 0.94; f.t -= dt;
    if (f.t <= 0) floaters.splice(i, 1);
  }
}

// ---------- Render helpers (stylized-3D look) ----------
function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function tint(hex, amt) {          // amt > 0 lightens toward white, < 0 darkens
  const [r, g, b] = hexRgb(hex);
  const f = c => Math.round(amt > 0 ? c + (255 - c) * amt : c * (1 + amt));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
// glossy sphere gradient: light from the upper-left, dark rim lower-right
function bodyGrad(r, color) {
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.25);
  g.addColorStop(0, tint(color, 0.55));
  g.addColorStop(0.45, color);
  g.addColorStop(1, tint(color, -0.45));
  return g;
}
function softShadow(x, y, r) {
  ctx.save(); ctx.globalAlpha = 0.28; ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(x, y + r * 0.95, r * 0.85, r * 0.32, 0, 0, TAU); ctx.fill();
  ctx.restore();
}
function glossDot(r) {              // specular highlight
  ctx.save(); ctx.globalAlpha = 0.65; ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.ellipse(-r * 0.35, -r * 0.45, r * 0.22, r * 0.14, -0.6, 0, TAU); ctx.fill();
  ctx.restore();
}

// ---------- Render ----------
function drawRoom() {
  const th = roomTheme();
  // cheerful checkerboard floor
  ctx.fillStyle = th.floorA; ctx.fillRect(0, 0, WORLD.w, WORLD.h);
  ctx.fillStyle = th.floorB;
  const T = 52;
  for (let ty = 0; ty * T < WORLD.h; ty++)
    for (let tx = 0; tx * T < WORLD.w; tx++)
      if ((tx + ty) % 2 === 0) ctx.fillRect(tx * T, ty * T, T, T);
  // soft center light pool (gentle, keeps things bright)
  const pool = ctx.createRadialGradient(WORLD.w / 2, WORLD.h / 2, 80, WORLD.w / 2, WORLD.h / 2, WORLD.h * 0.7);
  pool.addColorStop(0, 'rgba(255,255,255,0.10)'); pool.addColorStop(1, 'rgba(43,58,103,0.16)');
  ctx.fillStyle = pool; ctx.fillRect(0, 0, WORLD.w, WORLD.h);
  // walls (top-lit bevel)
  ctx.fillStyle = th.wall;
  ctx.fillRect(0, 0, WORLD.w, PAD); ctx.fillRect(0, WORLD.h - PAD, WORLD.w, PAD);
  ctx.fillRect(0, 0, PAD, WORLD.h); ctx.fillRect(WORLD.w - PAD, 0, PAD, WORLD.h);
  ctx.fillStyle = tint(th.wall, 0.25);
  ctx.fillRect(0, 0, WORLD.w, 4); ctx.fillRect(0, 0, 4, WORLD.h); ctx.fillRect(WORLD.w - 4, 0, 4, WORLD.h);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, PAD - 4, WORLD.w, 4); ctx.fillRect(PAD - 4, 0, 4, WORLD.h); ctx.fillRect(WORLD.w - PAD, 0, 4, WORLD.h);
  // wall glow strips
  ctx.fillStyle = th.glow; ctx.globalAlpha = 0.5 + 0.2 * Math.sin(starPhase * 2);
  for (const gx of [WORLD.w * 0.2, WORLD.w * 0.8]) { ctx.fillRect(gx - 22, PAD - 9, 44, 4); ctx.fillRect(gx - 22, WORLD.h - PAD + 5, 44, 4); }
  ctx.globalAlpha = 1;

  // gate in the top wall — sealed while fighting, open when the room is clear
  const gw = 84, gx = WORLD.w / 2 - gw / 2;
  ctx.fillStyle = '#0b0e1a'; ctx.fillRect(gx, 0, gw, PAD);
  ctx.fillStyle = tint(th.wall, 0.4);
  ctx.fillRect(gx - 6, 0, 6, PAD + 10); ctx.fillRect(gx + gw, 0, 6, PAD + 10);
  if (portal) {
    // open gate: glowing doorway
    const g = ctx.createLinearGradient(0, 0, 0, PAD + 46);
    g.addColorStop(0, '#c9a5ff'); g.addColorStop(1, 'rgba(90,209,255,0)');
    ctx.fillStyle = g; ctx.fillRect(gx + 4, 0, gw - 8, PAD + 46);
  } else {
    // sealed door with a warning seam
    ctx.fillStyle = tint(th.wall, -0.2); ctx.fillRect(gx + 4, 2, gw - 8, PAD - 4);
    ctx.fillStyle = th.glow; ctx.globalAlpha = 0.6;
    ctx.fillRect(gx + gw / 2 - 1, 2, 2, PAD - 4); ctx.globalAlpha = 1;
  }

  // furniture: pools and crates
  for (const o of obstacles) {
    const x = o.x - o.w / 2, y = o.y - o.h / 2;
    if (o.type === 'pool') {
      // violet energy pool
      ctx.fillStyle = '#9397ab';
      ctx.beginPath(); ctx.roundRect(x - 4, y - 4, o.w + 8, o.h + 8, 14); ctx.fill();
      ctx.fillStyle = '#6f5fc4';
      ctx.beginPath(); ctx.roundRect(x, y, o.w, o.h, 12); ctx.fill();
      ctx.fillStyle = '#5847a8';
      ctx.beginPath(); ctx.roundRect(x + 8, y + 8, o.w - 16, o.h - 16, 8); ctx.fill();
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(starPhase * 2 + o.x);
      ctx.fillStyle = '#b5abfc';
      ctx.beginPath(); ctx.ellipse(o.x - o.w * 0.18, o.y - o.h * 0.15, o.w * 0.16, o.h * 0.1, -0.4, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      const th = roomTheme();
      ctx.save(); ctx.globalAlpha = 0.25; ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.ellipse(o.x, y + o.h + 4, o.w * 0.5, 8, 0, 0, TAU); ctx.fill(); ctx.restore();
      ctx.fillStyle = tint(th.wall, -0.25);
      ctx.beginPath(); ctx.roundRect(x, y, o.w, o.h, 10); ctx.fill();
      ctx.fillStyle = tint(th.wall, 0.15);
      ctx.beginPath(); ctx.roundRect(x, y, o.w, o.h * 0.42, 10); ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = tint(th.wall, -0.5);
      ctx.beginPath(); ctx.roundRect(x, y, o.w, o.h, 10); ctx.stroke();
      ctx.fillStyle = th.glow; ctx.globalAlpha = 0.8;
      ctx.fillRect(o.x - o.w * 0.22, o.y - 2, o.w * 0.44, 4); ctx.globalAlpha = 1;
    }
  }

  // warp flash when arriving in a new room
  if (warpFx > 0.02) { ctx.fillStyle = `rgba(220,240,255,${warpFx * 0.5})`; ctx.fillRect(0, 0, WORLD.w, WORLD.h); }
}

function drawBackground() {
  if (state === State.PLAY || state === State.UPGRADE || state === State.OVER) { drawRoom(); return; }
  ctx.fillStyle = '#05060f'; ctx.fillRect(0, 0, WORLD.w, WORLD.h);
  for (const n of nebulae) {
    const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
    g.addColorStop(0, n.c); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, WORLD.w, WORLD.h);
  }
  for (const s of stars) {
    const y = (s.y + starPhase * 18 * s.z) % WORLD.h;
    const tw = 0.5 + 0.5 * Math.sin(starPhase * 3 + s.tw);
    ctx.globalAlpha = 0.3 + tw * 0.6 * s.z;
    ctx.fillStyle = s.z > 0.75 ? '#dff0ff' : '#8fb4ff';
    if (warpFx > 0.02) {
      // star-streak warp: stars stretch into vertical light trails
      const len = 4 + warpFx * 90 * s.z;
      ctx.fillRect(s.x, y - len, s.z * 2, len);
    } else {
      ctx.fillRect(s.x, y, s.z * 2, s.z * 2);
    }
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(120,150,255,0.18)'; ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, WORLD.w - 3, WORLD.h - 3);
}

function drawMonster(e) {
  softShadow(e.x, e.y, e.r);
  ctx.save(); ctx.translate(e.x, e.y);
  // squash & stretch breathing for a soft, animated feel
  const sq = 1 + 0.06 * Math.sin(e.wobble);
  ctx.scale(sq, 2 - sq);
  const col = e.flash > 0 ? '#ffffff' : bodyGrad(e.r, e.color);
  const ea = Math.atan2(player.y - e.y, player.x - e.x);
  // chunky cartoon outline on every body shape drawn below
  ctx.lineWidth = 3.5; ctx.strokeStyle = tint(e.color, -0.55); ctx.lineJoin = 'round';
  const VIOLET = '#b5abfc';
  if (e.shape === 'drone') {
    // hexagonal scout drone, slow spin, single sensor eye
    ctx.save(); ctx.rotate(e.wobble * 0.25);
    ctx.fillStyle = col; ctx.beginPath();
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * e.r, Math.sin(a) * e.r); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 0.35; ctx.fillStyle = VIOLET;
    ctx.beginPath(); ctx.arc(0, 0, e.r * 0.45, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = VIOLET; ctx.beginPath(); ctx.arc(0, 0, e.r * 0.22 * (1 + 0.15 * Math.sin(e.wobble * 2)), 0, TAU); ctx.fill();
  } else if (e.shape === 'gunner') {
    // round gunner drone with a cannon tracking the ranger
    ctx.save(); ctx.rotate(ea);
    ctx.fillStyle = tint(e.color, -0.35);
    ctx.fillRect(e.r * 0.4, -e.r * 0.16, e.r * 0.95, e.r * 0.32);            // cannon
    ctx.fillStyle = VIOLET; ctx.fillRect(e.r * 1.2, -e.r * 0.1, e.r * 0.18, e.r * 0.2);  // muzzle light
    ctx.restore();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, e.r, 0, TAU); ctx.fill(); ctx.stroke();
    const pr = 1 + 0.15 * Math.sin(e.wobble);
    ctx.globalAlpha = 0.85; ctx.fillStyle = VIOLET;
    ctx.beginPath(); ctx.arc(0, 0, e.r * 0.3 * pr, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
  } else if (e.shape === 'walker') {
    // wedge-shaped ram walker aimed at the ranger
    ctx.save(); ctx.rotate(ea);
    ctx.fillStyle = col; ctx.beginPath();
    ctx.moveTo(e.r * 1.1, 0); ctx.lineTo(-e.r * 0.7, e.r * 0.85);
    ctx.lineTo(-e.r * 0.25, 0); ctx.lineTo(-e.r * 0.7, -e.r * 0.85);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = VIOLET; ctx.fillRect(e.r * 0.25, -e.r * 0.3, e.r * 0.2, e.r * 0.6);   // visor slit
    ctx.restore();
  } else if (e.shape === 'probe') {
    // hovering ring probe with an orbiting light
    ctx.lineWidth = 3.5; ctx.strokeStyle = e.flash > 0 ? '#ffffff' : e.color;
    ctx.beginPath(); ctx.arc(0, 0, e.r, 0, TAU); ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, e.r * 0.42, 0, TAU); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = tint(e.color, -0.55); ctx.stroke();
    const oa = e.wobble * 1.4;
    ctx.fillStyle = VIOLET; ctx.beginPath(); ctx.arc(Math.cos(oa) * e.r, Math.sin(oa) * e.r, 3.5, 0, TAU); ctx.fill();
  } else if (e.shape === 'tank') {
    // slab-armored siege tank oriented at the ranger
    ctx.save(); ctx.rotate(ea);
    ctx.fillStyle = tint(e.color, -0.45);
    ctx.beginPath(); ctx.roundRect(-e.r, -e.r * 0.85, e.r * 2, e.r * 0.3, 5); ctx.fill();   // treads
    ctx.beginPath(); ctx.roundRect(-e.r, e.r * 0.55, e.r * 2, e.r * 0.3, 5); ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.roundRect(-e.r, -e.r * 0.62, e.r * 2, e.r * 1.24, e.r * 0.2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = tint(e.color, 0.15);
    ctx.beginPath(); ctx.roundRect(-e.r * 0.45, -e.r * 0.38, e.r * 1.0, e.r * 0.76, e.r * 0.12); ctx.fill();
    ctx.fillStyle = VIOLET; ctx.fillRect(e.r * 0.62, -e.r * 0.2, e.r * 0.22, e.r * 0.4);   // visor slit
    ctx.restore();
  }
  if (e.flash <= 0) glossDot(e.r);   // subtle machine sheen
  // command antennae for bosses (violet, per palette)
  if (e.boss) {
    ctx.strokeStyle = 'rgba(181,171,252,.9)'; ctx.lineWidth = 3;
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.32;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (e.r + 2), Math.sin(a) * (e.r + 2));
      ctx.lineTo(Math.cos(a) * (e.r + 12 + (i % 2 ? 0 : 5)), Math.sin(a) * (e.r + 12 + (i % 2 ? 0 : 5)));
      ctx.stroke();
    }
  }
  ctx.restore();

  if (e.boss) {
    // big rounded boss bar with an outlined name
    const bw = WORLD.w - 90, bh = 14, bx = 45, by = 92;
    ctx.fillStyle = '#fffdf5';
    ctx.beginPath(); ctx.roundRect(bx - 3, by - 3, bw + 6, bh + 6, 10); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#2b3a67'; ctx.stroke();
    ctx.fillStyle = e.color;
    ctx.beginPath(); ctx.roundRect(bx, by, Math.max(8, bw * clamp(e.hp / e.maxHp, 0, 1)), bh, 8); ctx.fill();
    ctx.textAlign = 'center'; ctx.font = '900 15px "Comic Sans MS","Segoe UI",sans-serif';
    ctx.lineWidth = 4; ctx.strokeStyle = '#2b3a67'; ctx.strokeText(e.name, WORLD.w / 2, by - 10);
    ctx.fillStyle = '#ffffff'; ctx.fillText(e.name, WORLD.w / 2, by - 10);
  } else if (e.hp < e.maxHp) {
    const w = e.r * 2, h = 6;
    ctx.fillStyle = '#fffdf5';
    ctx.beginPath(); ctx.roundRect(e.x - w / 2 - 1, e.y - e.r - 13, w + 2, h + 2, 5); ctx.fill();
    ctx.fillStyle = '#ff4d6d';
    ctx.beginPath(); ctx.roundRect(e.x - w / 2, e.y - e.r - 12, Math.max(3, w * clamp(e.hp / e.maxHp, 0, 1)), h, 4); ctx.fill();
  }
}

// in-game character art: the ranger's gameplay sprite, cached per hero
const spriteCache = {};
function heroSpriteImg() {
  if (!heroDef || !heroDef.sprite) return null;
  let s = spriteCache[heroDef.id];
  if (!s) { s = new Image(); s.crossOrigin = 'anonymous'; s.src = heroDef.sprite; spriteCache[heroDef.id] = s; }
  return (s.complete && s.naturalWidth > 0) ? s : null;
}

function drawShip() {   // draws the ranger (name kept for call sites)
  const r = player.r;
  const run = player.thrust;                        // 0 idle → 1 sprinting
  const step = Math.sin(player.walkT || 0);
  const bob = run * step * 2;                       // body bounce while running
  const facingLeft = Math.cos(player.facing) < 0;

  // real character art when available
  const img = heroSpriteImg();
  if (img) {
    softShadow(player.x, player.y + 4, r);
    ctx.save(); ctx.translate(player.x, player.y + bob * 0.5);
    if (player.inv > 0 && Math.floor(player.inv * 20) % 2 === 0) ctx.globalAlpha = 0.4;
    if (facingLeft) ctx.scale(-1, 1);
    const H = r * 3.4, W = H * (img.naturalWidth / img.naturalHeight);
    ctx.drawImage(img, -W / 2, -H * 0.64, W, H);
    ctx.restore();
    return;
  }

  softShadow(player.x, player.y + 4, r);
  ctx.save(); ctx.translate(player.x, player.y);
  if (player.inv > 0 && Math.floor(player.inv * 20) % 2 === 0) ctx.globalAlpha = 0.4;

  // legs — alternating stubby boots
  ctx.fillStyle = tint(player.color, -0.5);
  const ly = r * 0.62, spread = r * 0.38, kick = run * step * 5;
  ctx.beginPath(); ctx.ellipse(-spread, ly + kick * 0.6, r * 0.26, r * 0.36, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(spread, ly - kick * 0.6, r * 0.26, r * 0.36, 0, 0, TAU); ctx.fill();

  // torso — rounded suit in the hero's color, top-lit
  ctx.save(); ctx.translate(0, bob);
  const torso = ctx.createLinearGradient(-r, -r, r * 0.6, r);
  torso.addColorStop(0, tint(player.color, 0.5));
  torso.addColorStop(0.55, player.color);
  torso.addColorStop(1, tint(player.color, -0.4));
  ctx.fillStyle = torso;
  ctx.beginPath(); ctx.ellipse(0, r * 0.26, r * 0.6, r * 0.5, 0, 0, TAU); ctx.fill();
  ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.strokeStyle = tint(player.color, -0.55); ctx.stroke();
  // chest light
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.beginPath(); ctx.arc(0, r * 0.2, r * 0.11, 0, TAU); ctx.fill();

  // blaster arm — pivots toward the aim direction
  ctx.save(); ctx.rotate(player.facing);
  ctx.fillStyle = tint(player.color, -0.35);
  ctx.beginPath(); ctx.ellipse(r * 0.55, 0, r * 0.42, r * 0.2, 0, 0, TAU); ctx.fill();   // arm
  ctx.fillStyle = '#39415e';
  ctx.fillRect(r * 0.72, -r * 0.16, r * 0.62, r * 0.32);                                  // blaster body
  ctx.fillStyle = '#8fe8ff';
  ctx.fillRect(r * 1.2, -r * 0.09, r * 0.2, r * 0.18);                                    // muzzle glow
  ctx.restore();

  // helmet — oversized chibi head with a wide visor
  const hy = -r * 0.58 + bob * 0.4;
  const helm = ctx.createRadialGradient(-r * 0.3, hy - r * 0.4, 1, 0, hy, r * 0.85);
  helm.addColorStop(0, tint(player.color, 0.65));
  helm.addColorStop(0.6, player.color);
  helm.addColorStop(1, tint(player.color, -0.42));
  ctx.fillStyle = helm;
  ctx.beginPath(); ctx.arc(0, hy, r * 0.78, 0, TAU); ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = tint(player.color, -0.55); ctx.stroke();
  // visor faces the aim direction
  const vx = clamp(Math.cos(player.facing), -1, 1) * r * 0.22;
  const visor = ctx.createLinearGradient(0, hy - r * 0.3, 0, hy + r * 0.35);
  visor.addColorStop(0, '#ffffff'); visor.addColorStop(1, '#7fc4ea');
  ctx.fillStyle = visor;
  ctx.beginPath(); ctx.ellipse(vx, hy + r * 0.05, r * 0.48, r * 0.36, 0, 0, TAU); ctx.fill();
  ctx.lineWidth = 2.5; ctx.strokeStyle = tint(player.color, -0.55); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.beginPath(); ctx.ellipse(vx - r * 0.16, hy - r * 0.08, r * 0.13, r * 0.07, -0.5, 0, TAU); ctx.fill();
  ctx.restore();

  ctx.globalAlpha = 1; ctx.restore();
}

function draw() {
  ctx.setTransform(scale, 0, 0, scale, offX, offY);
  if (shake > 0) { shake = Math.max(0, shake - 0.016); ctx.translate(rand(-1, 1) * shake * 12, rand(-1, 1) * shake * 12); }
  drawBackground();
  if (state === State.START || state === State.HEROES) return;

  // portal to the next room
  if (portal) {
    const pu = 1 + 0.08 * Math.sin(portal.t * 5);
    ctx.save(); ctx.translate(portal.x, portal.y);
    const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, portal.r * 2.4);
    glow.addColorStop(0, 'rgba(169,123,255,.8)'); glow.addColorStop(0.5, 'rgba(90,209,255,.28)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, portal.r * 2.4, 0, TAU); ctx.fill();
    ctx.rotate(portal.t * 2.4);
    ctx.strokeStyle = '#c9a5ff'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(0, 0, portal.r * pu, 0.4, Math.PI - 0.4); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, portal.r * pu, Math.PI + 0.4, TAU - 0.4); ctx.stroke();
    ctx.rotate(-portal.t * 4.1);
    ctx.strokeStyle = '#8fe8ff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, portal.r * 0.62 * pu, 0.9, Math.PI - 0.2); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, portal.r * 0.62 * pu, Math.PI + 0.9, TAU - 0.2); ctx.stroke();
    ctx.restore();
  }

  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life * 2, 0, 1); ctx.fillStyle = p.color;
    if (p.star) { p.rot += 0.1; drawStar(p.x, p.y, p.r, p.rot); }
    else { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
  for (const b of ebullets) { ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill(); ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 3, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
  for (const e of enemies) drawMonster(e);
  for (const b of bullets) {
    const col = b.color || '#bfefff';
    if (b.behavior === 'boomerang') {                 // spinning blade
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.age * 22);
      ctx.strokeStyle = col; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, b.r, 0.3, Math.PI - 0.3); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, b.r, Math.PI + 0.3, TAU - 0.3); ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = 0.2; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 2, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    } else {
      // glossy energy orb: bright core, colored shell, soft glow
      ctx.globalAlpha = 0.25; ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 3, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
      const og = ctx.createRadialGradient(b.x - b.r * 0.3, b.y - b.r * 0.3, 0.5, b.x, b.y, b.r);
      og.addColorStop(0, '#ffffff'); og.addColorStop(1, col);
      ctx.fillStyle = og; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
    }
  }
  drawShip();
  // on-screen joystick while dragging
  if (drag.active && state === State.PLAY) {
    const rect = canvas.getBoundingClientRect();
    const bx = (drag.sx - rect.left) / scale, by = (drag.sy - rect.top) / scale;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 5; ctx.strokeStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(bx, by, 46, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 0.55; ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(bx + drag.dx / scale * 0.66, by + drag.dy / scale * 0.66, 24, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.9; ctx.lineWidth = 3; ctx.strokeStyle = '#2b3a67';
    ctx.beginPath(); ctx.arc(bx + drag.dx / scale * 0.66, by + drag.dy / scale * 0.66, 24, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.textAlign = 'center';
  for (const f of floaters) {
    ctx.globalAlpha = clamp(f.t * 1.5, 0, 1);
    const size = f.crit ? 24 : 17;
    ctx.font = '900 ' + size + 'px "Comic Sans MS","Segoe UI",sans-serif';
    ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.strokeStyle = '#2b3a67';
    ctx.strokeText(f.txt, f.x, f.y);
    ctx.fillStyle = f.coin ? '#b5abfc' : f.crit ? '#e0719b' : '#ffffff';
    ctx.fillText(f.txt, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

// ---------- HUD ----------
const el = id => document.getElementById(id);
function updateHUD() {
  el('hpbar').style.width = clamp(player.hp / player.maxHp * 100, 0, 100) + '%';
  el('coins').textContent = coins; el('room').textContent = room; el('level').textContent = level;
  el('xpbar').style.width = clamp(xp / xpNext * 100, 0, 100) + '%';
  const wp = el('weapon'); if (wp) wp.textContent = player.weapon.ico + ' ' + player.weapon.name;
}

// ---------- Screens ----------
const SCREENS = ['start', 'heroes', 'upgrade', 'over', 'pause'];
function show(id) { SCREENS.forEach(s => el(s).classList.toggle('hidden', s !== id)); }
function hideAllOverlays() { SCREENS.forEach(s => el(s).classList.add('hidden')); }

function updateBestLine() {
  const b = el('bestline');
  if (bestRoom >= 2) { b.textContent = '🏆 Best: Room ' + bestRoom; b.classList.remove('hidden'); }
  else b.classList.add('hidden');
}

// ---------- Pause ----------
function pauseGame() {
  if (state !== State.PLAY) return;
  state = State.PAUSE;
  el('sndBtn').textContent = SFX.on ? '🔊 SOUND: ON' : '🔇 SOUND: OFF';
  show('pause');
}
function resumeGame() {
  if (state !== State.PAUSE) return;
  hideAllOverlays();
  last = now();          // don't advance the sim for the time spent paused
  state = State.PLAY;
}
function quitToMenu() {
  hideAllOverlays();
  el('hud').classList.add('hidden'); el('joyhint').classList.add('hidden');
  state = State.START;
  updateBestLine();
  show('start');
}

function openHeroes() {
  state = State.HEROES;
  const wrap = el('roster'); wrap.innerHTML = '';
  for (const h of HEROES) {
    const c = document.createElement('div');
    c.className = 'hero';
    c.style.setProperty('--hc', h.color);
    const portrait = h.art
      ? `<img class="art" src="${h.art}" alt="${h.name}" loading="lazy"
           onerror="this.parentNode.innerHTML='&lt;div class=&quot;av&quot;&gt;${h.ico}&lt;/div&gt;'">`
      : `<div class="av">${h.ico}</div>`;
    c.innerHTML = `<div class="portrait" style="background:${h.color}18;border-color:${h.color}55">${portrait}</div>
      <div class="hn" style="color:${h.color}">${h.name}</div>
      <div class="hr">${h.role}</div><div class="hp">${h.perk}</div>`;
    c.onclick = () => { SFX.click(); startGame(h); };
    wrap.appendChild(c);
  }
  show('heroes');
}

function startGame(h) {
  portal = null; warpFx = 0;
  heroDef = h; initPlayerFromHero(h);
  bullets = []; ebullets = []; enemies = []; particles = []; floaters = [];
  coins = 0; room = 1; level = 1; xp = 0; xpNext = 3;
  hideAllOverlays();
  el('hud').classList.remove('hidden'); el('joyhint').classList.remove('hidden');
  state = State.PLAY; buildRoom(room);
}

function weaponOffer() {
  // offer a random weapon the player isn't currently wielding
  const ids = Object.keys(WEAPONS).filter(id => WEAPONS[id] !== player.weapon);
  const id = ids[Math.floor(Math.random() * ids.length)];
  const w = WEAPONS[id];
  return { ico: w.ico, name: w.name, rar: 'weapon', desc: w.desc, isWeapon: true,
    apply: p => { p.weapon = w; } };
}

function openUpgrades() {
  if (state !== State.PLAY) return;   // guard: player died or restarted during the delay
  state = State.UPGRADE;
  const picks = pickUpgrades(3);
  // from sector 2 on, a new weapon sometimes shows up in place of one card;
  // clearing a boss sector guarantees one
  if (room % 5 === 0 || (room >= 2 && Math.random() < 0.4)) picks[Math.floor(Math.random() * picks.length)] = weaponOffer();
  const wrap = el('cards'); wrap.innerHTML = '';
  for (const u of picks) {
    const c = document.createElement('div');
    c.className = 'card' + (u.isWeapon ? ' weapon-card' : '');
    c.innerHTML = `<div class="name">${u.name}</div><div class="ico">${u.ico}</div>
      <div class="desc">${u.desc}</div><div class="rar" style="color:${RAR_COLOR[u.rar]}">${u.isWeapon ? 'new weapon' : u.rar}</div>`;
    c.onclick = () => { SFX.pick(); u.apply(player); heal(player.maxHp * 0.15); nextRoom(); };
    wrap.appendChild(c);
  }
  show('upgrade');
}

function nextRoom() {
  hideAllOverlays(); room++; state = State.PLAY;
  player.x = WORLD.w / 2; player.y = WORLD.h - 140;
  warpFx = 1;                        // star-streak fly-in to the new room
  buildRoom(room);
}

function gameOver() {
  portal = null;
  state = State.OVER;
  SFX.die();
  const isBest = room > bestRoom;
  if (isBest) { bestRoom = room; store.set('best', bestRoom); }
  el('overStats').innerHTML =
    (isBest && room >= 2 ? `<b style="color:#f5a623">🌟 NEW BEST! 🌟</b><br>` : '') +
    `<b>${heroDef.name}</b> made it to <b>Room ${room}</b> · Level ${level}<br>Collected <b>${coins}</b> gems! ` +
    (bestRoom >= 2 ? `<br>🏆 Best ever: Room ${bestRoom}` : '');
  el('hud').classList.add('hidden'); el('joyhint').classList.add('hidden');
  show('over');
}

el('startBtn').onclick = () => { SFX.click(); openHeroes(); };
el('againBtn').onclick = () => { SFX.click(); openHeroes(); };
el('pauseBtn').onclick = () => { SFX.click(); pauseGame(); };
el('resumeBtn').onclick = () => { SFX.click(); resumeGame(); };
el('quitBtn').onclick = () => { SFX.click(); quitToMenu(); };
el('sndBtn').onclick = () => {
  const on = SFX.toggle(); SFX.click();
  el('sndBtn').textContent = on ? '🔊 SOUND: ON' : '🔇 SOUND: OFF';
};
window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === 'escape' || k === 'p') {
    if (state === State.PLAY) pauseGame();
    else if (state === State.PAUSE) resumeGame();
  }
});

// ---------- Main loop ----------
function loop() {
  const t = now(); let dt = (t - last) / 1000; last = t; dt = Math.min(dt, 0.05);
  update(dt); draw();
  if (state === State.PLAY) updateHUD();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ---------- Intro / loading sequence ----------
(function bootLoader() {
  const TIPS = [
    'TIP: STAND STILL TO FIRE',
    'TIP: CLEAR THE ROOM, THEN TAKE THE GATE',
    'TIP: EVERY RANGER CARRIES A SIGNATURE WEAPON',
    'TIP: BOSSES ALWAYS DROP A NEW WEAPON',
    'TIP: FIELD UPGRADES PATCH YOUR ARMOR',
    'TIP: CRATES BLOCK ENEMY FIRE — USE COVER',
  ];
  const boot = el('boot'), fill = el('loadfill'), pct = el('loadpct'), tip = el('boottip');
  // phase 1: studio splash card, then fade through to the game loading screen
  const splash = el('splash');
  setTimeout(() => { splash.classList.add('fadeout'); setTimeout(() => splash.remove(), 500); }, 2300);
  const assets = HEROES.flatMap(h => [h.art, h.sprite]).filter(Boolean);
  const MIN_MS = 4200, MAX_MS = 8000;      // covers splash + load phases; never hangs offline
  const t0 = performance.now();
  let loaded = 0, tipIdx = 0, done = false;

  const tipTimer = setInterval(() => {
    tipIdx = (tipIdx + 1) % TIPS.length;
    tip.textContent = TIPS[tipIdx];
  }, 1400);

  for (const src of assets) {
    const img = new Image();
    img.onload = img.onerror = () => { loaded++; };   // offline still finishes the bar
    img.src = src;
  }

  function finish() {
    if (done) return; done = true;
    clearInterval(tipTimer);
    updateBestLine();
    boot.classList.add('fadeout');
    el('start').classList.remove('hidden');
    setTimeout(() => boot.remove(), 600);
  }

  (function tick() {
    const elapsed = performance.now() - t0;
    const assetProg = assets.length ? loaded / assets.length : 1;
    const timeProg = Math.min(1, elapsed / MIN_MS);
    const prog = Math.min(assetProg, 1) * 0.6 + timeProg * 0.4;   // blend real + paced progress
    const shown = Math.min(1, elapsed >= MAX_MS ? 1 : prog);
    fill.style.width = Math.round(shown * 100) + '%';
    pct.textContent = Math.round(shown * 100) + '%';
    if ((assetProg >= 1 && elapsed >= MIN_MS) || elapsed >= MAX_MS) { fill.style.width = '100%'; pct.textContent = '100%'; setTimeout(finish, 250); return; }
    requestAnimationFrame(tick);
  })();
})();

// ---------- Debug / automation hook (harmless in production) ----------
window.NOVA_DEBUG = {
  snapshot: () => ({
    state, room, level, coins,
    hp: player.hp, maxHp: player.maxHp,
    enemies: enemies.length, boss: enemies.some(e => e.boss),
    bullets: bullets.length, ebullets: ebullets.length,
    weapon: player.weapon ? player.weapon.name : null,
    portal: !!portal, px: player.x, py: player.y,
  }),
  warpTo: n => { if (state !== State.PLAY) return false; portal = null; enemies = []; ebullets = []; toSpawn = []; room = n; buildRoom(n); return true; },
  setWeapon: id => { if (WEAPONS[id]) { player.weapon = WEAPONS[id]; return true; } return false; },
  buff: (dmg, hp) => { player.dmg = dmg; player.maxHp = hp; player.hp = hp; },
  weapons: Object.keys(WEAPONS),
};

})();
