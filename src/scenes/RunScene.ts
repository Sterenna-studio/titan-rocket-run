import Phaser from 'phaser';
import {
  COLORS,
  CRASH_GROUND_Y,
  GAME_HEIGHT,
  GAME_WIDTH,
  GameEvents,
  GROUND_Y,
  LAUNCH_CHARGE_SECONDS,
  LAUNCH_PERFECT_MAX,
  LAUNCH_PERFECT_MIN,
  SKY_Y,
  SPACE_Y,
  START_X,
  WORLD_SCALE,
  clamp,
} from '../game/constants';
import { TitanController } from '../player/TitanController';
import { CollectibleSystem } from '../systems/CollectibleSystem';
import { MineSystem } from '../systems/MineSystem';
import { RUN_MILESTONES, getNextMilestone } from '../systems/RunMilestones';
import { saveSystem } from '../systems/SaveSystem';
import { soundSystem } from '../systems/SoundSystem';
import { upgradeSystem } from '../systems/UpgradeSystem';
import type { HudState, InputState, PlayerSnapshot, RunMilestone, RunStats, RunSummary, VirtualInput, WorldEntity } from '../types/game';
import { ChunkManager } from '../world/ChunkManager';

interface Particle {
  shape: Phaser.GameObjects.Arc;
  vx: number;
  vy: number;
  life: number;
  max: number;
}

interface MissileProjectile {
  sprite: Phaser.GameObjects.Image;
  direction: number;
  speed: number;
  range: number;
  traveled: number;
  radius: number;
  trailTimer: number;
}

interface ParallaxLayer {
  tile: Phaser.GameObjects.TileSprite;
  scrollRatio: number;
  drift: number;
}

interface ImpactMark {
  x: number;
  y: number;
  radius: number;
  power: number;
  life: number;
  max: number;
  seed: number;
}

interface LaunchGrade {
  title: string;
  body: string;
  color: number;
  chargeBonus: number;
  speedBonus: number;
  rocketPercent: number;
}

type KeyMap = Record<'a' | 'q' | 'd' | 'left' | 'right' | 'space' | 'shift' | 'e', Phaser.Input.Keyboard.Key>;

export class RunScene extends Phaser.Scene {
  private seed = '';
  private chunk!: ChunkManager;
  private titan!: TitanController;
  private collect = new CollectibleSystem();
  private mines = new MineSystem();
  private groundGraphics!: Phaser.GameObjects.Graphics;
  private platformGraphics!: Phaser.GameObjects.Graphics;
  private launchGraphics!: Phaser.GameObjects.Graphics;
  private hitboxGraphics!: Phaser.GameObjects.Graphics;
  private debugText!: Phaser.GameObjects.Text;
  private hudText!: Phaser.GameObjects.Text;
  private milestoneBanner!: Phaser.GameObjects.Text;
  private flash!: Phaser.GameObjects.Rectangle;
  private backgroundLayers: ParallaxLayer[] = [];
  private entitySprites = new Map<number, Phaser.GameObjects.Image>();
  private particles: Particle[] = [];
  private missiles: MissileProjectile[] = [];
  private impactMarks: ImpactMark[] = [];
  private keys!: KeyMap;
  private virtualDown = new Set<VirtualInput['key']>();
  private stats!: RunStats;
  private reachedMilestones = new Set<string>();
  private playerStats = upgradeSystem.getPlayerStats();
  private jumpBuffer = 0;
  private boostSoundCooldown = 0;
  private missileCooldown = 0;
  private missileNoticeCooldown = 0;
  private nextOverdriveCombo = 6;
  private launchCharging = true;
  private launchCharge = 0;
  private launchDirection = 1;
  private launchSparkTimer = 0;
  private lastCrashMessageAt = 0;
  private debugVisible = false;
  private hitboxesVisible = false;
  private ended = false;

  constructor() {
    super('RunScene');
  }

  init(data: { seed?: string }): void {
    this.seed = data.seed || this.makeSeed();
  }

