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
const HEROES = [
  { id:'vex',  ico:'🛰️', name:'Vex Corran',  role:'Ace Pilot',  color:'#5ad1ff', perk:'Fast guns, quick fire rate',
    base:{ fireRate:0.50, dmg:9,  maxHp:90,  speed:230 } },
  { id:'kaela',ico:'🛡️', name:'Kaela Vorn',  role:'Warbreaker', color:'#ff5a7a', perk:'Heavy hull, hits like a truck',
    base:{ fireRate:0.72, dmg:14, maxHp:140, speed:190 } },
  { id:'thorn',ico:'🌿', name:'Thornroot',   role:'Wildkin',    color:'#4ad682', perk:'Siphons life from every hit',
    base:{ fireRate:0.62, dmg:10, maxHp:110, speed:205, lifesteal:0.05 } },
  { id:'rax',  ico:'🤖', name:'Rax-9',       role:'Gun Drone',  color:'#ffa24a', perk:'Twin cannons — fires 2 shots',
    base:{ fireRate:0.66, dmg:9,  maxHp:100, speed:205, multishot:2 } },
];
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
  });
}

let bullets = [], ebullets = [], enemies = [], particles = [], floaters = [];
let coins = 0, room = 1, level = 1, xp = 0, xpNext = 3;
let roomTarget = 0, roomActive = false, spawnTimer = 0, toSpawn = [];

// ---------- Space-monster archetypes (original) ----------
const ENEMY_TYPES = {
  voidling: { r:13, hp:22, speed:60,  color:'#b06bff', touch:12, score:1, ai:'chase',  shape:'spiky' },
  glowspit: { r:15, hp:32, speed:32,  color:'#c97bff', touch:10, score:2, ai:'ranged', shape:'pulse', fireEvery:1.8, projSpeed:210 },
  ramhorn:  { r:17, hp:46, speed:42,  color:'#ff8a3a', touch:18, score:2, ai:'charge', shape:'horned' },
  starwisp: { r:12, hp:26, speed:95,  color:'#4ad6c0', touch:10, score:2, ai:'orbit',  shape:'wisp', fireEvery:2.4, projSpeed:180 },
  devourer: { r:26, hp:150, speed:34, color:'#ff4d5e', touch:26, score:5, ai:'chase',  shape:'maw' },
};

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
const RAR_COLOR = { common:'#9fb2cf', rare:'#5ad1ff', epic:'#c07bff' };

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
  const budget = 3 + n * 1.7;
  let spent = 0;
  while (spent < budget) {
    let choices = ['voidling'];
    if (n >= 2) choices.push('glowspit');
    if (n >= 3) choices.push('ramhorn', 'starwisp');
    if (n >= 5 && Math.random() < 0.28) choices.push('devourer');
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
  const target = nearestEnemy();
  let baseAng = target ? Math.atan2(target.y - player.y, target.x - player.x) : player.facing;
  player.facing = baseAng;
  const shots = [];
  const n = player.multishot;
  for (let i = 0; i < n; i++) shots.push(baseAng + (i - (n - 1) / 2) * player.spread);
  if (player.sideShot) { shots.push(baseAng + Math.PI / 2); shots.push(baseAng - Math.PI / 2); }
  if (player.backShot) shots.push(baseAng + Math.PI);
  for (const ang of shots) {
    bullets.push({
      x: player.x + Math.cos(ang) * player.r, y: player.y + Math.sin(ang) * player.r,
      vx: Math.cos(ang) * player.projSpeed, vy: Math.sin(ang) * player.projSpeed,
      r: 5, life: player.range / player.projSpeed + 0.1,
      pierce: player.pierce, ricochet: player.ricochet, hitSet: new Set(),
    });
  }
  spawnParticles(player.x + Math.cos(baseAng) * player.r, player.y + Math.sin(baseAng) * player.r, player.color, 3);
}

function nearestEnemy() {
  let best = null, bd = Infinity;
  for (const e of enemies) { const d = dist2(e, player); if (d < bd) { bd = d; best = e; } }
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
  spawnParticles(e.x, e.y, e.color, 14);
  const gain = ENEMY_TYPES[e.kind].score;
  coins += gain;
  floaters.push({ x: e.x, y: e.y, txt: '+' + gain, t: 0.8, coin: true, vy: -30 });
  xp += gain;
  if (xp >= xpNext) { xp -= xpNext; level++; xpNext = Math.round(xpNext * 1.5); player.maxHp += 4; player.hp += 4; }
}

function heal(v) { player.hp = clamp(player.hp + v, 0, player.maxHp); }

function hurtPlayer(v) {
  if (player.inv > 0) return;
  player.hp -= v; player.inv = 0.6;
  spawnParticles(player.x, player.y, '#ff5a7a', 8);
  if (player.hp <= 0) { player.hp = 0; gameOver(); }
}

function spawnParticles(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    const a = rand(0, TAU), s = rand(40, 190);
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.7), color, r: rand(1.5, 3.5) });
  }
}

