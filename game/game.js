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
const State = { START: 0, HEROES: 1, PLAY: 2, UPGRADE: 3, OVER: 4 };
let state = State.START;

// ---------- Guardian roster (original heroes) ----------
// Portrait art (generated). Falls back to the emoji icon if a URL fails to load.
const ART = 'https://d8j0ntlcm91z4.cloudfront.net/user_3F047Iq9Ue5VPXNvJsfVjZtSn7t/';
const HEROES = [
  { id:'vex',  ico:'🛰️', name:'Vex Corran',  role:'Ace Pilot',  color:'#5ad1ff', perk:'Fast guns, quick fire rate',
    art: ART + 'hf_20260715_055144_9ff907b8-a2ec-4979-abfe-035bfff52b5e.png',
    base:{ fireRate:0.50, dmg:9,  maxHp:90,  speed:230, weapon:'pulse' } },
  { id:'kaela',ico:'🛡️', name:'Kaela Vorn',  role:'Warbreaker', color:'#ff5a7a', perk:'Rail Lance — slow, armor-piercing cannon',
    art: ART + 'hf_20260715_055149_d5456b00-5f84-4a0a-907e-0da1b71b9ef2.png',
    base:{ fireRate:0.72, dmg:14, maxHp:140, speed:190, weapon:'rail' } },
  { id:'thorn',ico:'🌿', name:'Thornroot',   role:'Wildkin',    color:'#4ad682', perk:'Spore Burst — homing spores + lifesteal',
    art: ART + 'hf_20260715_055153_58a1ad55-ad2f-48b7-afce-806de6102595.png',
    base:{ fireRate:0.62, dmg:10, maxHp:110, speed:205, lifesteal:0.05, weapon:'spore' } },
  { id:'rax',  ico:'🤖', name:'Rax-9',       role:'Gun Drone',  color:'#ffa24a', perk:'Scatter Coil — twin spread cannons',
    art: ART + 'hf_20260715_055157_26ffa1aa-4873-4b6b-9f18-fff84ea435fc.png',
    base:{ fireRate:0.66, dmg:9,  maxHp:100, speed:205, weapon:'scatter' } },
];

