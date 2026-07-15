/* ============================================================
   RIFT RUNNER  —  an original roguelite arcade shooter
   Same genre feel as move/stop/shoot roguelites, 100% original
   assets, names, numbers and code. Single-file vanilla JS.
   ============================================================ */
(() => {
'use strict';

// ---------- Canvas & world ----------
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const WORLD = { w: 480, h: 800 };          // logical play area (arena)
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

// ---------- Input (keyboard + drag joystick) ----------
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
const State = { START: 0, PLAY: 1, UPGRADE: 2, OVER: 3 };
let state = State.START;

const player = {
  x: WORLD.w / 2, y: WORLD.h - 140, r: 14,
  speed: 210, hp: 100, maxHp: 100,
  fireRate: 0.62,          // seconds between shots (lower = faster)
  dmg: 10, projSpeed: 460, range: 340,
  // upgrade-driven stats
  multishot: 1, spread: 0.18, pierce: 0, ricochet: 0,
  crit: 0.05, critMult: 2, lifesteal: 0, sideShot: false, backShot: false,
  fireCd: 0, inv: 0, facing: -Math.PI / 2,
};

let bullets = [];      // player projectiles
let ebullets = [];     // enemy projectiles
let enemies = [];
let particles = [];
let floaters = [];     // floating damage/coin text
let coins = 0, room = 1, level = 1, xp = 0, xpNext = 3;
let killsThisRoom = 0, roomTarget = 0, roomActive = false, spawnTimer = 0, toSpawn = [];

// ---------- Enemy archetypes (original) ----------
const ENEMY_TYPES = {
  drifter:  { r: 13, hp: 22, speed: 55,  color: '#ff6b8a', touch: 12, score: 1, ai: 'chase' },
  spitter:  { r: 15, hp: 30, speed: 30,  color: '#c97bff', touch: 10, score: 2, ai: 'ranged', fireEvery: 1.8, projSpeed: 200 },
  charger:  { r: 16, hp: 40, speed: 40,  color: '#ffa24a', touch: 18, score: 2, ai: 'charge' },
  orbiter:  { r: 12, hp: 26, speed: 90,  color: '#4ad6c0', touch: 10, score: 2, ai: 'orbit', fireEvery: 2.4, projSpeed: 170 },
  brute:    { r: 24, hp: 120, speed: 34, color: '#ff4d4d', touch: 26, score: 5, ai: 'chase' },
};

// ---------- Upgrade pool (original names) ----------
const UPGRADES = [
  { id:'dmg',   ico:'⚔️', name:'Sharp Edge',    rar:'common',   desc:'+25% attack damage', apply:p=>p.dmg*=1.25 },
  { id:'rate',  ico:'⚡', name:'Quick Draw',     rar:'common',   desc:'+18% fire rate',     apply:p=>p.fireRate*=0.82 },
  { id:'hp',    ico:'❤️', name:'Vital Core',     rar:'common',   desc:'+30 max HP & heal',  apply:p=>{p.maxHp+=30;p.hp+=30;} },
  { id:'speed', ico:'🌀', name:'Fleetfoot',      rar:'common',   desc:'+12% move speed',    apply:p=>p.speed*=1.12 },
  { id:'multi', ico:'🎯', name:'Split Shot',     rar:'rare',     desc:'+1 projectile',      apply:p=>p.multishot+=1 },
  { id:'pierce',ico:'🏹', name:'Piercing Bolt',  rar:'rare',     desc:'Shots pierce +1 foe', apply:p=>p.pierce+=1 },
  { id:'ric',   ico:'💫', name:'Ricochet',       rar:'rare',     desc:'Shots bounce +1 time', apply:p=>p.ricochet+=1 },
  { id:'crit',  ico:'✨', name:'Keen Eye',       rar:'rare',     desc:'+12% crit chance',   apply:p=>p.crit+=0.12 },
  { id:'side',  ico:'↔️', name:'Flank Fire',     rar:'epic',     desc:'Fire from both sides', apply:p=>p.sideShot=true },
  { id:'back',  ico:'🔄', name:'Rear Guard',     rar:'epic',     desc:'Also fire backward',  apply:p=>p.backShot=true },
  { id:'leech', ico:'🩸', name:'Bloodbind',      rar:'epic',     desc:'Heal 6% of damage',   apply:p=>p.lifesteal+=0.06 },
  { id:'big',   ico:'💥', name:'Heavy Rounds',   rar:'epic',     desc:'+50% dmg, -10% rate', apply:p=>{p.dmg*=1.5;p.fireRate*=1.10;} },
];
const RAR_COLOR = { common:'#9fb2cf', rare:'#5ad1ff', epic:'#c07bff' };

function pickUpgrades(n) {
  const pool = [...UPGRADES];
  const out = [];
  // weight by rarity so commons appear more often
  const weight = u => u.rar === 'common' ? 5 : u.rar === 'rare' ? 3 : 1.4;
  while (out.length < n && pool.length) {
    let total = pool.reduce((s, u) => s + weight(u), 0);
    let roll = Math.random() * total, idx = 0;
    for (let i = 0; i < pool.length; i++) { roll -= weight(pool[i]); if (roll <= 0) { idx = i; break; } }
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

// ---------- Room / wave generation ----------
function buildRoom(n) {
  roomActive = true; killsThisRoom = 0; toSpawn = []; spawnTimer = 0;
  const budget = 3 + n * 1.6;               // difficulty budget grows with depth
  let spent = 0;
  const kinds = Object.keys(ENEMY_TYPES);
  while (spent < budget) {
    // unlock tougher enemies deeper in
    let choices = ['drifter'];
    if (n >= 2) choices.push('spitter');
    if (n >= 3) choices.push('charger', 'orbiter');
    if (n >= 5 && Math.random() < 0.25) choices.push('brute');
    const k = choices[Math.floor(Math.random() * choices.length)];
    toSpawn.push(k);
    spent += ENEMY_TYPES[k].score;
  }
  roomTarget = toSpawn.length;
  // stagger spawns
  toSpawn = toSpawn.map((k, i) => ({ k, at: i * rand(0.25, 0.6) }));
}

function spawnEnemy(kind) {
  const t = ENEMY_TYPES[kind];
  const hpScale = 1 + (room - 1) * 0.14;
  // spawn along top / sides, away from player
  let x, y, tries = 0;
  do {
    const edge = Math.floor(rand(0, 3));
    if (edge === 0) { x = rand(30, WORLD.w - 30); y = rand(-20, 60); }
    else if (edge === 1) { x = rand(-20, 60); y = rand(40, WORLD.h * 0.55); }
    else { x = rand(WORLD.w - 60, WORLD.w + 20); y = rand(40, WORLD.h * 0.55); }
    tries++;
  } while (dist2({ x, y }, player) < 140 * 140 && tries < 8);
  enemies.push({
    kind, x, y, r: t.r, color: t.color,
    hp: t.hp * hpScale, maxHp: t.hp * hpScale,
    speed: t.speed, touch: t.touch, ai: t.ai,
    fireCd: rand(0.5, (t.fireEvery || 2)), fireEvery: t.fireEvery, projSpeed: t.projSpeed,
    orbT: rand(0, Math.PI * 2), chargeCd: rand(1, 2.5), chargeVX: 0, chargeVY: 0, charging: 0,
    flash: 0,
  });
}

// ---------- Combat ----------
function fire() {
  const target = nearestEnemy();
  let baseAng = target ? Math.atan2(target.y - player.y, target.x - player.x) : player.facing;
  player.facing = baseAng;

  const shots = [];
  const n = player.multishot;
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * player.spread;
    shots.push(baseAng + off);
  }
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
  spawnParticles(player.x + Math.cos(baseAng) * player.r, player.y + Math.sin(baseAng) * player.r, '#5ad1ff', 3);
}

function nearestEnemy() {
  let best = null, bd = Infinity;
  for (const e of enemies) {
    const d = dist2(e, player);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function damageEnemy(e, dmg, isCrit) {
  e.hp -= dmg; e.flash = 0.12;
  floaters.push({ x: e.x, y: e.y - e.r, txt: Math.round(dmg), t: 0.6, crit: isCrit, vy: -40 });
  if (player.lifesteal) heal(dmg * player.lifesteal);
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e) {
  const idx = enemies.indexOf(e);
  if (idx >= 0) enemies.splice(idx, 1);
  spawnParticles(e.x, e.y, e.color, 12);
  killsThisRoom++;
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

// ---------- Particles / floaters ----------
function spawnParticles(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    const a = rand(0, Math.PI * 2), s = rand(40, 180);
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.7), color, r: rand(1.5, 3.5) });
  }
}

// ---------- Update ----------
let last = now();
function update(dt) {
  if (state !== State.PLAY) return;

  // player move
  const mv = moveVector();
  if (mv.moving) {
    player.x = clamp(player.x + mv.x * player.speed * dt, player.r, WORLD.w - player.r);
    player.y = clamp(player.y + mv.y * player.speed * dt, player.r, WORLD.h - player.r);
  }
  player.inv = Math.max(0, player.inv - dt);

  // auto-fire only when standing still & enemies present
  player.fireCd -= dt;
  if (!mv.moving && enemies.length && player.fireCd <= 0) {
    fire(); player.fireCd = player.fireRate;
  }

  // spawn queued enemies
  if (roomActive && toSpawn.length) {
    spawnTimer += dt;
    while (toSpawn.length && toSpawn[0].at <= spawnTimer) spawnEnemy(toSpawn.shift().k);
  }

  updateBullets(dt);
  updateEnemies(dt);
  updateEbullets(dt);
  updateParticles(dt);

  // room clear?
  if (roomActive && toSpawn.length === 0 && enemies.length === 0) {
    roomActive = false;
    setTimeout(openUpgrades, 350);
  }
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    // wall ricochet
    let bounced = false;
    if (b.x < 0 || b.x > WORLD.w) { b.vx *= -1; b.x = clamp(b.x, 0, WORLD.w); bounced = true; }
    if (b.y < 0 || b.y > WORLD.h) { b.vy *= -1; b.y = clamp(b.y, 0, WORLD.h); bounced = true; }
    if (bounced) { if (b.ricochet > 0) b.ricochet--; else { bullets.splice(i, 1); continue; } }

    // hit enemies
    for (const e of enemies) {
      if (b.hitSet.has(e)) continue;
      const rr = (b.r + e.r);
      if (dist2(b, e) <= rr * rr) {
        const isCrit = Math.random() < player.crit;
        const dmg = player.dmg * (isCrit ? player.critMult : 1);
        damageEnemy(e, dmg, isCrit);
        b.hitSet.add(e);
        if (b.pierce > 0) { b.pierce--; }
        else if (b.ricochet > 0) {
          // bounce toward another enemy
          const nxt = enemies.find(o => o !== e && !b.hitSet.has(o));
          if (nxt) { const a = Math.atan2(nxt.y - b.y, nxt.x - b.x); const sp = Math.hypot(b.vx, b.vy); b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp; b.ricochet--; b.hitSet = new Set([e]); }
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
    e.flash = Math.max(0, e.flash - dt);
    const ang = Math.atan2(player.y - e.y, player.x - e.x);
    const d = Math.sqrt(dist2(e, player));

    if (e.ai === 'chase') {
      e.x += Math.cos(ang) * e.speed * dt; e.y += Math.sin(ang) * e.speed * dt;
    } else if (e.ai === 'ranged') {
      // keep medium distance
      const want = 220;
      const dir = d > want ? 1 : -0.6;
      e.x += Math.cos(ang) * e.speed * dt * dir; e.y += Math.sin(ang) * e.speed * dt * dir;
      e.fireCd -= dt;
      if (e.fireCd <= 0) { enemyShoot(e, ang); e.fireCd = e.fireEvery; }
    } else if (e.ai === 'orbit') {
      e.orbT += dt * 1.5;
      const want = 170;
      const tx = player.x + Math.cos(e.orbT) * want, ty = player.y + Math.sin(e.orbT) * want;
      const oa = Math.atan2(ty - e.y, tx - e.x);
      e.x += Math.cos(oa) * e.speed * dt; e.y += Math.sin(oa) * e.speed * dt;
      e.fireCd -= dt;
      if (e.fireCd <= 0) { enemyShoot(e, ang); e.fireCd = e.fireEvery; }
    } else if (e.ai === 'charge') {
      if (e.charging > 0) {
        e.charging -= dt; e.x += e.chargeVX * dt; e.y += e.chargeVY * dt;
      } else {
        e.x += Math.cos(ang) * e.speed * 0.5 * dt; e.y += Math.sin(ang) * e.speed * 0.5 * dt;
        e.chargeCd -= dt;
        if (e.chargeCd <= 0 && d < 320) { e.charging = 0.5; e.chargeVX = Math.cos(ang) * 320; e.chargeVY = Math.sin(ang) * 320; e.chargeCd = rand(2, 3.5); }
      }
    }
    e.x = clamp(e.x, e.r, WORLD.w - e.r); e.y = clamp(e.y, e.r, WORLD.h - e.r);

    // touch damage
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
function draw() {
  ctx.setTransform(scale, 0, 0, scale, offX, offY);
  // arena background
  ctx.fillStyle = '#11151f';
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);
  // grid
  ctx.strokeStyle = 'rgba(90,209,255,0.06)'; ctx.lineWidth = 1;
  for (let gx = 0; gx <= WORLD.w; gx += 40) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, WORLD.h); ctx.stroke(); }
  for (let gy = 0; gy <= WORLD.h; gy += 40) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(WORLD.w, gy); ctx.stroke(); }
  // border glow
  ctx.strokeStyle = 'rgba(90,209,255,0.25)'; ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, WORLD.w - 3, WORLD.h - 3);

  if (state === State.START) return;

  // particles (under)
  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life * 2, 0, 1);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // enemy bullets
  for (const b of ebullets) {
    ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 3, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  }

  // enemies
  for (const e of enemies) {
    ctx.save(); ctx.translate(e.x, e.y);
    ctx.fillStyle = e.flash > 0 ? '#ffffff' : e.color;
    ctx.beginPath(); ctx.arc(0, 0, e.r, 0, Math.PI * 2); ctx.fill();
    // eye toward player
    const ea = Math.atan2(player.y - e.y, player.x - e.x);
    ctx.fillStyle = '#0d1018';
    ctx.beginPath(); ctx.arc(Math.cos(ea) * e.r * 0.4, Math.sin(ea) * e.r * 0.4, e.r * 0.28, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // hp bar
    if (e.hp < e.maxHp) {
      const w = e.r * 2, h = 4;
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(e.x - w / 2, e.y - e.r - 9, w, h);
      ctx.fillStyle = '#ff6b8a'; ctx.fillRect(e.x - w / 2, e.y - e.r - 9, w * clamp(e.hp / e.maxHp, 0, 1), h);
    }
  }

  // player bullets
  for (const b of bullets) {
    ctx.fillStyle = '#8fe8ff';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 3, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  }

  // player
  ctx.save(); ctx.translate(player.x, player.y);
  if (player.inv > 0 && Math.floor(player.inv * 20) % 2 === 0) ctx.globalAlpha = 0.4;
  // body
  ctx.fillStyle = '#5ad1ff';
  ctx.beginPath(); ctx.arc(0, 0, player.r, 0, Math.PI * 2); ctx.fill();
  // aim indicator
  ctx.strokeStyle = '#eaf2ff'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(player.facing) * (player.r + 8), Math.sin(player.facing) * (player.r + 8)); ctx.stroke();
  ctx.globalAlpha = 1; ctx.restore();

  // floaters
  ctx.textAlign = 'center'; ctx.font = 'bold 16px system-ui';
  for (const f of floaters) {
    ctx.globalAlpha = clamp(f.t * 1.5, 0, 1);
    ctx.fillStyle = f.coin ? '#ffd15a' : f.crit ? '#ff5a7a' : '#eaf2ff';
    ctx.font = 'bold ' + (f.crit ? 20 : 15) + 'px system-ui';
    ctx.fillText(f.txt, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

// ---------- HUD ----------
const el = id => document.getElementById(id);
function updateHUD() {
  el('hpbar').style.width = clamp(player.hp / player.maxHp * 100, 0, 100) + '%';
  el('coins').textContent = coins;
  el('room').textContent = room;
  el('level').textContent = level;
}

// ---------- Screens ----------
function show(id) { ['start', 'upgrade', 'over'].forEach(s => el(s).classList.toggle('hidden', s !== id)); }
function hideAllOverlays() { ['start', 'upgrade', 'over'].forEach(s => el(s).classList.add('hidden')); }

function startGame() {
  Object.assign(player, {
    x: WORLD.w / 2, y: WORLD.h - 140, r: 14, speed: 210, hp: 100, maxHp: 100,
    fireRate: 0.62, dmg: 10, projSpeed: 460, range: 340, multishot: 1, spread: 0.18,
    pierce: 0, ricochet: 0, crit: 0.05, critMult: 2, lifesteal: 0, sideShot: false,
    backShot: false, fireCd: 0, inv: 0, facing: -Math.PI / 2,
  });
  bullets = []; ebullets = []; enemies = []; particles = []; floaters = [];
  coins = 0; room = 1; level = 1; xp = 0; xpNext = 3;
  hideAllOverlays();
  el('hud').classList.remove('hidden');
  el('joyhint').classList.remove('hidden');
  state = State.PLAY;
  buildRoom(room);
}

function openUpgrades() {
  state = State.UPGRADE;
  const picks = pickUpgrades(3);
  const wrap = el('cards'); wrap.innerHTML = '';
  for (const u of picks) {
    const c = document.createElement('div');
    c.className = 'card';
    c.innerHTML = `<div class="ico">${u.ico}</div><div class="name">${u.name}</div>
      <div class="desc">${u.desc}</div>
      <div class="rar" style="color:${RAR_COLOR[u.rar]}">${u.rar}</div>`;
    c.onclick = () => { u.apply(player); heal(player.maxHp * 0.15); nextRoom(); };
    wrap.appendChild(c);
  }
  show('upgrade');
}

function nextRoom() {
  hideAllOverlays();
  room++;
  state = State.PLAY;
  player.x = WORLD.w / 2; player.y = WORLD.h - 140;
  buildRoom(room);
}

function gameOver() {
  state = State.OVER;
  el('overStats').innerHTML =
    `You reached <b>Room ${room}</b> · Level ${level}<br>Collected <b>${coins}</b> shards across the rift.`;
  el('hud').classList.add('hidden');
  el('joyhint').classList.add('hidden');
  show('over');
}

el('startBtn').onclick = startGame;
el('againBtn').onclick = startGame;

// ---------- Main loop ----------
function loop() {
  const t = now();
  let dt = (t - last) / 1000; last = t;
  dt = Math.min(dt, 0.05);           // clamp big frame gaps
  update(dt);
  draw();
  if (state === State.PLAY) updateHUD();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

})();
