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
    muteBtn: document.getElementById("muteBtn"),
    overlay: document.getElementById("overlay"),
    titleScreen: document.getElementById("titleScreen"),
    resultScreen: document.getElementById("resultScreen"),
    playBtn: document.getElementById("playBtn"),
    retryBtn: document.getElementById("retryBtn"),
    resTitle: document.getElementById("resTitle"),
    resDist: document.getElementById("resDist"),
    resSpeed: document.getElementById("resSpeed"),
    resJump: document.getElementById("resJump"),
    resBones: document.getElementById("resBones"),
    resHits: document.getElementById("resHits"),
    resReward: document.getElementById("resReward"),
    resBadge: document.getElementById("resBadge"),
  };

  const upgrades = {
    shoes: { name: "Chaussures", desc: "Plus d'accélération quand tu spammes.", base: 35, max: 8 },
    ramp: { name: "Rampe", desc: "Zone de saut plus large et meilleur angle.", base: 50, max: 8 },
    rocket: { name: "Rocket", desc: "Boost utilisable en plein vol avec Shift.", base: 60, max: 8 },
    cape: { name: "Cape aéro", desc: "Titan perd moins de vitesse en l'air.", base: 40, max: 8 },
    start: { name: "Ligne de départ", desc: "Bonus de vitesse initiale.", base: 30, max: 8 },
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
  let entities = [];
  let shake = 0;
  let flash = null; // { color, life, max }
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
    hurtT: 0,
  };

  const audio = {
    ctx: null,
    master: null,
    muted: false,
    rocketNode: null,
    rocketGain: null,
    ensure() {
      if (this.ctx || this.muted) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
    },
    resume() {
      if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
    },
    blip({ freq = 440, dur = 0.12, type = "sine", to = null, gain = 1 }) {
      if (!this.ctx || this.muted) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g).connect(this.master);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    },
    noise({ dur = 0.2, gain = 0.5, lp = 1200 }) {
      if (!this.ctx || this.muted) return;
      const t = this.ctx.currentTime;
      const len = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const filt = this.ctx.createBiquadFilter();
      filt.type = "lowpass";
      filt.frequency.value = lp;
      const g = this.ctx.createGain();
      g.gain.value = gain;
      src.connect(filt).connect(g).connect(this.master);
      src.start(t);
    },
    jump() { this.blip({ freq: 260, to: 760, dur: 0.22, type: "square", gain: 0.5 }); },
    bone() { this.blip({ freq: 880, to: 1500, dur: 0.13, type: "triangle", gain: 0.4 }); },
    hit() { this.blip({ freq: 200, to: 60, dur: 0.25, type: "sawtooth", gain: 0.5 }); this.noise({ dur: 0.22, gain: 0.4, lp: 800 }); },
    land() { this.noise({ dur: 0.3, gain: 0.6, lp: 600 }); this.blip({ freq: 140, to: 70, dur: 0.2, type: "sine", gain: 0.4 }); },
    rocket(on) {
      if (!this.ctx || this.muted) {
        if (this.rocketNode) this.stopRocket();
        return;
      }
      if (on && !this.rocketNode) {
        const len = Math.floor(this.ctx.sampleRate * 0.5);
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const filt = this.ctx.createBiquadFilter();
        filt.type = "bandpass";
        filt.frequency.value = 480;
        const g = this.ctx.createGain();
        g.gain.value = 0.0001;
        g.gain.linearRampToValueAtTime(0.28, this.ctx.currentTime + 0.05);
        src.connect(filt).connect(g).connect(this.master);
        src.start();
        this.rocketNode = src;
        this.rocketGain = g;
      } else if (!on && this.rocketNode) {
        this.stopRocket();
      }
    },
    stopRocket() {
      if (!this.rocketNode) return;
      try {
        const t = this.ctx.currentTime;
        this.rocketGain.gain.cancelScheduledValues(t);
        this.rocketGain.gain.setValueAtTime(this.rocketGain.gain.value, t);
        this.rocketGain.gain.linearRampToValueAtTime(0.0001, t + 0.08);
        this.rocketNode.stop(t + 0.1);
      } catch { /* already stopped */ }
      this.rocketNode = null;
      this.rocketGain = null;
    },
    toggleMute() {
      this.muted = !this.muted;
      if (this.muted) this.stopRocket();
      if (this.master) this.master.gain.value = this.muted ? 0 : 0.35;
      return this.muted;
    },
  };

  function shakeScreen(amount) { shake = Math.min(26, shake + amount); }
  function flashScreen(color, life = 0.3) { flash = { color, life, max: life }; }

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
    return Math.floor(u.base * Math.pow(1.5, lvl));
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
    titan.hurtT = 0;
    spawnField();
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
      pickups: 0,
      bonusBones: 0,
      hits: 0,
    };
    message("Prêt ?", "Alterne A / D pour courir. Appuie sur Espace dans la zone verte de la rampe.");
    hideOverlay();
  }

  function spawnField() {
    entities = [];
    const fieldStart = config.rampX + 320;
    const fieldEnd = config.rampX + 7200;
    let x = fieldStart;
    while (x < fieldEnd) {
      x += 150 + Math.random() * 230;
      const isObstacle = Math.random() < 0.32;
      // Higher bones are riskier to reach but worth more.
      const height = 70 + Math.random() * 340;
      entities.push({
        x,
        y: config.groundY - height,
        type: isObstacle ? "obstacle" : "bone",
        r: isObstacle ? 28 : 20,
        value: isObstacle ? 0 : Math.round(2 + height / 110),
        hit: false,
        bob: Math.random() * Math.PI * 2,
      });
    }
  }

  function checkEntityCollisions() {
    if (state !== "flight") return;
    const cx = titan.x;
    const cy = titan.y - 70; // approx body center
    for (const e of entities) {
      if (e.hit) continue;
      const dx = e.x - cx;
      const dy = e.y - cy;
      const rr = e.r + 46;
      if (dx * dx + dy * dy > rr * rr) continue;
      e.hit = true;
      if (e.type === "bone") {
        attempt.pickups++;
        attempt.bonusBones += e.value;
        titan.vx += 24;
        burst(e.x, e.y, 14);
        audio.bone();
      } else {
        attempt.hits++;
        titan.vx *= 0.68;
        titan.vy += 230;
        titan.hurtT = 0.4;
        redBurst(e.x, e.y, 22);
        audio.hit();
        shakeScreen(14);
        flashScreen("rgba(255,80,60,", 0.28);
        message("Aïe !", "Titan a percuté un obstacle. Vise les os, évite les mines rouges.");
      }
    }
  }

  function message(title, body) {
    el.msg.innerHTML = `<b>${title}</b><br>${body}`;
  }

  function showTitle() {
    state = "title";
    el.titleScreen.classList.remove("hidden");
    el.resultScreen.classList.add("hidden");
    el.overlay.classList.remove("hidden");
  }

  function showResult() {
    el.titleScreen.classList.add("hidden");
    el.resultScreen.classList.remove("hidden");
    el.resDist.textContent = `${attempt.distance.toFixed(1)} m`;
    el.resSpeed.textContent = Math.round(attempt.maxSpeed);
    el.resJump.textContent = `${Math.round(attempt.jumpQuality * 100)}%`;
    el.resBones.textContent = `${attempt.pickups} (+${attempt.bonusBones})`;
    el.resHits.textContent = attempt.hits;
    el.resReward.textContent = `+${attempt.reward}`;

    const isBest = attempt.distance >= save.best && attempt.distance > 0;
    el.resTitle.textContent = isBest ? "Nouveau record !" : "Run terminé";
    let badge = "";
    if (attempt.jumpQuality > 0.85) badge = "🚀 Décollage parfait";
    else if (attempt.pickups >= 6) badge = "🦴 Chasseur d'os";
    else if (attempt.hits === 0 && attempt.distance > 8) badge = "✨ Run propre";
    if (badge) {
      el.resBadge.textContent = badge;
      el.resBadge.classList.remove("hidden");
    } else {
      el.resBadge.classList.add("hidden");
    }
    el.overlay.classList.remove("hidden");
  }

  function hideOverlay() {
    el.overlay.classList.add("hidden");
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
    audio.jump();
    shakeScreen(8 + quality * 8);
    if (quality > .85) { flashScreen("rgba(98,255,82,", 0.35); }
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
    const reward = Math.max(1, Math.floor(
      dist * 0.8 + attempt.maxSpeed * 0.02 + attempt.jumpQuality * 20 + attempt.bonusBones
    ));
    attempt.reward = reward;
    save.coins += reward;
    if (dist > save.best) save.best = dist;
    writeSave();
    const bonusLine = attempt.pickups > 0
      ? ` (dont +${attempt.bonusBones} de ${attempt.pickups} os ramassés)`
      : "";
    message(
      `${dist.toFixed(1)} m !`,
      `+${reward} os${bonusLine}. Appuie sur R pour relancer ou améliore Titan dans la boutique.`
    );
    showResult();
  }

  function keyDown(e) {
    const k = e.key.toLowerCase();
    keys.add(k);
    audio.ensure();
    audio.resume();

    if (state === "title") {
      if (k === " " || k === "enter") { e.preventDefault(); resetAttempt(); }
      return;
    }

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
      const rocketActive = keys.has("shift") && attempt.rocket > 0;
      titan.anim = rocketActive ? "bark_energy_blast" : "jump";
      if (keys.has("shift")) doRocket(dt);
      audio.rocket(rocketActive);
      const aero = 0.05 + save.upgrades.cape * 0.007;
      titan.vx *= (1 - aero * dt);
      titan.vy += 960 * dt;
      titan.rotation = clamp(titan.vy / 1200, -0.22, 0.45);

      checkEntityCollisions();

      if (titan.y >= config.groundY && titan.vy > 0) {
        titan.y = config.groundY;
        titan.grounded = true;
        titan.rotation = 0;
        titan.vx *= 0.55;
        burst(titan.x, titan.y - 20, 20);
        audio.rocket(false);
        audio.land();
        shakeScreen(12);
        finishRun();
      }
    }

    if (titan.hurtT > 0) {
      titan.hurtT -= dt;
      titan.anim = "hurt";
    }

    if (state === "result") {
      titan.vx *= Math.pow(0.2, dt);
    }

    titan.x += titan.vx * dt;
    titan.y += titan.vy * dt;
    attempt.maxSpeed = Math.max(attempt.maxSpeed, titan.vx);
    cameraX = Math.max(0, titan.x - 330);

    shake = Math.max(0, shake - 60 * dt);
    if (flash) {
      flash.life -= dt;
      if (flash.life <= 0) flash = null;
    }

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
    ctx.save();
    if (shake > 0.5) {
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    }
    drawBackground();
    drawTrack();
    drawEntities();
    drawParticles(true);
    drawTitan();
    drawParticles(false);
    drawForegroundText();
    ctx.restore();

    if (flash) {
      ctx.save();
      ctx.fillStyle = `${flash.color}${(flash.life / flash.max) * 0.4})`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
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

    if ((state === "flight" || state === "result") && attempt.pickups > 0) {
      ctx.fillStyle = "#62ff52";
      ctx.font = "800 18px system-ui";
      ctx.fillText(`+${attempt.bonusBones} os 🦴 ×${attempt.pickups}`, W - 58, 184);
    }
    ctx.restore();
  }

  function drawEntities() {
    ctx.save();
    ctx.translate(-cameraX, 0);
    for (const e of entities) {
      if (e.hit) continue;
      if (e.x - cameraX < -80 || e.x - cameraX > W + 80) continue;
      const ey = e.y + Math.sin(time * 3 + e.bob) * 6;
      if (e.type === "bone") drawBone(e.x, ey, e.r);
      else drawObstacle(e.x, ey, e.r);
    }
    ctx.restore();
  }

  function drawBone(x, y, r) {
    ctx.save();
    ctx.translate(x, y);
    ctx.shadowColor = "rgba(98,255,82,.85)";
    ctx.shadowBlur = 16;
    ctx.strokeStyle = "rgba(98,255,82,.45)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r + 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.rotate(-0.4);
    ctx.fillStyle = "#f4fff0";
    const bw = r * 1.8, knob = r * 0.42;
    ctx.beginPath();
    ctx.arc(-bw / 2, -knob, knob, 0, Math.PI * 2);
    ctx.arc(-bw / 2, knob, knob, 0, Math.PI * 2);
    ctx.arc(bw / 2, -knob, knob, 0, Math.PI * 2);
    ctx.arc(bw / 2, knob, knob, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-bw / 2, -knob * 0.9, bw, knob * 1.8);
    ctx.restore();
  }

  function drawObstacle(x, y, r) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(time * 0.8);
    ctx.shadowColor = "rgba(255,80,60,.7)";
    ctx.shadowBlur = 18;
    ctx.fillStyle = "#ff5b46";
    const spikes = 8;
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const ang = (i / (spikes * 2)) * Math.PI * 2;
      const rad = i % 2 ? r : r * 0.55;
      ctx.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#2a0a06";
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function redBurst(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 90 + Math.random() * 320;
      particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: .4 + Math.random() * .3,
        max: .7,
        r: 4 + Math.random() * 9,
        color: "rgba(255,90,70,"
      });
    }
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

  el.playBtn.onclick = () => { audio.ensure(); audio.resume(); resetAttempt(); el.playBtn.blur(); };
  el.retryBtn.onclick = () => { audio.ensure(); audio.resume(); resetAttempt(); el.retryBtn.blur(); };
  el.muteBtn.onclick = () => {
    audio.ensure();
    const muted = audio.toggleMute();
    el.muteBtn.textContent = muted ? "🔇" : "🔊";
    el.muteBtn.setAttribute("aria-pressed", String(muted));
    el.muteBtn.blur();
  };

  loadAssets().then(() => {
    updateUI();
    resetAttempt();
    showTitle();
    requestAnimationFrame(loop);
  });
})();