// ---------- Weapons (original) ----------
// fireRate = multiplier on the hero's base interval (lower = faster).
// dmgMult scales per-projectile damage; count is base projectiles per shot;
// behaviour drives special motion. All stack with the upgrade pool.
const WEAPONS = {
  pulse:   { name:'Pulse Blaster', ico:'🔫', fireRate:1.00, dmgMult:1.0, projSpeed:480, count:1, spread:0.16, r:5, range:1.0,  color:'#bfefff', behavior:'straight',  desc:'Fast, accurate energy bolts' },
  rail:    { name:'Rail Lance',    ico:'🔩', fireRate:1.55, dmgMult:2.3, projSpeed:640, count:1, spread:0.04, r:7, range:1.2,  color:'#8fdcff', behavior:'straight', pierce:3, desc:'Slow, heavy shots that punch through' },
  scatter: { name:'Scatter Coil',  ico:'💠', fireRate:0.80, dmgMult:0.70,projSpeed:430, count:5, spread:0.30, r:4, range:0.85, color:'#ffd15a', behavior:'straight',  desc:'A short-range blast of pellets' },
  spore:   { name:'Spore Burst',   ico:'🌱', fireRate:1.10, dmgMult:0.8, projSpeed:300, count:3, spread:0.30, r:6, range:1.4,  color:'#7bffb0', behavior:'homing',   desc:'Living spores that seek prey' },
  nova:    { name:'Nova Orb',      ico:'🌀', fireRate:1.35, dmgMult:1.5, projSpeed:250, count:1, spread:0.0,  r:9, range:1.6,  color:'#c07bff', behavior:'homing', pierce:1, desc:'A slow orb that hunts down foes' },
  disc:    { name:'Saw Disc',      ico:'🪀', fireRate:0.95, dmgMult:1.0, projSpeed:420, count:2, spread:0.55, r:8, range:1.0,  color:'#5ad1ff', behavior:'boomerang', pierce:99, desc:'Twin blades that fly out and return' },
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

// ---------- Room theming (station chambers, palette shifts as you go deeper) ----------
const PAD = 24;                     // wall thickness — playfield is inset by this
const ROOM_THEMES = [
  { floorA:'#aee1ff', floorB:'#9cd6fa', wall:'#4a90d9', glow:'#ffd93d' },   // sky deck
  { floorA:'#e6d2ff', floorB:'#dbc3fb', wall:'#9a6fe0', glow:'#ffd93d' },   // candy vault
  { floorA:'#c2f2d4', floorB:'#b0eac5', wall:'#4fb877', glow:'#ffd93d' },   // mint hold
  { floorA:'#ffe3c4', floorB:'#ffd8ad', wall:'#f2954a', glow:'#fff6a8' },   // peach bay
];
const roomTheme = () => ROOM_THEMES[Math.floor((room - 1) / 3) % ROOM_THEMES.length];

// ---------- Space-monster archetypes (original) ----------
const ENEMY_TYPES = {
  voidling: { r:13, hp:22, speed:60,  color:'#b06bff', touch:12, score:1, ai:'chase',  shape:'spiky' },
  glowspit: { r:15, hp:32, speed:32,  color:'#c97bff', touch:10, score:2, ai:'ranged', shape:'pulse', fireEvery:1.8, projSpeed:210 },
  ramhorn:  { r:17, hp:46, speed:42,  color:'#ff8a3a', touch:18, score:2, ai:'charge', shape:'horned' },
  starwisp: { r:12, hp:26, speed:95,  color:'#4ad6c0', touch:10, score:2, ai:'orbit',  shape:'wisp', fireEvery:2.4, projSpeed:180 },
  devourer: { r:26, hp:150, speed:34, color:'#ff4d5e', touch:26, score:5, ai:'chase',  shape:'maw' },
};

// ---------- Bosses (every 5th sector) ----------
const BOSS_TYPES = [
  { name:'RIFTMAW SOVEREIGN', color:'#ff4d5e', shape:'maw',    r:36 },
  { name:'VOID TYRANT',       color:'#b06bff', shape:'spiky',  r:34 },
  { name:'STAR DEVOURER',     color:'#4ad6c0', shape:'horned', r:36 },
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
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e) {
  const idx = enemies.indexOf(e); if (idx >= 0) enemies.splice(idx, 1);
  spawnParticles(e.x, e.y, e.color, e.boss ? 40 : 14);
  const gain = e.boss ? 25 : ENEMY_TYPES[e.kind].score;
  if (e.boss) floaters.push({ x: e.x, y: e.y - 40, txt: e.name + ' DOWN', t: 1.6, crit: true, vy: -12 });
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
        color: '#ffd93d', r: rand(5, 8), star: true, rot: rand(0, TAU), vr: rand(-8, 8) });
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
  if (e.shape === 'spiky') {
    ctx.fillStyle = col; ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU, rr = e.r * (i % 2 ? 0.7 : 1.15) * (1 + 0.05 * Math.sin(e.wobble + i)); ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (e.shape === 'pulse') {
    const pr = e.r * (1 + 0.12 * Math.sin(e.wobble));
    ctx.globalAlpha = 0.35; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, pr + 5, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(0, 0, pr, 0, TAU); ctx.fill(); ctx.stroke();
  } else if (e.shape === 'horned') {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(Math.cos(ea) * e.r, Math.sin(ea) * e.r);
    ctx.lineTo(Math.cos(ea - 0.4) * e.r * 1.7, Math.sin(ea - 0.4) * e.r * 1.7);
    ctx.lineTo(Math.cos(ea - 0.15) * e.r, Math.sin(ea - 0.15) * e.r); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(Math.cos(ea) * e.r, Math.sin(ea) * e.r);
    ctx.lineTo(Math.cos(ea + 0.4) * e.r * 1.7, Math.sin(ea + 0.4) * e.r * 1.7);
    ctx.lineTo(Math.cos(ea + 0.15) * e.r, Math.sin(ea + 0.15) * e.r); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, e.r, 0, TAU); ctx.fill(); ctx.stroke();
  } else if (e.shape === 'wisp') {
    ctx.globalAlpha = 0.3; ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(-Math.cos(ea) * e.r, -Math.sin(ea) * e.r, e.r * 0.8, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(0, 0, e.r, 0, TAU); ctx.fill(); ctx.stroke();
  } else if (e.shape === 'maw') {
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, e.r, 0, TAU); ctx.fill(); ctx.stroke();
    const gape = 0.5 + 0.25 * Math.sin(e.wobble * 0.5);
    ctx.fillStyle = '#5a2340'; ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.arc(0, 0, e.r * 0.9, ea - gape, ea + gape); ctx.closePath(); ctx.fill();
  }
  if (e.flash <= 0) glossDot(e.r);   // specular highlight for the 3D look
  // crown for bosses
  if (e.boss) {
    ctx.strokeStyle = 'rgba(255,209,90,.9)'; ctx.lineWidth = 3;
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.32;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (e.r + 2), Math.sin(a) * (e.r + 2));
      ctx.lineTo(Math.cos(a) * (e.r + 12 + (i % 2 ? 0 : 5)), Math.sin(a) * (e.r + 12 + (i % 2 ? 0 : 5)));
      ctx.stroke();
    }
  }
  // big cute cartoon eyes looking at the hero
  if (e.shape !== 'maw') {
    for (const side of [-1, 1]) {
      const ax = Math.cos(ea + side * 0.55) * e.r * 0.42, ay = Math.sin(ea + side * 0.55) * e.r * 0.42;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(ax, ay, e.r * 0.3, 0, TAU); ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = tint(e.color, -0.55); ctx.stroke();
      ctx.fillStyle = '#2b3a67';
      ctx.beginPath(); ctx.arc(ax + Math.cos(ea) * e.r * 0.1, ay + Math.sin(ea) * e.r * 0.1, e.r * 0.14, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(ax + Math.cos(ea) * e.r * 0.06 - e.r * 0.04, ay + Math.sin(ea) * e.r * 0.06 - e.r * 0.05, e.r * 0.05, 0, TAU); ctx.fill();
    }
    // little open mouth
    ctx.fillStyle = tint(e.color, -0.6);
    ctx.beginPath(); ctx.ellipse(Math.cos(ea) * e.r * 0.62, Math.sin(ea) * e.r * 0.62, e.r * 0.13, e.r * 0.1, ea, 0, TAU); ctx.fill();
  } else {
    // the maw keeps its big goofy eyes above the mouth
    for (const side of [-1, 1]) {
      const ax = Math.cos(ea + side * 0.9) * e.r * 0.55, ay = Math.sin(ea + side * 0.9) * e.r * 0.55;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(ax, ay, e.r * 0.22, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2b3a67';
      ctx.beginPath(); ctx.arc(ax + Math.cos(ea) * e.r * 0.07, ay + Math.sin(ea) * e.r * 0.07, e.r * 0.1, 0, TAU); ctx.fill();
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

function drawShip() {   // draws the guardian on foot (name kept for call sites)
  const r = player.r;
  softShadow(player.x, player.y + 4, r);
  ctx.save(); ctx.translate(player.x, player.y);
  if (player.inv > 0 && Math.floor(player.inv * 20) % 2 === 0) ctx.globalAlpha = 0.4;

  const run = player.thrust;                        // 0 idle → 1 sprinting
  const step = Math.sin(player.walkT || 0);
  const bob = run * step * 2;                       // body bounce while running
  const facingLeft = Math.cos(player.facing) < 0;

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
  ctx.beginPath(); ctx.ellipse(0, r * 0.12, r * 0.72, r * 0.62, 0, 0, TAU); ctx.fill();
  ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.strokeStyle = tint(player.color, -0.55); ctx.stroke();
  // chest light
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.beginPath(); ctx.arc(0, r * 0.08, r * 0.13, 0, TAU); ctx.fill();

  // blaster arm — pivots toward the aim direction
  ctx.save(); ctx.rotate(player.facing);
  ctx.fillStyle = tint(player.color, -0.35);
  ctx.beginPath(); ctx.ellipse(r * 0.55, 0, r * 0.42, r * 0.2, 0, 0, TAU); ctx.fill();   // arm
  ctx.fillStyle = '#39415e';
  ctx.fillRect(r * 0.72, -r * 0.16, r * 0.62, r * 0.32);                                  // blaster body
  ctx.fillStyle = '#8fe8ff';
  ctx.fillRect(r * 1.2, -r * 0.09, r * 0.2, r * 0.18);                                    // muzzle glow
  ctx.restore();

  // helmet — glossy sphere with a wide visor
  const hy = -r * 0.62 + bob * 0.4;
  const helm = ctx.createRadialGradient(-r * 0.25, hy - r * 0.3, 1, 0, hy, r * 0.62);
  helm.addColorStop(0, tint(player.color, 0.65));
  helm.addColorStop(0.6, player.color);
  helm.addColorStop(1, tint(player.color, -0.42));
  ctx.fillStyle = helm;
  ctx.beginPath(); ctx.arc(0, hy, r * 0.56, 0, TAU); ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = tint(player.color, -0.55); ctx.stroke();
  // visor faces the aim direction
  const vx = clamp(Math.cos(player.facing), -1, 1) * r * 0.18;
  const visor = ctx.createLinearGradient(0, hy - r * 0.2, 0, hy + r * 0.25);
  visor.addColorStop(0, '#ffffff'); visor.addColorStop(1, '#7fc4ea');
  ctx.fillStyle = visor;
  ctx.beginPath(); ctx.ellipse(vx, hy + r * 0.03, r * 0.34, r * 0.24, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.8)';
  ctx.beginPath(); ctx.ellipse(vx - r * 0.12, hy - r * 0.05, r * 0.09, r * 0.05, -0.5, 0, TAU); ctx.fill();
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
  ctx.textAlign = 'center';
  for (const f of floaters) {
    ctx.globalAlpha = clamp(f.t * 1.5, 0, 1);
    const size = f.crit ? 24 : 17;
    ctx.font = '900 ' + size + 'px "Comic Sans MS","Segoe UI",sans-serif';
    ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.strokeStyle = '#2b3a67';
    ctx.strokeText(f.txt, f.x, f.y);
    ctx.fillStyle = f.coin ? '#ffd93d' : f.crit ? '#ff5a7a' : '#ffffff';
    ctx.fillText(f.txt, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

// ---------- HUD ----------
const el = id => document.getElementById(id);
function updateHUD() {
  el('hpbar').style.width = clamp(player.hp / player.maxHp * 100, 0, 100) + '%';
  el('coins').textContent = coins; el('room').textContent = room; el('level').textContent = level;
  const wp = el('weapon'); if (wp) wp.textContent = player.weapon.ico + ' ' + player.weapon.name;
}

// ---------- Screens ----------
function show(id) { ['start', 'heroes', 'upgrade', 'over'].forEach(s => el(s).classList.toggle('hidden', s !== id)); }
function hideAllOverlays() { ['start', 'heroes', 'upgrade', 'over'].forEach(s => el(s).classList.add('hidden')); }

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
    c.onclick = () => startGame(h);
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
    c.innerHTML = `<div class="ico">${u.ico}</div><div class="name">${u.name}</div>
      <div class="desc">${u.desc}</div><div class="rar" style="color:${RAR_COLOR[u.rar]}">${u.isWeapon ? 'new weapon' : u.rar}</div>`;
    c.onclick = () => { u.apply(player); heal(player.maxHp * 0.15); nextRoom(); };
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
  el('overStats').innerHTML =
    `<b>${heroDef.name}</b> reached <b>Sector ${room}</b> · Rank ${level}<br>Salvaged <b>${coins}</b> crystals from the drift.`;
  el('hud').classList.add('hidden'); el('joyhint').classList.add('hidden');
  show('over');
}

el('startBtn').onclick = openHeroes;
el('againBtn').onclick = openHeroes;

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
    'Tip: stand still to shoot!',
    'Tip: walk through the gate when the room is clear!',
    'Tip: every hero has their own super weapon!',
    'Tip: bosses drop shiny new weapons!',
    'Tip: picking a power heals you a little!',
    'Tip: watch out for the charging Ramhorn!',
  ];
  const boot = el('boot'), fill = el('loadfill'), pct = el('loadpct'), tip = el('boottip');
  const assets = HEROES.map(h => h.art).filter(Boolean);
  const MIN_MS = 2600, MAX_MS = 6000;      // always show the intro; never hang on slow networks
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