// ---------- Update ----------
let last = now();
function update(dt) {
  starPhase += dt;
  if (state !== State.PLAY) return;

  const mv = moveVector();
  if (mv.moving) {
    player.x = clamp(player.x + mv.x * player.speed * dt, player.r, WORLD.w - player.r);
    player.y = clamp(player.y + mv.y * player.speed * dt, player.r, WORLD.h - player.r);
    player.facing = Math.atan2(mv.y, mv.x);
    player.thrust = Math.min(1, player.thrust + dt * 5);
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

  if (roomActive && toSpawn.length === 0 && enemies.length === 0) {
    roomActive = false; setTimeout(openUpgrades, 350);
  }
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    let bounced = false;
    if (b.x < 0 || b.x > WORLD.w) { b.vx *= -1; b.x = clamp(b.x, 0, WORLD.w); bounced = true; }
    if (b.y < 0 || b.y > WORLD.h) { b.vy *= -1; b.y = clamp(b.y, 0, WORLD.h); bounced = true; }
    if (bounced) { if (b.ricochet > 0) b.ricochet--; else { bullets.splice(i, 1); continue; } }
    for (const e of enemies) {
      if (b.hitSet.has(e)) continue;
      const rr = b.r + e.r;
      if (dist2(b, e) <= rr * rr) {
        const isCrit = Math.random() < player.crit;
        damageEnemy(e, player.dmg * (isCrit ? player.critMult : 1), isCrit);
        b.hitSet.add(e);
        if (b.pierce > 0) { b.pierce--; }
        else if (b.ricochet > 0) {
          const nxt = enemies.find(o => o !== e && !b.hitSet.has(o));
          if (nxt) { const a = Math.atan2(nxt.y - b.y, nxt.x - b.x), sp = Math.hypot(b.vx, b.vy); b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp; b.ricochet--; b.hitSet = new Set([e]); }
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
    }
    e.x = clamp(e.x, e.r, WORLD.w - e.r); e.y = clamp(e.y, e.r, WORLD.h - e.r);
    const rr = e.r + player.r;
    if (dist2(e, player) <= rr * rr) hurtPlayer(e.touch);
  }
}

function enemyShoot(e, ang) {
  ebullets.push({ x: e.x, y: e.y, vx: Math.cos(ang) * e.projSpeed, vy: Math.sin(ang) * e.projSpeed, r: 6, life: 4, color: e.color });
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

// ---------- Render ----------
function drawBackground() {
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
    ctx.fillRect(s.x, y, s.z * 2, s.z * 2);
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(120,150,255,0.18)'; ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, WORLD.w - 3, WORLD.h - 3);
}

function drawMonster(e) {
  ctx.save(); ctx.translate(e.x, e.y);
  const col = e.flash > 0 ? '#ffffff' : e.color;
  const ea = Math.atan2(player.y - e.y, player.x - e.x);
  if (e.shape === 'spiky') {
    ctx.fillStyle = col; ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU, rr = e.r * (i % 2 ? 0.7 : 1.15) * (1 + 0.05 * Math.sin(e.wobble + i)); ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill();
  } else if (e.shape === 'pulse') {
    const pr = e.r * (1 + 0.12 * Math.sin(e.wobble));
    ctx.globalAlpha = 0.35; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, pr + 5, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(0, 0, pr, 0, TAU); ctx.fill();
  } else if (e.shape === 'horned') {
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, e.r, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(Math.cos(ea) * e.r, Math.sin(ea) * e.r);
    ctx.lineTo(Math.cos(ea - 0.4) * e.r * 1.7, Math.sin(ea - 0.4) * e.r * 1.7);
    ctx.lineTo(Math.cos(ea - 0.15) * e.r, Math.sin(ea - 0.15) * e.r); ctx.fill();
    ctx.beginPath(); ctx.moveTo(Math.cos(ea) * e.r, Math.sin(ea) * e.r);
    ctx.lineTo(Math.cos(ea + 0.4) * e.r * 1.7, Math.sin(ea + 0.4) * e.r * 1.7);
    ctx.lineTo(Math.cos(ea + 0.15) * e.r, Math.sin(ea + 0.15) * e.r); ctx.fill();
  } else if (e.shape === 'wisp') {
    ctx.globalAlpha = 0.3; ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(-Math.cos(ea) * e.r, -Math.sin(ea) * e.r, e.r * 0.8, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(0, 0, e.r, 0, TAU); ctx.fill();
  } else if (e.shape === 'maw') {
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, e.r, 0, TAU); ctx.fill();
    const gape = 0.5 + 0.25 * Math.sin(e.wobble * 0.5);
    ctx.fillStyle = '#2a0008'; ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.arc(0, 0, e.r * 0.9, ea - gape, ea + gape); ctx.closePath(); ctx.fill();
  }
  // eye
  ctx.fillStyle = '#05060f';
  ctx.beginPath(); ctx.arc(Math.cos(ea) * e.r * 0.35, Math.sin(ea) * e.r * 0.35, e.r * 0.24, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(Math.cos(ea) * e.r * 0.42, Math.sin(ea) * e.r * 0.42, e.r * 0.09, 0, TAU); ctx.fill();
  ctx.restore();

  if (e.hp < e.maxHp) {
    const w = e.r * 2, h = 4;
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(e.x - w / 2, e.y - e.r - 10, w, h);
    ctx.fillStyle = '#ff6b8a'; ctx.fillRect(e.x - w / 2, e.y - e.r - 10, w * clamp(e.hp / e.maxHp, 0, 1), h);
  }
}

function drawShip() {
  ctx.save(); ctx.translate(player.x, player.y); ctx.rotate(player.facing + Math.PI / 2);
  if (player.inv > 0 && Math.floor(player.inv * 20) % 2 === 0) ctx.globalAlpha = 0.4;
  // thruster
  if (player.thrust > 0.05) {
    ctx.globalAlpha *= 0.9; ctx.fillStyle = '#ffd15a';
    const fl = player.r * (1 + player.thrust * 1.4 + 0.3 * Math.sin(starPhase * 40));
    ctx.beginPath(); ctx.moveTo(-5, player.r); ctx.lineTo(0, player.r + fl); ctx.lineTo(5, player.r); ctx.fill();
    ctx.globalAlpha = player.inv > 0 && Math.floor(player.inv * 20) % 2 === 0 ? 0.4 : 1;
  }
  // hull
  ctx.fillStyle = player.color;
  ctx.beginPath(); ctx.moveTo(0, -player.r - 3); ctx.lineTo(player.r, player.r); ctx.lineTo(0, player.r * 0.5); ctx.lineTo(-player.r, player.r); ctx.closePath(); ctx.fill();
  // cockpit
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.beginPath(); ctx.arc(0, -player.r * 0.15, player.r * 0.3, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1; ctx.restore();
}

function draw() {
  ctx.setTransform(scale, 0, 0, scale, offX, offY);
  drawBackground();
  if (state === State.START || state === State.HEROES) return;

  for (const p of particles) { ctx.globalAlpha = clamp(p.life * 2, 0, 1); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill(); }
  ctx.globalAlpha = 1;
  for (const b of ebullets) { ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill(); ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 3, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
  for (const e of enemies) drawMonster(e);
  for (const b of bullets) { ctx.fillStyle = '#bfefff'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill(); ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 3, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
  drawShip();
  ctx.textAlign = 'center';
  for (const f of floaters) {
    ctx.globalAlpha = clamp(f.t * 1.5, 0, 1);
    ctx.fillStyle = f.coin ? '#7bffb0' : f.crit ? '#ff5a7a' : '#eaf2ff';
    ctx.font = 'bold ' + (f.crit ? 20 : 15) + 'px system-ui';
    ctx.fillText(f.txt, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

// ---------- HUD ----------
const el = id => document.getElementById(id);
function updateHUD() {
  el('hpbar').style.width = clamp(player.hp / player.maxHp * 100, 0, 100) + '%';
  el('coins').textContent = coins; el('room').textContent = room; el('level').textContent = level;
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
    c.innerHTML = `<div class="av" style="background:${h.color}22;border:1px solid ${h.color}66">${h.ico}</div>
      <div class="hn" style="color:${h.color}">${h.name}</div>
      <div class="hr">${h.role}</div><div class="hp">${h.perk}</div>`;
    c.onclick = () => startGame(h);
    wrap.appendChild(c);
  }
  show('heroes');
}

function startGame(h) {
  heroDef = h; initPlayerFromHero(h);
  bullets = []; ebullets = []; enemies = []; particles = []; floaters = [];
  coins = 0; room = 1; level = 1; xp = 0; xpNext = 3;
  hideAllOverlays();
  el('hud').classList.remove('hidden'); el('joyhint').classList.remove('hidden');
  state = State.PLAY; buildRoom(room);
}

function openUpgrades() {
  state = State.UPGRADE;
  const picks = pickUpgrades(3);
  const wrap = el('cards'); wrap.innerHTML = '';
  for (const u of picks) {
    const c = document.createElement('div');
    c.className = 'card';
    c.innerHTML = `<div class="ico">${u.ico}</div><div class="name">${u.name}</div>
      <div class="desc">${u.desc}</div><div class="rar" style="color:${RAR_COLOR[u.rar]}">${u.rar}</div>`;
    c.onclick = () => { u.apply(player); heal(player.maxHp * 0.15); nextRoom(); };
    wrap.appendChild(c);
  }
  show('upgrade');
}

function nextRoom() {
  hideAllOverlays(); room++; state = State.PLAY;
  player.x = WORLD.w / 2; player.y = WORLD.h - 140; buildRoom(room);
}

function gameOver() {
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

})();
