(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;

  const el = {
    best: document.getElementById("bestDistance"), coins: document.getElementById("coins"), shop: document.getElementById("shop"),
    msg: document.getElementById("message"), speedMeter: document.getElementById("speedMeter"), speedText: document.getElementById("speedText"),
    timingMeter: document.getElementById("timingMeter"), timingText: document.getElementById("timingText"), rocketMeter: document.getElementById("rocketMeter"),
    rocketText: document.getElementById("rocketText"), resetSave: document.getElementById("resetSave"), muteBtn: document.getElementById("muteBtn"),
    overlay: document.getElementById("overlay"), titleScreen: document.getElementById("titleScreen"), resultScreen: document.getElementById("resultScreen"),
    playBtn: document.getElementById("playBtn"), retryBtn: document.getElementById("retryBtn"), resTitle: document.getElementById("resTitle"),
    resDist: document.getElementById("resDist"), resSpeed: document.getElementById("resSpeed"), resJump: document.getElementById("resJump"),
    resBones: document.getElementById("resBones"), resHits: document.getElementById("resHits"), resReward: document.getElementById("resReward"),
    resBadge: document.getElementById("resBadge"),
  };

  const upgrades = {
    shoes: { name: "Chaussures", desc: "Accélération et vitesse au sol.", base: 35, max: 8 },
    ramp: { name: "Bottes de saut", desc: "Sauts plus hauts et air-jumps.", base: 50, max: 8 },
    rocket: { name: "Rocket", desc: "Boost horizontal avec Shift.", base: 60, max: 8 },
    cape: { name: "Cape aéro", desc: "Meilleur contrôle en l'air.", base: 40, max: 8 },
    start: { name: "Élan de départ", desc: "Vitesse initiale augmentée.", base: 30, max: 8 },
  };
  const defaultSave = { coins: 0, best: 0, upgrades: { shoes: 0, ramp: 0, rocket: 0, cape: 0, start: 0 } };
  const anim = {}, keys = new Set();
  let save = loadSave(), state = "title", last = performance.now(), time = 0, cameraX = 0, furthestX = 0, seed = 1;
  let platforms = [], entities = [], particles = [], shake = 0, flash = null;
  let attempt = {};

  const cfg = { startX: 120, groundY: 575, gravity: 1900, worldScale: 0.09, deathY: 940 };
  const titan = { x: cfg.startX, y: cfg.groundY - 126, w: 62, h: 126, vx: 0, vy: 0, facing: 1, anim: "idle", frame: 0, frameT: 0, grounded: false, jumpsLeft: 0, coyote: 0, hurt: 0, invuln: 0, rotation: 0 };
  const audio = {
    ctx: null, muted: false,
    ensure() { if (!this.ctx && !this.muted) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) this.ctx = new AC(); } },
    resume() { if (this.ctx?.state === "suspended") this.ctx.resume(); },
    beep(freq = 440, dur = .08, type = "sine") {
      if (!this.ctx || this.muted) return;
      const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(.001, t); g.gain.exponentialRampToValueAtTime(.25, t + .01); g.gain.exponentialRampToValueAtTime(.001, t + dur);
      o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + dur + .02);
    },
    toggleMute() { this.muted = !this.muted; return this.muted; }
  };

  function cloneDefault() { return JSON.parse(JSON.stringify(defaultSave)); }
  function loadSave() {
    try {
      const parsed = JSON.parse(localStorage.getItem("titanRocketRunSave") || "null");
      if (!parsed) return cloneDefault();
      return { ...cloneDefault(), ...parsed, upgrades: { ...cloneDefault().upgrades, ...(parsed.upgrades || {}) } };
    } catch { return cloneDefault(); }
  }
  function writeSave() { localStorage.setItem("titanRocketRunSave", JSON.stringify(save)); updateUI(); }
  function cost(id) { return Math.floor(upgrades[id].base * Math.pow(1.5, save.upgrades[id] || 0)); }
  function updateUI() { el.best.textContent = `${save.best.toFixed(1)} m`; el.coins.textContent = save.coins; renderShop(); }
  function renderShop() {
    el.shop.innerHTML = "";
    Object.entries(upgrades).forEach(([id, u]) => {
      const lvl = save.upgrades[id] || 0, c = cost(id);
      const div = document.createElement("div"); div.className = "item";
      div.innerHTML = `<div class="itemTop"><div><h3>${u.name}</h3><small>${u.desc}</small></div><b>Niv. ${lvl}/${u.max}</b></div><button ${lvl >= u.max || save.coins < c ? "disabled" : ""}>${lvl >= u.max ? "MAX" : `Acheter — ${c} os`}</button>`;
      div.querySelector("button").onclick = () => { if (save.coins >= c && lvl < u.max) { save.coins -= c; save.upgrades[id] = lvl + 1; writeSave(); message("Upgrade acheté", `${u.name} niveau ${lvl + 1}.`); } };
      el.shop.appendChild(div);
    });
  }

  async function loadAssets() {
    const manifest = await (await fetch("assets/titan_manifest.json")).json();
    await Promise.all(Object.entries(manifest.animations).map(async ([name, data]) => {
      anim[name] = { fps: data.fps, loop: data.loop, frames: await Promise.all(data.frames.map(loadImage)) };
    }));
  }
  function loadImage(src) { return new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src; }); }

  const maxJumps = () => 2 + Math.floor((save.upgrades.ramp || 0) / 4);
  const rocketMax = () => 70 + (save.upgrades.rocket || 0) * 18;
  const topSpeed = () => 820 + (save.upgrades.shoes || 0) * 70 + (save.upgrades.start || 0) * 18;
  const jumpPower = () => 760 + (save.upgrades.ramp || 0) * 32;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function resetAttempt() {
    seed = 1 + Math.floor(Math.random() * 999999); cameraX = 0; furthestX = 0; platforms = []; entities = []; particles = []; shake = 0; flash = null;
    Object.assign(titan, { x: cfg.startX, y: cfg.groundY - titan.h, vx: 260 + save.upgrades.start * 45, vy: 0, facing: 1, anim: "run", frame: 0, frameT: 0, grounded: true, jumpsLeft: maxJumps(), coyote: 0, hurt: 0, invuln: 0, rotation: 0 });
    attempt = { maxSpeed: 0, jumps: 0, bestCombo: 0, combo: 0, landed: 0, rocket: rocketMax(), distance: 0, reward: 0, pickups: 0, bonusBones: 0, hits: 0 };
    platforms.push({ id: 0, x: 0, y: cfg.groundY, w: 920, h: 70, kind: "start" }); furthestX = 920; ensureWorld();
    state = "playing"; hideOverlay(); message("Go !", "Enchaîne les plateformes, garde l'élan, double-saute et utilise Shift pour booster. Les mines ralentissent sans tuer.");
  }

  function ensureWorld() {
    const target = cameraX + W + 2200;
    while (furthestX < target) {
      const lastP = platforms[platforms.length - 1], diff = clamp(furthestX / 5200, 0, 1);
      const gap = 115 + rand() * (170 + diff * 90), w = 260 + rand() * (300 - diff * 70), y = clamp(lastP.y + (rand() - .5) * (135 + diff * 80), 300, 600);
      const p = { id: platforms.length, x: lastP.x + lastP.w + gap, y, w, h: 34 + rand() * 18, kind: rand() < .16 ? "boost" : "normal" };
      platforms.push(p); furthestX = p.x + p.w; decorate(p, diff);
    }
    platforms = platforms.filter(p => p.x + p.w > cameraX - 600); entities = entities.filter(e => !e.hit && e.x > cameraX - 500);
  }
  function decorate(p, diff) {
    for (let i = 0, n = 1 + Math.floor(rand() * 3); i < n; i++) {
      const floating = rand() < .52;
      entities.push({ type: "bone", x: p.x + 55 + rand() * Math.max(60, p.w - 110), y: p.y - (floating ? 135 + rand() * 135 : 58), r: 19, value: floating ? 5 : 3, hit: false, bob: rand() * Math.PI * 2 });
    }
    if (p.id > 1 && rand() < .18 + diff * .18) entities.push({ type: "mine", x: p.x + 80 + rand() * Math.max(40, p.w - 160), y: p.y - 30, r: 24, hit: false, bob: rand() * Math.PI * 2 });
  }

  function message(title, body) { el.msg.innerHTML = `<b>${title}</b><br>${body}`; }
  function showTitle() { state = "title"; el.titleScreen.classList.remove("hidden"); el.resultScreen.classList.add("hidden"); el.overlay.classList.remove("hidden"); }
  function hideOverlay() { el.overlay.classList.add("hidden"); }
  function showResult() {
    el.titleScreen.classList.add("hidden"); el.resultScreen.classList.remove("hidden");
    el.resDist.textContent = `${attempt.distance.toFixed(1)} m`; el.resSpeed.textContent = Math.round(attempt.maxSpeed); el.resJump.textContent = `${attempt.jumps}`;
    el.resBones.textContent = `${attempt.pickups} (+${attempt.bonusBones})`; el.resHits.textContent = attempt.hits; el.resReward.textContent = `+${attempt.reward}`;
    el.resTitle.textContent = attempt.distance >= save.best && attempt.distance > 0 ? "Nouveau record !" : "Run terminé";
    const badge = attempt.distance > 220 ? "💨 Sonic dog spirit" : attempt.bestCombo >= 8 ? "🦴 Combo d'os" : attempt.hits === 0 && attempt.distance > 80 ? "✨ Run propre" : attempt.jumps >= 12 ? "🦘 Plateformer né" : "";
    el.resBadge.textContent = badge; el.resBadge.classList.toggle("hidden", !badge); el.overlay.classList.remove("hidden");
  }
  function finishRun() {
    if (state === "result") return; state = "result"; titan.anim = "knockout";
    attempt.distance = Math.max(0, (titan.x - cfg.startX) * cfg.worldScale);
    attempt.reward = Math.max(1, Math.floor(attempt.distance * .65 + attempt.bonusBones + attempt.bestCombo * 1.2 + Math.max(0, attempt.landed - attempt.hits) * .8));
    save.coins += attempt.reward; if (attempt.distance > save.best) save.best = attempt.distance; writeSave();
    message(`${attempt.distance.toFixed(1)} m !`, `Titan est tombé. +${attempt.reward} os. R pour relancer ou améliore Titan.`); showResult();
  }

  function keyDown(e) {
    const k = e.key.toLowerCase(); keys.add(k); audio.ensure(); audio.resume();
    if (state === "title" && (k === " " || k === "enter")) { e.preventDefault(); resetAttempt(); return; }
    if (k === "r") { e.preventDefault(); resetAttempt(); return; }
    if (k === " " && state === "result") { e.preventDefault(); resetAttempt(); return; }
    if (k === " " && state === "playing") { e.preventDefault(); tryJump(); }
  }
  function keyUp(e) { keys.delete(e.key.toLowerCase()); }

  function tryJump() {
    if (state !== "playing") return;
    const groundJump = titan.grounded || titan.coyote > 0;
    if (!groundJump && titan.jumpsLeft <= 0) return;
    titan.grounded = false; titan.coyote = 0; titan.jumpsLeft = Math.max(0, titan.jumpsLeft - 1); titan.vy = -jumpPower() * (groundJump ? 1 : .88); titan.vx += titan.facing * (groundJump ? 18 : 36);
    titan.anim = "jump"; titan.frame = 0; titan.frameT = 0; attempt.jumps++; audio.beep(groundJump ? 360 : 620, .12, "square"); burst(titan.x, titan.y + titan.h * .65, groundJump ? 10 : 16, groundJump ? "rgba(98,255,82," : "rgba(98,180,255,");
  }

  function update(dt) {
    time += dt;
    if (state === "title") { titan.anim = "idle"; updateAnim(dt); draw(); return; }
    if (state === "result") { titan.vx *= Math.pow(.05, dt); titan.vy += cfg.gravity * dt; titan.x += titan.vx * dt; titan.y += titan.vy * dt; cameraX = Math.max(0, titan.x - 330); updateAnim(dt); updateParticles(dt); updateMeters(); draw(); return; }
    ensureWorld(); updatePlayer(dt); checkEntities(); cameraX += (Math.max(0, titan.x - W * .34) - cameraX) * Math.min(1, 7 * dt);
    if (titan.y > cfg.deathY) finishRun(); shake = Math.max(0, shake - 60 * dt); if (flash && (flash.life -= dt) <= 0) flash = null;
    updateAnim(dt); updateParticles(dt); updateMeters(); draw();
  }

  function updatePlayer(dt) {
    const left = keys.has("a") || keys.has("q") || keys.has("arrowleft"), right = keys.has("d") || keys.has("arrowright"), rocket = keys.has("shift") && attempt.rocket > 0;
    const accel = titan.grounded ? 1320 + save.upgrades.shoes * 95 : 760 + save.upgrades.cape * 62;
    if (left) { titan.vx -= accel * dt; titan.facing = -1; } if (right) { titan.vx += accel * dt; titan.facing = 1; }
    if (!left && !right && titan.grounded) titan.vx *= Math.pow(.82, dt * 10); else if (!titan.grounded) titan.vx *= 1 - (0.035 + save.upgrades.cape * .004) * dt;
    if (rocket) { titan.vx += titan.facing * (1120 + save.upgrades.rocket * 115) * dt; titan.vy -= (80 + save.upgrades.rocket * 10) * dt; attempt.rocket = Math.max(0, attempt.rocket - 42 * dt); titan.anim = "bark_energy_blast"; rocketTrail(); }
    else if (titan.grounded) attempt.rocket = Math.min(rocketMax(), attempt.rocket + 8 * dt);
    titan.vx = clamp(titan.vx, -topSpeed() * .74, topSpeed() + (rocket ? 580 : 0)); if (!titan.grounded) titan.coyote = Math.max(0, titan.coyote - dt);
    titan.vy += cfg.gravity * (1 - save.upgrades.cape * .018) * dt; titan.vy = Math.min(titan.vy, 1180);
    const prevY = titan.y; titan.x += titan.vx * dt; titan.y += titan.vy * dt; collidePlatforms(prevY);
    titan.hurt = Math.max(0, titan.hurt - dt); titan.invuln = Math.max(0, titan.invuln - dt); attempt.maxSpeed = Math.max(attempt.maxSpeed, Math.abs(titan.vx)); attempt.distance = Math.max(attempt.distance, (titan.x - cfg.startX) * cfg.worldScale); setAnim();
  }
  function collidePlatforms(prevY) {
    const wasGrounded = titan.grounded; titan.grounded = false;
    for (const p of platforms) {
      const over = titan.x + titan.w * .42 > p.x && titan.x - titan.w * .42 < p.x + p.w, prevBottom = prevY + titan.h, bottom = titan.y + titan.h;
      if (over && titan.vy >= 0 && prevBottom <= p.y + 14 && bottom >= p.y && bottom <= p.y + 70) {
        titan.y = p.y - titan.h; titan.vy = 0; titan.grounded = true; titan.coyote = .09; titan.jumpsLeft = maxJumps() - 1; titan.rotation = 0;
        if (!wasGrounded) { attempt.landed++; footDust(8); audio.beep(130, .05); }
        if (p.kind === "boost" && Math.abs(titan.vx) < topSpeed() * .96) { titan.vx += titan.facing * 230; burst(titan.x, titan.y + titan.h, 8); }
        return;
      }
    }
    if (wasGrounded) titan.coyote = .11;
  }
  function setAnim() {
    if (titan.hurt > 0) titan.anim = "hurt";
    else if (!titan.grounded) { if (titan.anim !== "bark_energy_blast") titan.anim = "jump"; titan.rotation = clamp(titan.vy / 1400, -.2, .42); }
    else { titan.rotation = 0; const s = Math.abs(titan.vx); titan.anim = s > 360 ? "run" : s > 50 ? "walk" : "idle"; }
  }
  function checkEntities() {
    const cx = titan.x, cy = titan.y + titan.h * .52;
    for (const e of entities) {
      if (e.hit) continue; const ey = e.y + Math.sin(time * 3 + e.bob) * 6, dx = e.x - cx, dy = ey - cy, rr = e.r + 42;
      if (dx * dx + dy * dy > rr * rr) continue; e.hit = true;
      if (e.type === "bone") { attempt.pickups++; attempt.bonusBones += e.value; attempt.combo++; attempt.bestCombo = Math.max(attempt.bestCombo, attempt.combo); attempt.rocket = Math.min(rocketMax(), attempt.rocket + 9); titan.vx += titan.facing * 28; burst(e.x, ey, 14); audio.beep(880, .08, "triangle"); }
      else if (titan.invuln <= 0) { attempt.hits++; attempt.combo = 0; titan.invuln = .65; titan.hurt = .38; titan.vx *= .76; titan.vy = Math.min(titan.vy, -260); redBurst(e.x, ey, 18); shake = Math.min(22, shake + 8); flash = { color: "rgba(255,80,60,", life: .2, max: .2 }; audio.beep(160, .14, "sawtooth"); message("Mine encaissée", "Elle ralentit Titan, mais tu peux sauver la run."); }
    }
  }

  function updateMeters() {
    const spd = clamp(Math.abs(titan.vx) / (topSpeed() + 580) * 100, 0, 100), jumps = titan.grounded ? maxJumps() : titan.jumpsLeft, rocket = clamp(attempt.rocket / rocketMax() * 100, 0, 100);
    el.speedMeter.value = spd; el.speedText.textContent = `${Math.round(spd)}%`; el.timingMeter.value = clamp(jumps / maxJumps() * 100, 0, 100); el.timingText.textContent = `${jumps}/${maxJumps()}`; el.rocketMeter.value = rocket; el.rocketText.textContent = `${Math.round(rocket)}%`;
  }
  function updateAnim(dt) {
    const a = anim[titan.anim] || anim.idle; if (!a?.frames.length) return; titan.frameT += dt;
    for (const dur = 1 / a.fps; titan.frameT > dur;) { titan.frameT -= dur; titan.frame++; if (titan.frame >= a.frames.length) titan.frame = a.loop ? 0 : a.frames.length - 1; }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H); ctx.save(); if (shake > .5) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);
    drawBackground(); drawPlatforms(); drawEntities(); drawParticles(); drawTitan(); drawHudText(); ctx.restore();
    if (flash) { ctx.fillStyle = `${flash.color}${flash.life / flash.max * .35})`; ctx.fillRect(0, 0, W, H); }
  }
  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#07150d"); g.addColorStop(.5, "#0b2112"); g.addColorStop(1, "#10120c"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.translate(-(cameraX * .18) % 340, 0); for (let x = -340; x < W + 680; x += 340) { ctx.fillStyle = "rgba(98,255,82,.045)"; ctx.beginPath(); ctx.arc(x + 130, 135, 92, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = "rgba(98,255,82,.075)"; ctx.strokeRect(x + 55, 82, 190, 320); } ctx.restore();
  }
  function drawPlatforms() {
    ctx.save(); ctx.translate(-cameraX, 0);
    for (const p of platforms) { if (p.x + p.w < cameraX - 80 || p.x > cameraX + W + 120) continue; const g = ctx.createLinearGradient(0, p.y, 0, p.y + p.h); g.addColorStop(0, p.kind === "boost" ? "#244022" : "#1a2a1c"); g.addColorStop(1, "#0d150f"); ctx.fillStyle = g; roundRect(p.x, p.y, p.w, p.h, 12); ctx.fill(); ctx.strokeStyle = p.kind === "boost" ? "rgba(98,255,82,.75)" : "rgba(98,255,82,.42)"; ctx.lineWidth = p.kind === "boost" ? 4 : 3; ctx.stroke(); if (p.kind === "boost") { ctx.fillStyle = "#62ff52"; ctx.font = "900 16px system-ui"; ctx.textAlign = "center"; ctx.fillText("BOOST", p.x + p.w / 2, p.y - 12); } }
    ctx.restore();
  }
  function drawTitan() {
    const a = anim[titan.anim] || anim.idle, img = a?.frames?.[titan.frame % a.frames.length]; if (!img) return;
    const h = 168, scale = h / img.height, w = img.width * scale, sx = titan.x - cameraX, sy = titan.y + titan.h - h + 16;
    ctx.save(); ctx.translate(sx, sy + h); ctx.rotate(titan.rotation); ctx.scale(titan.facing < 0 ? -1 : 1, 1); if (titan.invuln > 0 && Math.floor(time * 18) % 2 === 0) ctx.globalAlpha = .55; ctx.drawImage(img, -w * .5, -h, w, h); ctx.restore();
  }
  function drawHudText() {
    const dist = Math.max(0, (titan.x - cfg.startX) * cfg.worldScale); ctx.save(); ctx.fillStyle = "rgba(4,14,8,.72)"; roundRect(W - 245, 92, 205, 98, 14); ctx.fill(); ctx.textAlign = "right"; ctx.fillStyle = "#ecfff0"; ctx.font = "900 30px system-ui"; ctx.fillText(`${dist.toFixed(1)} m`, W - 58, 136); ctx.font = "600 13px system-ui"; ctx.fillStyle = "rgba(236,255,240,.65)"; ctx.fillText("distance tentative", W - 58, 156); if (attempt.pickups > 0) { ctx.fillStyle = "#62ff52"; ctx.font = "800 17px system-ui"; ctx.fillText(`+${attempt.bonusBones} os 🦴 ×${attempt.pickups}`, W - 58, 181); } if (attempt.bestCombo > 2) { ctx.fillStyle = "rgba(236,255,240,.8)"; ctx.font = "700 13px system-ui"; ctx.fillText(`meilleur combo ×${attempt.bestCombo}`, W - 58, 202); } ctx.restore();
  }
  function drawEntities() { ctx.save(); ctx.translate(-cameraX, 0); for (const e of entities) { if (e.hit || e.x - cameraX < -80 || e.x - cameraX > W + 80) continue; const y = e.y + Math.sin(time * 3 + e.bob) * 6; e.type === "bone" ? drawBone(e.x, y, e.r) : drawMine(e.x, y, e.r); } ctx.restore(); }
  function drawBone(x, y, r) { ctx.save(); ctx.translate(x, y); ctx.shadowColor = "rgba(98,255,82,.85)"; ctx.shadowBlur = 16; ctx.strokeStyle = "rgba(98,255,82,.45)"; ctx.beginPath(); ctx.arc(0, 0, r + 7, 0, Math.PI * 2); ctx.stroke(); ctx.rotate(-.4); ctx.fillStyle = "#f4fff0"; const bw = r * 1.8, k = r * .42; ctx.beginPath(); ctx.arc(-bw / 2, -k, k, 0, Math.PI * 2); ctx.arc(-bw / 2, k, k, 0, Math.PI * 2); ctx.arc(bw / 2, -k, k, 0, Math.PI * 2); ctx.arc(bw / 2, k, k, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(-bw / 2, -k * .9, bw, k * 1.8); ctx.restore(); }
  function drawMine(x, y, r) { ctx.save(); ctx.translate(x, y); ctx.rotate(time * .8); ctx.shadowColor = "rgba(255,80,60,.62)"; ctx.shadowBlur = 15; ctx.fillStyle = "#ff5b46"; ctx.beginPath(); for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, rad = i % 2 ? r : r * .55; ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); } ctx.closePath(); ctx.fill(); ctx.fillStyle = "#2a0a06"; ctx.beginPath(); ctx.arc(0, 0, r * .32, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
  function burst(x, y, n, color = "rgba(98,255,82,") { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, sp = 90 + Math.random() * 300; particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: .42 + Math.random() * .28, max: .75, r: 4 + Math.random() * 9, color }); } }
  function redBurst(x, y, n) { burst(x, y, n, "rgba(255,90,70,"); }
  function footDust(n = 5) { for (let i = 0; i < n; i++) particles.push({ x: titan.x - titan.facing * 34 + Math.random() * 40 - 20, y: titan.y + titan.h - 4, vx: -titan.facing * (80 + Math.random() * 150), vy: -30 - Math.random() * 60, life: .28, max: .28, r: 3 + Math.random() * 6, color: "rgba(190,190,180," }); }
  function rocketTrail() { for (let i = 0; i < 3; i++) particles.push({ x: titan.x - titan.facing * 46 + Math.random() * 16 - 8, y: titan.y + titan.h * .55 + Math.random() * 42 - 18, vx: -titan.facing * (230 + Math.random() * 260), vy: -60 + Math.random() * 120, life: .32 + Math.random() * .22, max: .55, r: 5 + Math.random() * 11, color: `rgba(${90 + Math.random() * 90},255,80,` }); }
  function updateParticles(dt) { particles.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 260 * dt; p.life -= dt; }); particles = particles.filter(p => p.life > 0); }
  function drawParticles() { ctx.save(); ctx.translate(-cameraX, 0); for (const p of particles) { const a = clamp(p.life / p.max, 0, 1); ctx.fillStyle = `${p.color}${a})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * a, 0, Math.PI * 2); ctx.fill(); } ctx.restore(); }
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); }

  function loop(now) { const dt = Math.min(.033, (now - last) / 1000); last = now; update(dt); requestAnimationFrame(loop); }
  window.addEventListener("keydown", keyDown); window.addEventListener("keyup", keyUp);
  el.resetSave.onclick = () => { if (!confirm("Supprimer la sauvegarde Titan Rocket Run ?")) return; localStorage.removeItem("titanRocketRunSave"); save = loadSave(); updateUI(); resetAttempt(); };
  el.playBtn.onclick = () => { audio.ensure(); audio.resume(); resetAttempt(); el.playBtn.blur(); };
  el.retryBtn.onclick = () => { audio.ensure(); audio.resume(); resetAttempt(); el.retryBtn.blur(); };
  el.muteBtn.onclick = () => { const muted = audio.toggleMute(); el.muteBtn.textContent = muted ? "🔇" : "🔊"; el.muteBtn.setAttribute("aria-pressed", String(muted)); el.muteBtn.blur(); };

  loadAssets().then(() => { platforms.push({ id: 0, x: 0, y: cfg.groundY, w: 920, h: 70, kind: "start" }); furthestX = 920; ensureWorld(); attempt = { rocket: rocketMax(), pickups: 0, bonusBones: 0, bestCombo: 0 }; updateUI(); updateMeters(); message("Prêt ?", "Platformer runner : garde l'élan, enchaîne les plateformes, utilise les doubles sauts et la rocket."); showTitle(); requestAnimationFrame(loop); });
})();
