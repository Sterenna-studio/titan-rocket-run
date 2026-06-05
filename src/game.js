(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;

  const el = {
    best: document.getElementById("bestDistance"),
    coins: document.getElementById("coins"),
    shop: document.getElementById("shop"),
    msg: document.getElementById("message"),
    speedMeter: document.getElementById("speedMeter"),
    speedText: document.getElementById("speedText"),
    timingMeter: document.getElementById("timingMeter"),
    timingText: document.getElementById("timingText"),
    rocketMeter: document.getElementById("rocketMeter"),
    rocketText: document.getElementById("rocketText"),
    resetSave: document.getElementById("resetSave"),
  };

  const upgrades = {
    shoes: { name: "Chaussures", desc: "Plus d'accélération quand tu spammes.", base: 40, max: 8 },
    ramp: { name: "Rampe", desc: "Zone de saut plus large et meilleur angle.", base: 55, max: 8 },
    rocket: { name: "Rocket", desc: "Boost utilisable en plein vol avec Shift.", base: 70, max: 8 },
    cape: { name: "Cape aéro", desc: "Titan perd moins de vitesse en l'air.", base: 45, max: 8 },
    start: { name: "Ligne de départ", desc: "Bonus de vitesse initiale.", base: 35, max: 8 },
  };

  const defaultSave = {
    coins: 0,
    best: 0,
    upgrades: { shoes: 0, ramp: 0, rocket: 0, cape: 0, start: 0 }
  };

  let save = loadSave();
  const images = {};
  const anim = {};
  const keys = new Set();
  let last = performance.now();
  let time = 0;
  let particles = [];
  let state = "ready";
  let runInput = { lastKey: null, combo: 0, spamHeat: 0 };
  let attempt = {};
  let cameraX = 0;

  const config = {
    groundY: 575,
    startX: 120,
    rampX: 850,
    rampW: 150,
    rampH: 58,
    worldScale: 0.09, // px to meters-ish
  };

  const titan = {
    x: config.startX,
    y: config.groundY,
    vx: 0,
    vy: 0,
    facing: 1,
    anim: "idle",
    frame: 0,
    frameT: 0,
    scale: 0.22,
    grounded: true,
    rotation: 0,
  };

  async function loadAssets() {
    const res = await fetch("assets/titan_manifest.json");
    const manifest = await res.json();

    const jobs = [];
    for (const [name, data] of Object.entries(manifest.animations)) {
      anim[name] = { fps: data.fps, loop: data.loop, frames: [] };
      for (const src of data.frames) {
        jobs.push(loadImage(src).then(img => anim[name].frames.push(img)));
      }
    }
    await Promise.all(jobs);
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function loadSave() {
    try {
      const raw = localStorage.getItem("titanRocketRunSave");
      if (!raw) return structuredClone(defaultSave);
      return { ...structuredClone(defaultSave), ...JSON.parse(raw) };
    } catch {
      return structuredClone(defaultSave);
    }
  }

  function writeSave() {
    localStorage.setItem("titanRocketRunSave", JSON.stringify(save));
    updateUI();
  }

  function upgradeCost(id) {
    const u = upgrades[id];
    const lvl = save.upgrades[id] || 0;
    return Math.floor(u.base * Math.pow(1.55, lvl));
  }

  function updateUI() {
    el.best.textContent = `${save.best.toFixed(1)} m`;
    el.coins.textContent = save.coins;
    renderShop();
  }

  function renderShop() {
    el.shop.innerHTML = "";
    Object.entries(upgrades).forEach(([id, u]) => {
      const lvl = save.upgrades[id] || 0;
      const cost = upgradeCost(id);
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = `
        <div class="itemTop">
          <div>
            <h3>${u.name}</h3>
            <small>${u.desc}</small>
          </div>
          <b>Niv. ${lvl}/${u.max}</b>
        </div>
        <button ${lvl >= u.max || save.coins < cost ? "disabled" : ""}>
          ${lvl >= u.max ? "MAX" : `Acheter — ${cost} os`}
        </button>`;
      div.querySelector("button").onclick = () => {
        if (save.coins >= cost && lvl < u.max) {
          save.coins -= cost;
          save.upgrades[id] = lvl + 1;
          writeSave();
          message("Upgrade acheté", `${u.name} niveau ${lvl + 1}.`);
        }
      };
      el.shop.appendChild(div);
    });
  }

  function resetAttempt() {
    Object.assign(titan, {
      x: config.startX, y: config.groundY, vx: 60 + save.upgrades.start * 12,
      vy: 0, anim: "idle", frame: 0, frameT: 0, grounded: true, rotation: 0,
    });
    cameraX = 0;
    particles = [];
    runInput = { lastKey: null, combo: 0, spamHeat: 0 };
    state = "ready";
    attempt = {
      maxSpeed: 0,
      jumpQuality: 0,
      jumped: false,
      landed: false,
      rocket: 55 + save.upgrades.rocket * 16,
      rocketUsed: 0,
      distance: 0,
      reward: 0,
    };
    message("Prêt ?", "Alterne A / D pour courir. Appuie sur Espace dans la zone verte de la rampe.");
  }

  function message(title, body) {
    el.msg.innerHTML = `<b>${title}</b><br>${body}`;
  }

  function startRun() {
    if (state === "ready") {
      state = "runup";
      titan.anim = "run";
      message("Cours !", "Alterne A / D vite, puis Espace sur la rampe.");
    }
  }

  function tryJump() {
    if (state !== "runup") return;
    const rampStart = config.rampX - (70 + save.upgrades.ramp * 7);
    const rampEnd = config.rampX + config.rampW + (70 + save.upgrades.ramp * 7);
    const center = config.rampX + config.rampW * 0.55;
    const dist = Math.abs(titan.x - center);
    const window = Math.max(55, (rampEnd - rampStart) * 0.45);
    const quality = Math.max(0, 1 - dist / window);

    attempt.jumpQuality = quality;
    attempt.jumped = true;
    state = "flight";
    titan.grounded = false;
    titan.anim = "jump";
    titan.vy = -(520 + save.upgrades.ramp * 28 + quality * 260);
    titan.vx *= 0.92 + quality * 0.22;
    titan.y -= 8;

    burst(titan.x, titan.y - 40, quality > .75 ? 30 : 12);
    if (quality > .85) message("Timing parfait !", "Titan prend son envol comme une fusée verte.");
    else if (quality > .45) message("Bon saut", "Pas mal, mais tu peux gratter plus de distance.");
    else message("Saut faible", "Trop tôt ou trop tard : vise la zone verte.");
  }

  function doRocket(dt) {
    if (state !== "flight" || titan.grounded || attempt.rocket <= 0) return;
    const power = 520 + save.upgrades.rocket * 45;
    titan.vx += power * dt;
    titan.vy -= (80 + save.upgrades.rocket * 12) * dt;
    attempt.rocket -= 44 * dt;
    attempt.rocketUsed += 44 * dt;
    titan.anim = "bark_energy_blast";
    for (let i = 0; i < 3; i++) {
      particles.push({
        x: titan.x - 55 + Math.random() * 20,
        y: titan.y - 60 + Math.random() * 50,
        vx: -220 - Math.random() * 260,
        vy: -40 + Math.random() * 80,
        life: .35 + Math.random() * .25,
        max: .55,
        r: 5 + Math.random() * 11,
        color: `rgba(${90 + Math.random()*90},255,80,`
      });
    }
  }

  function finishRun() {
    if (attempt.landed) return;
    attempt.landed = true;
    state = "result";
    titan.anim = "sit_rest";
    const dist = Math.max(0, (titan.x - config.startX) * config.worldScale);
    attempt.distance = dist;
    const reward = Math.max(1, Math.floor(dist * 0.8 + attempt.maxSpeed * 0.02 + attempt.jumpQuality * 20));
    attempt.reward = reward;
    save.coins += reward;
    if (dist > save.best) save.best = dist;
    writeSave();
    message(
      `${dist.toFixed(1)} m !`,
      `+${reward} os. Appuie sur R pour relancer ou améliore Titan dans la boutique.`
    );
  }

  function keyDown(e) {
    const k = e.key.toLowerCase();
    keys.add(k);

    if (k === "r") resetAttempt();
    if (k === " " && (state === "ready" || state === "result")) {
      e.preventDefault();
      resetAttempt();
      startRun();
      return;
    }
    if (k === " ") {
      e.preventDefault();
      tryJump();
      return;
    }

    if ((k === "a" || k === "d") && (state === "ready" || state === "runup")) {
      startRun();
      if (runInput.lastKey !== k) {
        const gain = 34 + save.upgrades.shoes * 5;
        titan.vx += gain;
        runInput.combo++;
        runInput.lastKey = k;
        runInput.spamHeat = Math.min(100, runInput.spamHeat + 9);
        footDust();
      } else {
        titan.vx += 3;
        runInput.spamHeat = Math.min(100, runInput.spamHeat + 18);
      }
    }
  }

  function keyUp(e) {
    keys.delete(e.key.toLowerCase());
  }

  function update(dt) {
    time += dt;

    if (state === "ready") {
      titan.anim = "idle";
      titan.vx *= 0.96;
    }

    if (state === "runup") {
      titan.anim = "run";
      const heatPenalty = runInput.spamHeat > 84 ? 110 : 0;
      titan.vx -= (110 + heatPenalty) * dt;
      titan.vx = clamp(titan.vx, 0, 760 + save.upgrades.shoes * 42 + save.upgrades.start * 25);
      runInput.spamHeat = Math.max(0, runInput.spamHeat - 34 * dt);

      // Auto-fail if too late after ramp
      if (titan.x > config.rampX + config.rampW + 220) {
        state = "flight";
        titan.grounded = false;
        titan.vy = -160;
        titan.vx *= .55;
        message("Trop tard !", "Titan a raté la rampe. R pour recommencer.");
      }
    }

    if (state === "flight") {
      titan.anim = keys.has("shift") && attempt.rocket > 0 ? "bark_energy_blast" : "jump";
      if (keys.has("shift")) doRocket(dt);
      const aero = 0.05 + save.upgrades.cape * 0.007;
      titan.vx *= (1 - aero * dt);
      titan.vy += 960 * dt;
      titan.rotation = clamp(titan.vy / 1200, -0.22, 0.45);

      if (titan.y >= config.groundY && titan.vy > 0) {
        titan.y = config.groundY;
        titan.grounded = true;
        titan.rotation = 0;
        titan.vx *= 0.55;
        burst(titan.x, titan.y - 20, 20);
        finishRun();
      }
    }

    if (state === "result") {
      titan.vx *= Math.pow(0.2, dt);
    }

    titan.x += titan.vx * dt;
    titan.y += titan.vy * dt;
    attempt.maxSpeed = Math.max(attempt.maxSpeed, titan.vx);
    cameraX = Math.max(0, titan.x - 330);

    updateAnim(dt);
    updateParticles(dt);
    updateMeters();
  }

  function updateMeters() {
    const maxV = 760 + save.upgrades.shoes * 42 + save.upgrades.start * 25;
    const spd = clamp(titan.vx / maxV * 100, 0, 100);
    el.speedMeter.value = spd;
    el.speedText.textContent = `${Math.round(spd)}%`;

    const rampCenter = config.rampX + config.rampW * 0.55;
    const dist = Math.abs(titan.x - rampCenter);
    const timing = state === "runup" ? clamp(100 - dist / 2.2, 0, 100) : attempt.jumpQuality * 100;
    el.timingMeter.value = timing;
    el.timingText.textContent = state === "runup" ? (timing > 70 ? "GO" : "—") : `${Math.round(timing)}%`;

    const rocketMax = 55 + save.upgrades.rocket * 16;
    const rocket = clamp(attempt.rocket / rocketMax * 100, 0, 100);
    el.rocketMeter.value = rocket;
    el.rocketText.textContent = `${Math.round(rocket)}%`;
  }

  function updateAnim(dt) {
    const a = anim[titan.anim] || anim.idle;
    if (!a || !a.frames.length) return;
    titan.frameT += dt;
    const dur = 1 / a.fps;
    while (titan.frameT > dur) {
      titan.frameT -= dur;
      titan.frame++;
      if (titan.frame >= a.frames.length) titan.frame = a.loop ? 0 : a.frames.length - 1;
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    drawBackground();
    drawTrack();
    drawParticles(true);
    drawTitan();
    drawParticles(false);
    drawForegroundText();
  }

  function drawBackground() {
    const grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, "#07150d");
    grd.addColorStop(.55, "#0d2412");
    grd.addColorStop(1, "#10120c");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(-cameraX * .25 % 320, 0);
    for (let x = -320; x < W + 640; x += 320) {
      ctx.fillStyle = "rgba(98,255,82,.05)";
      ctx.beginPath();
      ctx.arc(x + 100, 130, 90, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(98,255,82,.08)";
      ctx.strokeRect(x + 40, 80, 180, 320);
    }
    ctx.restore();
  }

  function drawTrack() {
    const ground = config.groundY + 20;
    ctx.save();
    ctx.translate(-cameraX, 0);

    // track
    ctx.fillStyle = "#152017";
    ctx.fillRect(cameraX - 60, ground, W + 140, H - ground);
    ctx.strokeStyle = "rgba(98,255,82,.45)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(cameraX - 60, ground);
    ctx.lineTo(cameraX + W + 80, ground);
    ctx.stroke();

    // distance markers
    ctx.font = "700 18px system-ui";
    ctx.textAlign = "center";
    for (let m = 0; m < 500; m += 10) {
      const x = config.startX + m / config.worldScale;
      if (x < cameraX - 100 || x > cameraX + W + 100) continue;
      ctx.strokeStyle = m % 50 === 0 ? "rgba(98,255,82,.55)" : "rgba(255,255,255,.18)";
      ctx.lineWidth = m % 50 === 0 ? 3 : 1;
      ctx.beginPath();
      ctx.moveTo(x, ground);
      ctx.lineTo(x, ground + (m % 50 === 0 ? 42 : 24));
      ctx.stroke();
      if (m % 50 === 0) {
        ctx.fillStyle = "rgba(236,255,240,.8)";
        ctx.fillText(`${m}m`, x, ground + 68);
      }
    }

    // start line
    ctx.fillStyle = "rgba(255,255,255,.8)";
    ctx.fillRect(config.startX - 8, ground - 78, 16, 78);
    ctx.fillStyle = "#62ff52";
    ctx.fillText("START", config.startX + 36, ground - 88);

    // ramp
    const rx = config.rampX;
    const rw = config.rampW + save.upgrades.ramp * 8;
    const rh = config.rampH + save.upgrades.ramp * 2;
    ctx.fillStyle = "#1a271c";
    ctx.beginPath();
    ctx.moveTo(rx, ground);
    ctx.lineTo(rx + rw, ground);
    ctx.lineTo(rx + rw, ground - rh);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#62ff52";
    ctx.lineWidth = 4;
    ctx.stroke();

    const zoneW = 82 + save.upgrades.ramp * 8;
    ctx.fillStyle = "rgba(98,255,82,.22)";
    ctx.fillRect(rx + rw * .55 - zoneW / 2, ground - rh - 10, zoneW, 10);
    ctx.fillStyle = "#62ff52";
    ctx.font = "800 18px system-ui";
    ctx.fillText("JUMP", rx + rw * .55, ground - rh - 20);

    ctx.restore();
  }

  function drawTitan() {
    const a = anim[titan.anim] || anim.idle;
    const img = a.frames[titan.frame % a.frames.length];
    if (!img) return;

    const targetH = 185;
    const scale = targetH / img.height;
    const w = img.width * scale;
    const h = img.height * scale;
    const sx = titan.x - cameraX;
    const sy = titan.y - h + 22;

    ctx.save();
    ctx.translate(sx, sy + h);
    ctx.rotate(titan.rotation);
    ctx.drawImage(img, -w * .5, -h, w, h);
    ctx.restore();
  }

  function drawForegroundText() {
    const dist = Math.max(0, (titan.x - config.startX) * config.worldScale);
    ctx.save();
    ctx.fillStyle = "rgba(4,14,8,.72)";
    roundRect(ctx, W - 230, 92, 190, 70, 14);
    ctx.fill();
    ctx.fillStyle = "#ecfff0";
    ctx.font = "900 30px system-ui";
    ctx.textAlign = "right";
    ctx.fillText(`${dist.toFixed(1)} m`, W - 58, 138);
    ctx.font = "600 13px system-ui";
    ctx.fillStyle = "rgba(236,255,240,.65)";
    ctx.fillText("distance tentative", W - 58, 158);
    ctx.restore();
  }

  function footDust() {
    for (let i = 0; i < 5; i++) {
      particles.push({
        x: titan.x - 40 + Math.random() * 40,
        y: config.groundY - 6,
        vx: -80 - Math.random() * 150,
        vy: -30 - Math.random() * 60,
        life: .28,
        max: .28,
        r: 3 + Math.random() * 6,
        color: "rgba(190,190,180,"
      });
    }
  }

  function burst(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 100 + Math.random() * 360;
      particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: .45 + Math.random() * .35,
        max: .8,
        r: 4 + Math.random() * 10,
        color: "rgba(98,255,82,"
      });
    }
  }

  function updateParticles(dt) {
    particles.forEach(p => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 280 * dt;
      p.life -= dt;
    });
    particles = particles.filter(p => p.life > 0);
  }

  function drawParticles(behind) {
    ctx.save();
    ctx.translate(-cameraX, 0);
    for (const p of particles) {
      const alpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = `${p.color}${alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * alpha, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.arcTo(x+w, y, x+w, y+h, r);
    ctx.arcTo(x+w, y+h, x, y+h, r);
    ctx.arcTo(x, y+h, x, y, r);
    ctx.arcTo(x, y, x+w, y, r);
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  window.addEventListener("keydown", keyDown);
  window.addEventListener("keyup", keyUp);
  el.resetSave.onclick = () => {
    if (!confirm("Supprimer la sauvegarde Titan Rocket Run ?")) return;
    localStorage.removeItem("titanRocketRunSave");
    save = loadSave();
    resetAttempt();
    updateUI();
  };

  loadAssets().then(() => {
    updateUI();
    resetAttempt();
    requestAnimationFrame(loop);
  });
})();