  create(): void {
    this.playerStats = upgradeSystem.getPlayerStats();
    this.stats = this.createStats();
    this.reachedMilestones.clear();
    this.launchCharging = true;
    this.launchCharge = 0;
    this.launchSparkTimer = 0;
    this.lastCrashMessageAt = 0;
    this.missileCooldown = 0;
    this.missileNoticeCooldown = 0;
    this.nextOverdriveCombo = 6;
    this.ended = false;
    this.particles = [];
    this.missiles = [];
    this.impactMarks = [];
    this.entitySprites.clear();
    this.virtualDown.clear();
    this.chunk = new ChunkManager(this.seed);

    this.collect.createTextures(this);
    this.mines.createTextures(this);
    this.createMissileTexture();
    this.drawBackground();

    this.groundGraphics = this.add.graphics().setDepth(5);
    this.platformGraphics = this.add.graphics().setDepth(8);
    this.launchGraphics = this.add.graphics().setDepth(65);
    this.hitboxGraphics = this.add.graphics().setDepth(80).setVisible(false);
    this.debugText = this.add
      .text(14, 112, '', {
        color: COLORS.text,
        backgroundColor: 'rgba(4,14,8,.78)',
        fontFamily: 'Consolas, monospace',
        fontSize: '14px',
        lineSpacing: 3,
        padding: { x: 10, y: 8 },
      })
      .setScrollFactor(0)
      .setDepth(100)
      .setVisible(false);
    this.hudText = this.add
      .text(GAME_WIDTH - 46, 92, '', {
        align: 'right',
        color: COLORS.text,
        fontFamily: 'system-ui, sans-serif',
        fontSize: '28px',
        fontStyle: '900',
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(60);
    this.milestoneBanner = this.add
      .text(GAME_WIDTH / 2, 185, '', {
        align: 'center',
        color: COLORS.text,
        backgroundColor: 'rgba(4,14,8,.84)',
        fontFamily: 'system-ui, sans-serif',
        fontSize: '24px',
        fontStyle: '900',
        lineSpacing: 4,
        padding: { x: 18, y: 12 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(75)
      .setAlpha(0);
    this.flash = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0xff503c, 0).setOrigin(0).setScrollFactor(0).setDepth(90);

    this.titan = new TitanController(this, this.playerStats);
    this.cameras.main.setBounds(0, 0, Number.MAX_SAFE_INTEGER, GAME_HEIGHT);
    this.bindInput();
    this.syncEntitySprites(0);
    this.drawPlatforms();
    this.emitHud();
    this.game.events.emit(GameEvents.RunStarted);
    this.game.events.emit(GameEvents.Message, {
      title: 'Charge le depart',
      body: 'Maintiens Espace, relache, puis vise les balises lumineuses pour declencher les recompenses.',
    });
  }

  update(_: number, deltaMs: number): void {
    const dt = Math.min(0.033, deltaMs / 1000);

    if (this.ended) {
      this.updateCamera(dt);
      this.updateBackground();
      this.updateParticles(dt);
      this.updateImpactMarks(dt);
      this.drawPlatforms();
      this.updateDebug();
      return;
    }

    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.boostSoundCooldown = Math.max(0, this.boostSoundCooldown - dt);
    this.missileCooldown = Math.max(0, this.missileCooldown - dt);
    this.missileNoticeCooldown = Math.max(0, this.missileNoticeCooldown - dt);
    this.chunk.ensure(this.cameras.main.scrollX, GAME_WIDTH);

    const input = this.getInputState();
    if (this.launchCharging) {
      this.updateLaunch(dt, input);
      this.updateCamera(dt);
      this.updateBackground();
      this.updateMissiles(dt);
      this.updateParticles(dt);
      this.updateImpactMarks(dt);
      this.drawPlatforms();
      this.updateHudText();
      this.updateDebug();
      this.emitHud();
      return;
    }

    const beforeJump = this.titan.getSnapshot();
    if (this.jumpBuffer > 0 && this.titan.tryJump()) {
      this.jumpBuffer = 0;
      this.stats.jumps += 1;
      const snap = this.titan.getSnapshot();
      soundSystem.jump(!beforeJump.grounded && beforeJump.coyote <= 0);
      this.spawnBurst(snap.x, snap.y + snap.h * 0.68, 14, 0x62ff52);
    }

    const result = this.titan.update(dt, input, this.chunk.platforms);
    let snap = this.titan.getSnapshot();
    if (result.landed) {
      this.stats.landed += 1;
      this.handleLandingImpact(snap, result.impactSpeed);
    }

    const groundImpact = this.titan.crashIntoGround(CRASH_GROUND_Y);
    if (groundImpact > 0) {
      snap = this.titan.getSnapshot();
      this.stats.landed += 1;
      this.stats.combo = 0;
      this.nextOverdriveCombo = 6;
      this.handleLandingImpact(snap, groundImpact, true);
      this.updateStats();
      this.updateCamera(dt);
      this.updateBackground();
      this.updateMissiles(dt);
      this.updateParticles(dt);
      this.updateImpactMarks(dt);
      this.drawPlatforms();
      this.updateHudText();
      this.updateDebug();
      this.emitHud();
      this.finishRun('fall', 720);
      return;
    }

    if (result.bounceUsed) {
      soundSystem.bounce();
      this.spawnBurst(snap.x, snap.y + snap.h, 18, 0x8cfffb);
    }
    if (result.boostPad) {
      if (this.boostSoundCooldown <= 0) {
        soundSystem.boost();
        this.boostSoundCooldown = 0.22;
      }
      this.spawnBurst(snap.x, snap.y + snap.h, 9, 0x62ff52);
    }
    if (result.rocketUsed) {
      this.spawnRocketTrail(snap.x, snap.y + snap.h * 0.5, snap.vx >= 0 ? 1 : -1);
    }

    this.updateMissiles(dt);
    this.handleEntities();
    this.updateStats();
    this.handleMilestones();
    this.updateCamera(dt);
    this.updateBackground();
    this.updateParticles(dt);
    this.updateImpactMarks(dt);
    this.syncEntitySprites(this.time.now / 1000);
    this.drawPlatforms();
    this.updateHudText();
    this.updateDebug();
    this.emitHud();

    if (this.titan.isDead()) {
      this.finishRun();
    }
  }

  private bindInput(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      return;
    }

    keyboard.addCapture([
      Phaser.Input.Keyboard.KeyCodes.SPACE,
      Phaser.Input.Keyboard.KeyCodes.SHIFT,
      Phaser.Input.Keyboard.KeyCodes.E,
      Phaser.Input.Keyboard.KeyCodes.F3,
      Phaser.Input.Keyboard.KeyCodes.F5,
      Phaser.Input.Keyboard.KeyCodes.H,
    ]);

    this.keys = {
      a: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      q: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q),
      d: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      space: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      shift: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT),
      e: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E),
    };

    keyboard.on('keydown-SPACE', (event: KeyboardEvent) => {
      event.preventDefault();
      this.jumpBuffer = 0.13;
    });
    keyboard.on('keyup-SPACE', (event: KeyboardEvent) => {
      event.preventDefault();
      this.titan.releaseJump();
    });
    keyboard.on('keydown-E', (event: KeyboardEvent) => {
      event.preventDefault();
      this.fireMissile();
    });
    keyboard.on('keydown-R', () => this.restartRun(this.seed));
    keyboard.on('keydown-F3', (event: KeyboardEvent) => {
      event.preventDefault();
      this.debugVisible = !this.debugVisible;
      this.debugText.setVisible(this.debugVisible);
    });
    keyboard.on('keydown-F5', (event: KeyboardEvent) => {
      event.preventDefault();
      this.restartRun(this.makeSeed());
    });
    keyboard.on('keydown-H', (event: KeyboardEvent) => {
      event.preventDefault();
      this.hitboxesVisible = !this.hitboxesVisible;
      this.hitboxGraphics.setVisible(this.hitboxesVisible);
    });

    this.game.events.on(GameEvents.VirtualInput, this.handleVirtualInput, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(GameEvents.VirtualInput, this.handleVirtualInput, this);
    });
  }

  private handleVirtualInput(input: VirtualInput): void {
    if (input.down) {
      this.virtualDown.add(input.key);
      if (input.key === 'space') {
        this.jumpBuffer = 0.13;
      } else if (input.key === 'missile') {
        this.fireMissile();
      } else if (input.key === 'r') {
        this.restartRun(this.seed);
      }
      return;
    }

    this.virtualDown.delete(input.key);
    if (input.key === 'space') {
      this.titan.releaseJump();
    }
  }

  private getInputState(): InputState {
    return {
      left: this.keys.a.isDown || this.keys.q.isDown || this.keys.left.isDown || this.virtualDown.has('a'),
      right: this.keys.d.isDown || this.keys.right.isDown || this.virtualDown.has('d'),
      rocket: this.keys.shift.isDown || this.virtualDown.has('shift'),
      missile: this.keys.e.isDown || this.virtualDown.has('missile'),
      jumpHeld: this.keys.space.isDown || this.virtualDown.has('space'),
    };
  }

  private updateLaunch(dt: number, input: InputState): void {
    this.jumpBuffer = 0;
    this.launchDirection = 1;

    if (input.jumpHeld) {
      this.launchCharge = Math.min(LAUNCH_CHARGE_SECONDS, this.launchCharge + dt);
      this.launchSparkTimer -= dt;
      if (this.launchSparkTimer <= 0) {
        this.spawnLaunchSparks(clamp(this.launchCharge / LAUNCH_CHARGE_SECONDS, 0, 1));
        this.launchSparkTimer = 0.08;
      }
    } else if (this.launchCharge > 0) {
      this.fireChargedLaunch();
    } else {
      this.launchSparkTimer = 0;
    }

    this.drawLaunchMeter();
  }

  private fireChargedLaunch(): void {
    const charge = clamp(this.launchCharge / LAUNCH_CHARGE_SECONDS, 0, 1);
    const grade = this.getLaunchGrade(charge);
    const effectiveCharge = clamp(charge + grade.chargeBonus, 0, 1);
    const snap = this.titan.getSnapshot();

    this.launchCharging = false;
    this.launchCharge = 0;
    this.launchGraphics.clear();
    this.titan.launch(effectiveCharge, this.launchDirection);
    if (grade.speedBonus > 0 || grade.rocketPercent > 0) {
      this.titan.awardRunReward(grade.rocketPercent, grade.speedBonus);
    }
    this.stats.jumps += 1;
    soundSystem.launch(effectiveCharge);
    this.spawnBurst(snap.x, snap.y + snap.h, 12 + Math.round(effectiveCharge * 22), grade.color);
    this.game.events.emit(GameEvents.Message, {
      title: grade.title,
      body: grade.body,
    });
  }

  private getLaunchGrade(charge: number): LaunchGrade {
    if (charge >= LAUNCH_PERFECT_MIN && charge <= LAUNCH_PERFECT_MAX) {
      return {
        title: 'Depart parfait !',
        body: 'Timing dans la zone verte : vitesse bonus, rocket chargee et trajectoire haute.',
        color: 0x8cfffb,
        chargeBonus: 0.12,
        speedBonus: 210,
        rocketPercent: 12,
      };
    }

    if (charge > LAUNCH_PERFECT_MAX) {
      return {
        title: 'Depart brutal',
        body: "Trop de pression : gros saut, mais garde le controle a l'atterrissage.",
        color: 0xffd36a,
        chargeBonus: 0.04,
        speedBonus: 70,
        rocketPercent: 4,
      };
    }

    if (charge > 0.48) {
      return {
        title: 'Bon depart',
        body: "Garde l'elan, double-saute, rebondis avec les bottes et surveille l'altitude.",
        color: COLORS.green,
        chargeBonus: 0.03,
        speedBonus: 60,
        rocketPercent: 0,
      };
    }

    return {
      title: 'Depart court',
      body: 'Recharge plus longtemps pour viser la zone verte et gagner un vrai bonus.',
      color: 0xff5b46,
      chargeBonus: 0,
      speedBonus: 0,
      rocketPercent: 0,
    };
  }

  private handleEntities(): void {
    const time = this.time.now / 1000;
    const player = this.titan.getCollisionCircle();

    for (const bone of this.collect.findCollected(player, this.chunk.entities, time)) {
      this.chunk.markEntityHit(bone.id);
      this.addCombo(1, bone.x, bone.y);
      const comboBonus = Math.floor(this.stats.combo / 4);
      const earnedBones = bone.value + comboBonus;
      this.titan.collectBone(earnedBones);
      this.stats.pickups += 1;
      this.stats.bonusBones += earnedBones;
      soundSystem.collect();
      this.spawnBurst(bone.x, bone.y, 14 + comboBonus * 2, comboBonus > 0 ? 0xffd36a : 0x62ff52);
      if (comboBonus > 0 && this.stats.combo % 4 === 0) {
        this.game.events.emit(GameEvents.Message, {
          title: `Combo x${this.stats.combo}`,
          body: `Bonus serie : +${comboBonus} os sur chaque ramassage.`,
        });
      }
    }

    for (const mine of this.mines.findHits(player, this.chunk.entities, time)) {
      if (!this.titan.applyMineHit()) {
        continue;
      }
      this.chunk.markEntityHit(mine.id);
      this.stats.hits += 1;
      this.stats.combo = 0;
      this.nextOverdriveCombo = 6;
      soundSystem.mine();
      this.spawnBurst(mine.x, mine.y, 18, 0xff5b46);
      this.cameras.main.shake(160, 0.006);
      this.flash.setAlpha(0.24);
      this.flash.setFillStyle(0xff503c, 1);
      this.tweens.add({ targets: this.flash, alpha: 0, duration: 180 });
      this.game.events.emit(GameEvents.Message, {
        title: 'Mine encaissee',
        body: 'Elle ralentit Titan, mais tu peux sauver la run.',
      });
    }

    this.handleMineGrazes(player, time);
  }

  private handleMineGrazes(player: { x: number; y: number; r: number }, time: number): void {
    for (const mine of this.chunk.entities) {
      if (mine.hit || mine.grazed || mine.type !== 'mine') {
        continue;
      }

      const y = mine.y + Math.sin(time * 3 + mine.bob) * 6;
      const dx = mine.x - player.x;
      const dy = y - player.y;
      const distanceSq = dx * dx + dy * dy;
      const hitRadius = mine.r + player.r;
      const grazeRadius = hitRadius + 54;
      if (distanceSq <= hitRadius * hitRadius || distanceSq > grazeRadius * grazeRadius) {
        continue;
      }

      const bonus = 4 + Math.min(8, Math.floor(this.stats.combo / 4));
      this.chunk.markEntityGrazed(mine.id);
      this.stats.riskDodges += 1;
      this.stats.bonusBones += bonus;
      this.addCombo(2, mine.x, y);
      this.titan.awardRunReward(8, 135);
      soundSystem.dodge();
      this.spawnBurst(mine.x, y, 18, 0x8cfffb);
      this.spawnGrazeRing(mine.x, y);
      this.game.events.emit(GameEvents.Message, {
        title: `Esquive street +${bonus} os`,
        body: 'Mine frolee sans contact : boost gratuit, combo garde et trajectoire relancee.',
      });
    }
  }

  private addCombo(amount: number, x: number, y: number): void {
    this.stats.combo += amount;
    this.stats.bestCombo = Math.max(this.stats.bestCombo, this.stats.combo);
    this.checkComboOverdrive(x, y);
  }

  private checkComboOverdrive(x: number, y: number): void {
    if (this.stats.combo < this.nextOverdriveCombo) {
      return;
    }

    const threshold = this.nextOverdriveCombo;
    this.nextOverdriveCombo += 6;
    this.stats.overdrives += 1;
    const rewardBones = 6 + Math.floor(threshold / 3);
    this.stats.bonusBones += rewardBones;
    this.titan.awardRunReward(18, 260 + threshold * 8);
    soundSystem.overdrive();
    this.spawnBurst(x, y, 30, 0xffd36a);
    this.cameras.main.shake(90, 0.003);
    this.game.events.emit(GameEvents.Message, {
      title: `Overdrive combo x${threshold}`,
      body: `+${rewardBones} os, rocket rechargee et vitesse bonus. Continue la chaine.`,
    });
  }

  private fireMissile(): void {
    if (this.ended || this.launchCharging) {
      return;
    }

    if (this.playerStats.missileLevel <= 0) {
      this.showMissileNotice('Missile verrouille', 'Achete Missile Titan dans la boutique pour nettoyer les mines.');
      return;
    }

    if (this.missileCooldown > 0) {
      this.showMissileNotice('Missile en recharge', `Encore ${Math.ceil(this.missileCooldown)}s avant le prochain tir.`);
      return;
    }

    const snap = this.titan.getSnapshot();
    const direction = snap.vx < -80 ? -1 : 1;
    this.missileCooldown = this.playerStats.missileCooldown;
    this.launchForwardMissile(snap, direction);
    soundSystem.missile();
    this.game.events.emit(GameEvents.Message, {
      title: 'Missile Titan lance',
      body: "Gros missile vers l'avant : aligne Titan avec une mine pour l'explosion.",
    });
  }

  private launchForwardMissile(snap: PlayerSnapshot, direction: number): void {
    const x = snap.x + direction * (snap.w * 0.72);
    const y = snap.y + snap.h * 0.42;
    const sprite = this.add.image(x, y, 'titan-forward-missile').setDepth(73);
    sprite.setFlipX(direction < 0);
    sprite.setScale(1.2 + this.playerStats.missileLevel * 0.1);
    sprite.setRotation(0);

    this.missiles.push({
      sprite,
      direction,
      speed: 1760 + this.playerStats.missileLevel * 170 + Math.min(520, Math.abs(snap.vx) * 0.22),
      range: this.playerStats.missileRange + 520,
      traveled: 0,
      radius: 42 + this.playerStats.missileLevel * 4,
      trailTimer: 0,
    });

    this.spawnMissileTrail(x - direction * 42, y, direction, 12);
  }

  private showMissileNotice(title: string, body: string): void {
    if (this.missileNoticeCooldown > 0) {
      return;
    }

    this.missileNoticeCooldown = 0.9;
    this.game.events.emit(GameEvents.Message, { title, body });
  }

  private updateMissiles(dt: number): void {
    for (let i = this.missiles.length - 1; i >= 0; i -= 1) {
      const missile = this.missiles[i];
      const move = missile.speed * dt;
      missile.traveled += move;
      missile.sprite.x += missile.direction * move;
      missile.sprite.y += Math.sin(this.time.now / 75 + i) * 0.42;
      missile.trailTimer -= dt;

      if (missile.trailTimer <= 0) {
        this.spawnMissileTrail(missile.sprite.x - missile.direction * 58, missile.sprite.y, missile.direction, 4);
        missile.trailTimer = 0.035;
      }

      const target = this.findMissileImpact(missile);
      if (target) {
        this.explodeMissile(missile, target);
        this.missiles.splice(i, 1);
        continue;
      }

      if (missile.traveled >= missile.range || Math.abs(missile.sprite.x - this.cameras.main.scrollX) > GAME_WIDTH + 360) {
        this.explodeMissile(missile);
        this.missiles.splice(i, 1);
      }
    }
  }

  private findMissileImpact(missile: MissileProjectile): WorldEntity | undefined {
    return this.chunk.entities.find((entity) => {
      if (entity.hit || entity.type !== 'mine') {
        return false;
      }

      const dx = entity.x - missile.sprite.x;
      const dy = entity.y - missile.sprite.y;
      const radius = entity.r + missile.radius;
      return dx * dx + dy * dy <= radius * radius;
    });
  }

  private explodeMissile(missile: MissileProjectile, target?: WorldEntity): void {
    const x = target?.x ?? missile.sprite.x;
    const y = target?.y ?? missile.sprite.y;
    missile.sprite.destroy();

    if (!target) {
      this.spawnBurst(x, y, 14, 0xffd36a);
      this.cameras.main.shake(70, 0.002);
      return;
    }

    this.chunk.markEntityHit(target.id);
    this.addCombo(3, target.x, target.y);
    this.stats.pickups += 1;
    this.stats.bonusBones += this.playerStats.missileRewardBones;
    soundSystem.mine();
    this.spawnBurst(target.x, target.y, 28 + this.playerStats.missileLevel * 5, 0xffd36a);
    this.spawnBurst(target.x - missile.direction * 44, target.y, 16, 0x8cfffb);
    this.cameras.main.shake(155, 0.005);
    this.flash.setFillStyle(0xffd36a, 1);
    this.flash.setAlpha(0.16);
    this.tweens.add({ targets: this.flash, alpha: 0, duration: 190 });
    this.game.events.emit(GameEvents.Message, {
      title: `Impact missile +${this.playerStats.missileRewardBones} os`,
      body: 'Mine explosee par le gros missile. Le combo repart vers l’avant.',
    });
  }

  private updateStats(): void {
    const snap = this.titan.getSnapshot();
    this.stats.distance = this.titan.getDistanceMeters();
    this.stats.maxSpeed = Math.max(this.stats.maxSpeed, Math.abs(snap.vx));
  }

  private handleMilestones(): void {
    for (const milestone of RUN_MILESTONES) {
      if (this.reachedMilestones.has(milestone.id) || this.stats.distance < milestone.distance) {
        continue;
      }

      this.triggerMilestone(milestone);
    }
  }

  private triggerMilestone(milestone: RunMilestone): void {
    this.reachedMilestones.add(milestone.id);
    this.stats.storyEvents += 1;
    this.stats.bonusBones += milestone.rewardBones;
    this.stats.pickups += 1;
    const snap = this.titan.getSnapshot();
    this.addCombo(2, snap.x, snap.y + snap.h * 0.45);
    this.stats.bestMilestone = milestone.badge || milestone.title;

    this.titan.awardRunReward(milestone.rocketPercent, milestone.speedBoost);
    soundSystem.milestone();
    this.spawnBurst(snap.x, snap.y + snap.h * 0.45, 28, milestone.color);
    this.spawnBurst(this.getMilestoneWorldX(milestone), Math.max(80, snap.y), 20, milestone.color);
    this.cameras.main.flash(180, 255, 255, 255, false);
    this.game.events.emit(GameEvents.Message, {
      title: `${milestone.title} +${milestone.rewardBones} os`,
      body: milestone.body,
    });
    this.showMilestoneBanner(milestone);
  }

  private showMilestoneBanner(milestone: RunMilestone): void {
    this.milestoneBanner.setText(`${milestone.title}\n+${milestone.rewardBones} os  •  rocket +${milestone.rocketPercent}%`);
    this.milestoneBanner.setTint(milestone.color);
    this.milestoneBanner.setAlpha(0);
    this.milestoneBanner.setScale(0.92);
    this.tweens.killTweensOf(this.milestoneBanner);
    this.tweens.add({
      targets: this.milestoneBanner,
      alpha: 1,
      scale: 1,
      duration: 150,
      ease: 'Back.Out',
      yoyo: true,
      hold: 1300,
    });
  }

  private getMilestoneWorldX(milestone: RunMilestone): number {
    return START_X + milestone.distance / WORLD_SCALE;
  }

  private updateCamera(dt: number): void {
    const snap = this.titan.getSnapshot();
    const anticipation = clamp(snap.vx * 0.12, -70, 160);
    const target = Math.max(0, snap.x - GAME_WIDTH * 0.34 + anticipation);
    const next = this.cameras.main.scrollX + (target - this.cameras.main.scrollX) * Math.min(1, dt * 7);
    this.cameras.main.setScroll(next, 0);
  }

  private drawBackground(): void {
    this.createBackgroundTextures();
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x07150d).setOrigin(0).setScrollFactor(0).setDepth(-30);
    this.add.tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, 'bg-gradient').setOrigin(0).setScrollFactor(0).setDepth(-29);

    this.backgroundLayers = [
      { tile: this.add.tileSprite(0, 0, GAME_WIDTH, SPACE_Y + 32, 'bg-stars').setOrigin(0).setScrollFactor(0).setDepth(-28), scrollRatio: 0.06, drift: 4 },
      { tile: this.add.tileSprite(0, SPACE_Y + 38, GAME_WIDTH, 340, 'bg-clouds').setOrigin(0).setScrollFactor(0).setDepth(-27), scrollRatio: 0.12, drift: 9 },
      { tile: this.add.tileSprite(0, SKY_Y - 185, GAME_WIDTH, 560, 'bg-far-structures').setOrigin(0).setScrollFactor(0).setDepth(-26), scrollRatio: 0.22, drift: 0 },
      { tile: this.add.tileSprite(0, GROUND_Y - 565, GAME_WIDTH, 520, 'bg-near-structures').setOrigin(0).setScrollFactor(0).setDepth(-25), scrollRatio: 0.38, drift: 0 },
      { tile: this.add.tileSprite(0, CRASH_GROUND_Y - 315, GAME_WIDTH, 340, 'bg-ground-haze').setOrigin(0).setScrollFactor(0).setDepth(-24), scrollRatio: 0.62, drift: 0 },
    ];
    this.updateBackground();
  }

  private updateBackground(): void {
    const scrollX = this.cameras.main.scrollX;
    const driftTime = this.time.now / 1000;

    for (const layer of this.backgroundLayers) {
      layer.tile.tilePositionX = scrollX * layer.scrollRatio + driftTime * layer.drift;
    }
  }

  private createBackgroundTextures(): void {
    this.createGradientTexture();
    this.createStarsTexture();
    this.createCloudsTexture();
    this.createFarStructuresTexture();
    this.createNearStructuresTexture();
    this.createGroundHazeTexture();
  }

  private createMissileTexture(): void {
    if (this.textures.exists('titan-forward-missile')) {
      return;
    }

    const graphics = this.add.graphics().setVisible(false);
    graphics.fillStyle(0x071009, 0.55);
    graphics.fillEllipse(78, 34, 118, 34);
    graphics.fillStyle(0xecfff0, 1);
    graphics.fillRoundedRect(22, 18, 96, 28, 14);
    graphics.fillStyle(0xffd36a, 1);
    graphics.fillTriangle(112, 12, 156, 32, 112, 52);
    graphics.fillStyle(0x8cfffb, 0.9);
    graphics.fillRoundedRect(42, 24, 42, 8, 4);
    graphics.fillStyle(0xff5b46, 1);
    graphics.fillTriangle(30, 18, 10, 8, 22, 30);
    graphics.fillTriangle(30, 46, 10, 56, 22, 34);
    graphics.fillStyle(0xffd36a, 0.82);
    graphics.fillTriangle(18, 22, 0, 32, 18, 42);
    graphics.lineStyle(4, 0x62ff52, 0.58);
    graphics.strokeRoundedRect(22, 18, 96, 28, 14);
    graphics.generateTexture('titan-forward-missile', 166, 64);
    graphics.destroy();
  }

  private createGradientTexture(): void {
    if (this.textures.exists('bg-gradient')) {
      return;
    }

    const graphics = this.add.graphics().setVisible(false);
    graphics.fillStyle(0x02040b, 1);
    graphics.fillRect(0, 0, GAME_WIDTH, SPACE_Y + 28);
    graphics.fillStyle(0x061a28, 1);
    graphics.fillRect(0, SPACE_Y + 28, GAME_WIDTH, SKY_Y - SPACE_Y + 68);
    graphics.fillStyle(0x0b2112, 1);
    graphics.fillRect(0, SKY_Y + 96, GAME_WIDTH, GAME_HEIGHT - SKY_Y - 96);
    graphics.fillStyle(0x0f2110, 0.72);
    graphics.fillRect(0, GROUND_Y - 210, GAME_WIDTH, GAME_HEIGHT - GROUND_Y + 210);
    graphics.generateTexture('bg-gradient', GAME_WIDTH, GAME_HEIGHT);
    graphics.destroy();
  }

  private createStarsTexture(): void {
    if (this.textures.exists('bg-stars')) {
      return;
    }

    const graphics = this.add.graphics().setVisible(false);
    for (let i = 0; i < 76; i += 1) {
      const x = (i * 83) % GAME_WIDTH;
      const y = 9 + ((i * 47) % 104);
      const alpha = i % 4 === 0 ? 0.86 : 0.48;
      graphics.fillStyle(0xe9fff0, alpha);
      graphics.fillCircle(x, y, i % 9 === 0 ? 2 : 1);
    }
    graphics.lineStyle(1, 0x65d9ff, 0.12);
    for (let x = 0; x < GAME_WIDTH; x += 220) {
      graphics.lineBetween(x + 24, 92, x + 128, 38);
    }
    graphics.generateTexture('bg-stars', GAME_WIDTH, SPACE_Y + 32);
    graphics.destroy();
  }

  private createCloudsTexture(): void {
    if (this.textures.exists('bg-clouds')) {
      return;
    }

    const graphics = this.add.graphics().setVisible(false);
    const cloudRows = [
      { y: 54, color: 0xc8fbff, alpha: 0.13, step: 260 },
      { y: 148, color: 0x8cfffb, alpha: 0.1, step: 340 },
      { y: 230, color: 0xf0fff4, alpha: 0.07, step: 300 },
    ];

    for (const row of cloudRows) {
      graphics.fillStyle(row.color, row.alpha);
      for (let x = -80; x < GAME_WIDTH + 180; x += row.step) {
        graphics.fillEllipse(x + 64, row.y, 176, 24);
        graphics.fillEllipse(x + 150, row.y + 18, 220, 30);
      }
    }

    graphics.generateTexture('bg-clouds', GAME_WIDTH, 340);
    graphics.destroy();
  }

  private createFarStructuresTexture(): void {
    if (this.textures.exists('bg-far-structures')) {
      return;
    }

    const graphics = this.add.graphics().setVisible(false);
    graphics.fillStyle(COLORS.green, 0.035);
    for (let x = -120; x < GAME_WIDTH + 260; x += 280) {
      graphics.fillCircle(x + 140, 78, 112);
      graphics.fillRoundedRect(x + 76, 158, 128, 384, 22);
    }
    graphics.lineStyle(2, COLORS.green, 0.075);
    for (let x = -60; x < GAME_WIDTH + 260; x += 300) {
      graphics.strokeRoundedRect(x + 35, 132, 190, 442, 18);
    }
    graphics.generateTexture('bg-far-structures', GAME_WIDTH, 560);
    graphics.destroy();
  }

  private createNearStructuresTexture(): void {
    if (this.textures.exists('bg-near-structures')) {
      return;
    }

    const graphics = this.add.graphics().setVisible(false);
    const textureHeight = 520;
    graphics.fillStyle(0x0a2a17, 0.42);
    for (let x = -100; x < GAME_WIDTH + 180; x += 180) {
      const height = 220 + ((x + 700) % 5) * 36;
      graphics.fillRoundedRect(x, textureHeight - height, 88, height, 18);
      graphics.fillCircle(x + 44, textureHeight - height + 8, 54);
    }
    graphics.lineStyle(2, 0x65d9ff, 0.12);
    for (let x = 0; x < GAME_WIDTH + 120; x += 240) {
      graphics.lineBetween(x, 382, x + 80, 268);
      graphics.lineBetween(x + 80, 268, x + 180, 366);
    }
    graphics.generateTexture('bg-near-structures', GAME_WIDTH, textureHeight);
    graphics.destroy();
  }

  private createGroundHazeTexture(): void {
    if (this.textures.exists('bg-ground-haze')) {
      return;
    }

    const graphics = this.add.graphics().setVisible(false);
    graphics.fillStyle(0x62ff52, 0.055);
    for (let x = -80; x < GAME_WIDTH + 120; x += 170) {
      graphics.fillEllipse(x + 90, 80, 220, 38);
      graphics.fillRect(x + 26, 88, 130, 122);
    }
    graphics.lineStyle(2, 0xffd36a, 0.08);
    for (let x = -40; x < GAME_WIDTH + 160; x += 210) {
      graphics.strokeRoundedRect(x, 52, 140, 170, 16);
    }
    graphics.generateTexture('bg-ground-haze', GAME_WIDTH, 340);
    graphics.destroy();
  }

  private drawPlatforms(): void {
    this.drawGround();
    this.platformGraphics.clear();
    for (const platform of this.chunk.platforms) {
      const color = platform.kind === 'boost' ? COLORS.boost : platform.kind === 'start' ? 0x26321b : this.getBiomePlatformColor(platform.x);
      const accent = platform.kind === 'boost' ? COLORS.green : platform.kind === 'start' ? 0xffd36a : this.getBiomeAccentColor(platform.x);
      this.platformGraphics.fillStyle(color, 1);
      this.platformGraphics.fillRoundedRect(platform.x, platform.y, platform.w, platform.h, 12);
      this.platformGraphics.lineStyle(platform.kind === 'boost' ? 4 : 3, accent, platform.kind === 'boost' ? 0.75 : 0.42);
      this.platformGraphics.strokeRoundedRect(platform.x, platform.y, platform.w, platform.h, 12);
      if (platform.kind === 'start') {
        this.platformGraphics.fillStyle(0xffd36a, 0.16);
        this.platformGraphics.fillRoundedRect(platform.x + 24, platform.y + 10, platform.w - 48, 8, 4);
      }
    }
    this.drawImpactMarks();
    this.drawMilestoneBeacons();
  }

  private drawGround(): void {
    const cameraX = this.cameras.main.scrollX;
    const viewX = cameraX - 120;
    const width = GAME_WIDTH + 240;
    const top = CRASH_GROUND_Y;
    const startX = Math.floor(viewX / 96) * 96;
    const endX = viewX + width + 96;

    this.groundGraphics.clear();
    this.groundGraphics.fillStyle(0x071009, 1);
    this.groundGraphics.fillRect(viewX, top, width, GAME_HEIGHT - top + 80);
    this.groundGraphics.fillStyle(0x123017, 0.9);
    for (let x = startX; x < endX; x += 96) {
      const crest = top + Math.sin(x * 0.013) * 7 + Math.sin(x * 0.031) * 5;
      this.groundGraphics.fillTriangle(x, top + 34, x + 48, crest, x + 96, top + 34);
    }
    this.groundGraphics.lineStyle(3, COLORS.green, 0.28);
    this.groundGraphics.lineBetween(viewX, top, viewX + width, top);
    this.groundGraphics.lineStyle(2, 0xffd36a, 0.12);
    for (let x = startX; x < endX; x += 144) {
      const y = top + 38 + Math.sin(x * 0.021) * 10;
      this.groundGraphics.lineBetween(x, y, x + 62, y + 18);
      this.groundGraphics.lineBetween(x + 62, y + 18, x + 112, y + 5);
    }
  }

  private drawMilestoneBeacons(): void {
    const cameraX = this.cameras.main.scrollX;
    for (const milestone of RUN_MILESTONES) {
      if (this.reachedMilestones.has(milestone.id)) {
        continue;
      }

      const x = this.getMilestoneWorldX(milestone);
      if (x < cameraX - 160 || x > cameraX + GAME_WIDTH + 320) {
        continue;
      }

      const beaconY = SPACE_Y + 48;
      const pulse = 0.62 + Math.sin(this.time.now / 180) * 0.2;
      this.platformGraphics.lineStyle(3, milestone.color, pulse);
      this.platformGraphics.lineBetween(x, beaconY, x, GROUND_Y - 36);
      this.platformGraphics.fillStyle(milestone.color, 0.22 + pulse * 0.22);
      this.platformGraphics.fillCircle(x, beaconY, 24);
      this.platformGraphics.fillStyle(milestone.color, 0.92);
      this.platformGraphics.fillTriangle(x - 12, beaconY, x + 18, beaconY - 12, x + 18, beaconY + 12);
    }
  }

  private getBiomePlatformColor(x: number): number {
    return [COLORS.platform, 0x172638, 0x2a2440, 0x302514][this.getBiomeIndex(x)];
  }

  private getBiomeAccentColor(x: number): number {
    return [COLORS.green, 0x65d9ff, 0xd6a0ff, 0xffd36a][this.getBiomeIndex(x)];
  }

  private getBiomeIndex(x: number): number {
    return Math.floor(Math.max(0, x) / 2200) % 4;
  }

  private drawLaunchMeter(): void {
    this.launchGraphics.clear();
    if (!this.launchCharging) {
      return;
    }

    const ratio = clamp(this.launchCharge / LAUNCH_CHARGE_SECONDS, 0, 1);
    const grade = this.getLaunchGrade(ratio);
    const x = START_X - 102;
    const y = GROUND_Y - 252;
    const width = 260;
    const barW = width - 18;
    const pulse = 0.72 + Math.sin(this.time.now / 95) * 0.18;
    const perfectX = x + 9 + barW * LAUNCH_PERFECT_MIN;
    const perfectW = barW * (LAUNCH_PERFECT_MAX - LAUNCH_PERFECT_MIN);
    const arrowBaseX = START_X + 18;
    const arrowBaseY = GROUND_Y - 50;
    const arrowLength = 174 + ratio * 220;
    const arrowLift = 58 + ratio * 145;

    this.launchGraphics.fillStyle(0xffd36a, 0.08 + ratio * 0.12);
    this.launchGraphics.fillCircle(START_X, GROUND_Y - 18, 42 + ratio * 38);
    this.launchGraphics.lineStyle(5, grade.color, 0.35 + ratio * 0.35);
    this.launchGraphics.lineBetween(arrowBaseX, arrowBaseY, arrowBaseX + arrowLength, arrowBaseY - arrowLift);
    this.launchGraphics.fillStyle(grade.color, 0.72);
    this.launchGraphics.fillTriangle(
      arrowBaseX + arrowLength + 16,
      arrowBaseY - arrowLift - 6,
      arrowBaseX + arrowLength - 12,
      arrowBaseY - arrowLift - 18,
      arrowBaseX + arrowLength - 4,
      arrowBaseY - arrowLift + 16,
    );

    this.launchGraphics.fillStyle(0x041108, 0.92);
    this.launchGraphics.fillRoundedRect(x, y, width, 34, 12);
    this.launchGraphics.lineStyle(2, COLORS.green, 0.58);
    this.launchGraphics.strokeRoundedRect(x, y, width, 34, 12);
    this.launchGraphics.fillStyle(0x0f2f18, 1);
    this.launchGraphics.fillRoundedRect(x + 9, y + 10, barW, 14, 7);
    this.launchGraphics.fillStyle(0x8cfffb, 0.25 + pulse * 0.28);
    this.launchGraphics.fillRoundedRect(perfectX, y + 8, perfectW, 18, 9);
    this.launchGraphics.fillStyle(grade.color, 0.95);
    this.launchGraphics.fillRoundedRect(x + 9, y + 10, barW * ratio, 14, 7);
    this.launchGraphics.lineStyle(3, grade.color, 0.85);
    this.launchGraphics.lineBetween(x + 9 + barW * ratio, y + 5, x + 9 + barW * ratio, y + 30);

    for (let i = 0; i < 5; i += 1) {
      const lit = ratio >= (i + 1) / 5;
      this.launchGraphics.fillStyle(lit ? grade.color : COLORS.green, lit ? 0.9 : 0.18);
      this.launchGraphics.fillCircle(x + 28 + i * 48, y + 52, lit ? 8 : 6);
    }
  }

  private syncEntitySprites(time: number): void {
    const activeIds = new Set<number>();
    for (const entity of this.chunk.entities) {
      if (entity.hit) {
        continue;
      }

      activeIds.add(entity.id);
      let sprite = this.entitySprites.get(entity.id);
      if (!sprite) {
        sprite = entity.type === 'bone' ? this.collect.createBone(this, entity) : this.mines.createMine(this, entity);
        this.entitySprites.set(entity.id, sprite);
      }
      sprite.setPosition(entity.x, entity.y + Math.sin(time * 3 + entity.bob) * 6);
      if (entity.type === 'mine') {
        sprite.rotation += 0.015;
        sprite.setAlpha(entity.grazed ? 0.72 : 1);
        if (entity.grazed) {
          sprite.setTint(0x8cfffb);
        } else {
          sprite.clearTint();
        }
      } else {
        sprite.setAlpha(1);
        sprite.clearTint();
      }
    }

    for (const [id, sprite] of this.entitySprites) {
      if (!activeIds.has(id)) {
        sprite.destroy();
        this.entitySprites.delete(id);
      }
    }
  }

  private updateHudText(): void {
    if (this.launchCharging) {
      const charge = Math.round(clamp(this.launchCharge / LAUNCH_CHARGE_SECONDS, 0, 1) * 100);
      this.hudText.setText(`charge\n${charge}%`);
      return;
    }

    const nextDistance = Math.ceil(this.getNextGoalDistance());
    const nextLine = nextDistance > 0 ? `${this.getNextGoalLabel()} ${nextDistance}m` : 'Signal final';
    const missileLine = this.getMissileHudLine();
    this.hudText.setText(`${this.stats.distance.toFixed(1)} m\ncombo x${this.stats.combo}\n${nextLine}\n${missileLine}`);
  }

  private emitHud(): void {
    const snap = this.titan.getSnapshot();
    const missileUnlocked = this.playerStats.missileLevel > 0;
    const hud: HudState = {
      distance: this.stats.distance,
      combo: this.stats.combo,
      speedPercent: clamp(Math.abs(snap.vx) / (this.playerStats.topSpeed + 580) * 100, 0, 100),
      jumpsLeft: snap.grounded ? this.playerStats.maxJumps : snap.jumpsLeft,
      maxJumps: this.playerStats.maxJumps,
      rocketPercent: clamp((snap.rocketFuel / this.playerStats.rocketMax) * 100, 0, 100),
      missilePercent: missileUnlocked ? clamp((1 - this.missileCooldown / this.playerStats.missileCooldown) * 100, 0, 100) : 0,
      missileUnlocked,
      nextGoalLabel: this.getNextGoalLabel(),
      nextGoalDistance: this.getNextGoalDistance(),
      storyEvents: this.stats.storyEvents,
    };
    this.game.events.emit(GameEvents.HudUpdate, hud);
  }

  private getMissileHudLine(): string {
    if (this.playerStats.missileLevel <= 0) {
      return 'missile verrouille';
    }

    return this.missileCooldown <= 0 ? 'missile pret E' : `missile ${Math.ceil(this.missileCooldown)}s`;
  }

  private getNextGoalLabel(): string {
    return getNextMilestone(this.stats.distance, this.reachedMilestones)?.title || 'Signal final';
  }

  private getNextGoalDistance(): number {
    const next = getNextMilestone(this.stats.distance, this.reachedMilestones);
    return next ? Math.max(0, next.distance - this.stats.distance) : 0;
  }

  private updateDebug(): void {
    if (this.debugVisible) {
      const snap = this.titan.getSnapshot();
      this.debugText.setText(
        [
          `seed: ${this.seed}`,
          `distance: ${this.stats.distance.toFixed(1)} m`,
          `vx/vy: ${snap.vx.toFixed(1)} / ${snap.vy.toFixed(1)}`,
          `grounded: ${snap.grounded}`,
          `jumps left: ${snap.jumpsLeft}`,
          `rocket: ${snap.rocketFuel.toFixed(1)} / ${this.playerStats.rocketMax}`,
          `missile: ${this.playerStats.missileLevel} / cd ${this.missileCooldown.toFixed(1)}`,
          `bounce: ${this.playerStats.bouncePower.toFixed(0)}`,
          `space: ${snap.spaceExposure.toFixed(2)} / suit ${this.playerStats.hasSpaceSuit}`,
          `story: ${this.stats.storyEvents}/${RUN_MILESTONES.length}`,
          `platforms: ${this.chunk.platforms.length}`,
          `entities: ${this.chunk.entities.length}`,
          `combo: ${this.stats.combo}`,
          `dodges: ${this.stats.riskDodges}`,
          `overdrives: ${this.stats.overdrives}`,
        ].join('\n'),
      );
    }

    this.hitboxGraphics.clear();
    if (!this.hitboxesVisible) {
      return;
    }

    this.hitboxGraphics.lineStyle(2, 0x62ff52, 0.9);
    for (const platform of this.chunk.platforms) {
      this.hitboxGraphics.strokeRect(platform.x, platform.y, platform.w, platform.h);
    }
    const snap = this.titan.getSnapshot();
    this.hitboxGraphics.lineStyle(2, 0xffffff, 0.9);
    this.hitboxGraphics.strokeRect(snap.x - snap.w * 0.42, snap.y, snap.w * 0.84, snap.h);
    const circle = this.titan.getCollisionCircle();
    this.hitboxGraphics.lineStyle(2, 0xff5b46, 0.9);
    this.hitboxGraphics.strokeCircle(circle.x, circle.y, circle.r);
    for (const entity of this.chunk.entities) {
      if (!entity.hit) {
        this.hitboxGraphics.strokeCircle(entity.x, entity.y, entity.r);
      }
    }
  }

  private handleLandingImpact(snap: PlayerSnapshot, impactSpeed: number, forceCrash = false): void {
    const power = forceCrash ? 1 : clamp((impactSpeed - 420) / 760, 0, 1);
    soundSystem.land(power);

    if (power > 0.18 || forceCrash) {
      this.spawnLandingCrash(snap.x, snap.y + snap.h, power);
    } else {
      this.spawnDust(snap.x, snap.y + snap.h);
    }

    if ((forceCrash || power > 0.68) && this.time.now - this.lastCrashMessageAt > 1400) {
      this.lastCrashMessageAt = this.time.now;
      this.game.events.emit(GameEvents.Message, {
        title: forceCrash ? 'Crash au sol !' : 'Atterrissage lourd !',
        body: forceCrash
          ? 'Titan percute le sol : run terminee, mais les os ramasses restent gagnes.'
          : 'Le choc laisse des fissures. Rebondis ou relance la rocket pour repartir proprement.',
      });
    }
  }

  private spawnBurst(x: number, y: number, count: number, color: number): void {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 90 + Math.random() * 300;
      this.createParticle(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, color, 0.42 + Math.random() * 0.28);
    }
  }

  private spawnDust(x: number, y: number): void {
    for (let i = 0; i < 8; i += 1) {
      this.createParticle(x + Math.random() * 42 - 21, y - 4, -80 + Math.random() * 160, -30 - Math.random() * 60, 0xbebeb4, 0.28);
    }
  }

  private spawnGrazeRing(x: number, y: number): void {
    const ring = this.add.circle(x, y, 54, 0x8cfffb, 0).setDepth(17);
    ring.setStrokeStyle(4, 0x8cfffb, 0.85);
    this.tweens.add({
      targets: ring,
      alpha: 0,
      scale: 1.8,
      duration: 260,
      onComplete: () => ring.destroy(),
    });
  }

  private spawnLandingCrash(x: number, y: number, power: number): void {
    const radius = 34 + power * 78;
    const life = 1.2 + power * 1.7;
    this.impactMarks.push({
      x,
      y,
      radius,
      power,
      life,
      max: life,
      seed: Math.random() * 1000,
    });

    this.spawnDust(x, y);
    for (let i = 0; i < 12 + power * 24; i += 1) {
      const angle = Math.PI + Math.random() * Math.PI;
      const speed = 120 + Math.random() * (270 + power * 260);
      this.createParticle(
        x + Math.random() * 54 - 27,
        y - 6,
        Math.cos(angle) * speed,
        -80 - Math.random() * (150 + power * 260),
        Math.random() > 0.44 ? 0xb99a6a : 0x5f4a34,
        0.36 + Math.random() * (0.28 + power * 0.26),
      );
    }

    this.cameras.main.shake(90 + power * 210, 0.002 + power * 0.007);
    this.flash.setFillStyle(power > 0.74 ? 0xfff1a6 : 0xff503c, 1);
    this.flash.setAlpha(0.08 + power * 0.2);
    this.tweens.add({ targets: this.flash, alpha: 0, duration: 180 + power * 180 });
  }

  private spawnRocketTrail(x: number, y: number, facing: number): void {
    for (let i = 0; i < 3; i += 1) {
      this.createParticle(x - facing * 46 + Math.random() * 16 - 8, y + Math.random() * 42 - 18, -facing * (230 + Math.random() * 260), -60 + Math.random() * 120, 0x7dff50, 0.32 + Math.random() * 0.22);
    }
  }

  private spawnMissileTrail(x: number, y: number, direction: number, count: number): void {
    for (let i = 0; i < count; i += 1) {
      const spread = Math.random() * 42 - 21;
      this.createParticle(
        x - direction * Math.random() * 26,
        y + spread,
        -direction * (320 + Math.random() * 360),
        -80 + Math.random() * 160,
        i % 3 === 0 ? 0xff5b46 : 0xffd36a,
        0.18 + Math.random() * 0.18,
      );
    }
  }

  private createParticle(x: number, y: number, vx: number, vy: number, color: number, life: number): void {
    const shape = this.add.circle(x, y, 4 + Math.random() * 9, color, 0.75).setDepth(18);
    this.particles.push({ shape, vx, vy, life, max: life });
  }

  private spawnLaunchSparks(charge: number): void {
    const snap = this.titan.getSnapshot();
    const count = 1 + Math.floor(charge * 3);
    const color = this.getLaunchGrade(charge).color;

    for (let i = 0; i < count; i += 1) {
      this.createParticle(
        snap.x - 44 + Math.random() * 26,
        snap.y + snap.h - 18 + Math.random() * 20,
        -120 - Math.random() * (140 + charge * 180),
        -80 - Math.random() * (120 + charge * 180),
        color,
        0.2 + Math.random() * 0.18,
      );
    }
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const particle = this.particles[i];
      particle.life -= dt;
      particle.vy += 260 * dt;
      particle.shape.x += particle.vx * dt;
      particle.shape.y += particle.vy * dt;
      particle.shape.setAlpha(clamp(particle.life / particle.max, 0, 1));
      particle.shape.setScale(clamp(particle.life / particle.max, 0.05, 1));
      if (particle.life <= 0) {
        particle.shape.destroy();
        this.particles.splice(i, 1);
      }
    }
  }

  private updateImpactMarks(dt: number): void {
    for (let i = this.impactMarks.length - 1; i >= 0; i -= 1) {
      const mark = this.impactMarks[i];
      mark.life -= dt;
      if (mark.life <= 0) {
        this.impactMarks.splice(i, 1);
      }
    }
  }

  private drawImpactMarks(): void {
    for (const mark of this.impactMarks) {
      const alpha = clamp(mark.life / mark.max, 0, 1);
      this.platformGraphics.lineStyle(2 + mark.power * 3, 0x060402, 0.34 * alpha);
      this.platformGraphics.strokeEllipse(mark.x, mark.y + 4, mark.radius * 1.55, 12 + mark.power * 18);
      this.platformGraphics.lineStyle(2, 0xffd36a, 0.18 * alpha);
      this.platformGraphics.strokeEllipse(mark.x, mark.y + 2, mark.radius * 1.1, 7 + mark.power * 10);

      for (let i = 0; i < 7; i += 1) {
        const angle = mark.seed + i * 0.92;
        const length = mark.radius * (0.35 + ((i % 3) + 1) * 0.18);
        const startX = mark.x + Math.cos(angle) * mark.radius * 0.18;
        const startY = mark.y + Math.sin(angle) * 4;
        this.platformGraphics.lineStyle(1 + mark.power * 2, 0x090604, 0.38 * alpha);
        this.platformGraphics.lineBetween(startX, startY, startX + Math.cos(angle) * length, startY + Math.sin(angle) * length * 0.18);
      }
    }
  }

  private finishRun(forcedReason?: RunSummary['finishReason'], delayMs = 0): void {
    if (this.ended) {
      return;
    }

    this.ended = true;
    this.titan.knockOut();
    soundSystem.finish();
    const finishReason: RunSummary['finishReason'] = forcedReason ?? (this.titan.isLostInSpace() ? 'space' : 'fall');
    if (finishReason === 'space') {
      this.game.events.emit(GameEvents.Message, {
        title: "Perdu dans l'espace",
        body: 'La tenue cosmonaute protege Titan quand la gravite devient trop faible.',
      });
    }
    const summary: RunSummary = saveSystem.recordRun(this.stats, this.seed, finishReason);
    this.game.events.emit(GameEvents.SaveChanged, saveSystem.getSnapshot());
    const showResult = () => {
      this.game.events.emit(GameEvents.RunFinished, summary);
      this.scene.start('ResultScene', { summary });
    };

    if (delayMs > 0) {
      this.time.delayedCall(delayMs, showResult);
      return;
    }

    showResult();
  }

  private restartRun(seed: string): void {
    if (this.ended) {
      return;
    }
    this.scene.restart({ seed });
  }

  private createStats(): RunStats {
    return {
      distance: 0,
      maxSpeed: 0,
      jumps: 0,
      landed: 0,
      pickups: 0,
      bonusBones: 0,
      hits: 0,
      riskDodges: 0,
      overdrives: 0,
      combo: 0,
      bestCombo: 0,
      storyEvents: 0,
      bestMilestone: '',
    };
  }

  private makeSeed(): string {
    return `run-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  }
}
