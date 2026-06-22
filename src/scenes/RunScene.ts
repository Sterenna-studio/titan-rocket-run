import Phaser from 'phaser';
import {
  COLORS,
  GAME_HEIGHT,
  GAME_WIDTH,
  GameEvents,
  GROUND_Y,
  LAUNCH_CHARGE_SECONDS,
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
import type { HudState, InputState, RunMilestone, RunStats, RunSummary, VirtualInput } from '../types/game';
import { ChunkManager } from '../world/ChunkManager';

interface Particle {
  shape: Phaser.GameObjects.Arc;
  vx: number;
  vy: number;
  life: number;
  max: number;
}

interface ParallaxLayer {
  tile: Phaser.GameObjects.TileSprite;
  scrollRatio: number;
  drift: number;
}

type KeyMap = Record<'a' | 'q' | 'd' | 'left' | 'right' | 'space' | 'shift', Phaser.Input.Keyboard.Key>;

export class RunScene extends Phaser.Scene {
  private seed = '';
  private chunk!: ChunkManager;
  private titan!: TitanController;
  private collect = new CollectibleSystem();
  private mines = new MineSystem();
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
  private keys!: KeyMap;
  private virtualDown = new Set<VirtualInput['key']>();
  private stats!: RunStats;
  private reachedMilestones = new Set<string>();
  private playerStats = upgradeSystem.getPlayerStats();
  private jumpBuffer = 0;
  private boostSoundCooldown = 0;
  private launchCharging = true;
  private launchCharge = 0;
  private launchDirection = 1;
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
    this.chunk = new ChunkManager(this.seed);

    this.collect.createTextures(this);
    this.mines.createTextures(this);
    this.drawBackground();

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
    if (this.ended) {
      return;
    }

    const dt = Math.min(0.033, deltaMs / 1000);
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.boostSoundCooldown = Math.max(0, this.boostSoundCooldown - dt);
    this.chunk.ensure(this.cameras.main.scrollX, GAME_WIDTH);

    const input = this.getInputState();
    if (this.launchCharging) {
      this.updateLaunch(dt, input);
      this.updateCamera(dt);
      this.updateBackground();
      this.updateParticles(dt);
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
    const snap = this.titan.getSnapshot();
    if (result.landed) {
      this.stats.landed += 1;
      soundSystem.land();
      this.spawnDust(snap.x, snap.y + snap.h);
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

    this.handleEntities();
    this.updateStats();
    this.handleMilestones();
    this.updateCamera(dt);
    this.updateBackground();
    this.updateParticles(dt);
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
    };

    keyboard.on('keydown-SPACE', (event: KeyboardEvent) => {
      event.preventDefault();
      this.jumpBuffer = 0.13;
    });
    keyboard.on('keyup-SPACE', (event: KeyboardEvent) => {
      event.preventDefault();
      this.titan.releaseJump();
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
      jumpHeld: this.keys.space.isDown || this.virtualDown.has('space'),
    };
  }

  private updateLaunch(dt: number, input: InputState): void {
    this.jumpBuffer = 0;
    this.launchDirection = 1;

    if (input.jumpHeld) {
      this.launchCharge = Math.min(LAUNCH_CHARGE_SECONDS, this.launchCharge + dt);
    } else if (this.launchCharge > 0) {
      this.fireChargedLaunch();
    }

    this.drawLaunchMeter();
  }

  private fireChargedLaunch(): void {
    const charge = clamp(this.launchCharge / LAUNCH_CHARGE_SECONDS, 0, 1);
    const snap = this.titan.getSnapshot();

    this.launchCharging = false;
    this.launchCharge = 0;
    this.launchGraphics.clear();
    this.titan.launch(charge, this.launchDirection);
    this.stats.jumps += 1;
    soundSystem.launch(charge);
    this.spawnBurst(snap.x, snap.y + snap.h, 12 + Math.round(charge * 18), charge > 0.82 ? 0x8cfffb : 0x62ff52);
    this.game.events.emit(GameEvents.Message, {
      title: charge > 0.82 ? 'Super depart !' : 'Go !',
      body: "Garde l'elan, double-saute, rebondis avec les bottes et surveille l'altitude.",
    });
  }

  private handleEntities(): void {
    const time = this.time.now / 1000;
    const player = this.titan.getCollisionCircle();

    for (const bone of this.collect.findCollected(player, this.chunk.entities, time)) {
      this.chunk.markEntityHit(bone.id);
      this.stats.combo += 1;
      const comboBonus = Math.floor(this.stats.combo / 4);
      const earnedBones = bone.value + comboBonus;
      this.titan.collectBone(earnedBones);
      this.stats.pickups += 1;
      this.stats.bonusBones += earnedBones;
      this.stats.bestCombo = Math.max(this.stats.bestCombo, this.stats.combo);
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
      soundSystem.mine();
      this.spawnBurst(mine.x, mine.y, 18, 0xff5b46);
      this.cameras.main.shake(160, 0.006);
      this.flash.setAlpha(0.24);
      this.tweens.add({ targets: this.flash, alpha: 0, duration: 180 });
      this.game.events.emit(GameEvents.Message, {
        title: 'Mine encaissee',
        body: 'Elle ralentit Titan, mais tu peux sauver la run.',
      });
    }
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
    this.stats.combo += 2;
    this.stats.bestCombo = Math.max(this.stats.bestCombo, this.stats.combo);
    this.stats.bestMilestone = milestone.badge || milestone.title;

    const snap = this.titan.getSnapshot();
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
      { tile: this.add.tileSprite(0, 0, GAME_WIDTH, 132, 'bg-stars').setOrigin(0).setScrollFactor(0).setDepth(-28), scrollRatio: 0.06, drift: 4 },
      { tile: this.add.tileSprite(0, SPACE_Y + 18, GAME_WIDTH, 190, 'bg-clouds').setOrigin(0).setScrollFactor(0).setDepth(-27), scrollRatio: 0.12, drift: 9 },
      { tile: this.add.tileSprite(0, 140, GAME_WIDTH, 330, 'bg-far-structures').setOrigin(0).setScrollFactor(0).setDepth(-26), scrollRatio: 0.22, drift: 0 },
      { tile: this.add.tileSprite(0, 250, GAME_WIDTH, 300, 'bg-near-structures').setOrigin(0).setScrollFactor(0).setDepth(-25), scrollRatio: 0.38, drift: 0 },
      { tile: this.add.tileSprite(0, 455, GAME_WIDTH, 210, 'bg-ground-haze').setOrigin(0).setScrollFactor(0).setDepth(-24), scrollRatio: 0.62, drift: 0 },
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

  private createGradientTexture(): void {
    if (this.textures.exists('bg-gradient')) {
      return;
    }

    const graphics = this.add.graphics().setVisible(false);
    graphics.fillStyle(0x02040b, 1);
    graphics.fillRect(0, 0, GAME_WIDTH, SPACE_Y + 20);
    graphics.fillStyle(0x061a28, 1);
    graphics.fillRect(0, SPACE_Y + 20, GAME_WIDTH, 168);
    graphics.fillStyle(0x0b2112, 1);
    graphics.fillRect(0, 288, GAME_WIDTH, GAME_HEIGHT - 288);
    graphics.fillStyle(0x0f2110, 0.72);
    graphics.fillRect(0, 430, GAME_WIDTH, GAME_HEIGHT - 430);
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
    graphics.generateTexture('bg-stars', GAME_WIDTH, 132);
    graphics.destroy();
  }

  private createCloudsTexture(): void {
    if (this.textures.exists('bg-clouds')) {
      return;
    }

    const graphics = this.add.graphics().setVisible(false);
    const cloudRows = [
      { y: 42, color: 0xc8fbff, alpha: 0.13, step: 260 },
      { y: 96, color: 0x8cfffb, alpha: 0.1, step: 340 },
      { y: 138, color: 0xf0fff4, alpha: 0.07, step: 300 },
    ];

    for (const row of cloudRows) {
      graphics.fillStyle(row.color, row.alpha);
      for (let x = -80; x < GAME_WIDTH + 180; x += row.step) {
        graphics.fillEllipse(x + 64, row.y, 176, 24);
        graphics.fillEllipse(x + 150, row.y + 18, 220, 30);
      }
    }

    graphics.generateTexture('bg-clouds', GAME_WIDTH, 190);
    graphics.destroy();
  }

  private createFarStructuresTexture(): void {
    if (this.textures.exists('bg-far-structures')) {
      return;
    }

    const graphics = this.add.graphics().setVisible(false);
    graphics.fillStyle(COLORS.green, 0.035);
    for (let x = -120; x < GAME_WIDTH + 260; x += 280) {
      graphics.fillCircle(x + 140, 38, 86);
      graphics.fillRoundedRect(x + 76, 96, 128, 260, 22);
    }
    graphics.lineStyle(2, COLORS.green, 0.075);
    for (let x = -60; x < GAME_WIDTH + 260; x += 300) {
      graphics.strokeRoundedRect(x + 35, 82, 190, 320, 18);
    }
    graphics.generateTexture('bg-far-structures', GAME_WIDTH, 330);
    graphics.destroy();
  }

  private createNearStructuresTexture(): void {
    if (this.textures.exists('bg-near-structures')) {
      return;
    }

    const graphics = this.add.graphics().setVisible(false);
    graphics.fillStyle(0x0a2a17, 0.42);
    for (let x = -100; x < GAME_WIDTH + 180; x += 180) {
      const height = 120 + ((x + 700) % 5) * 18;
      graphics.fillRoundedRect(x, 300 - height, 88, height, 18);
      graphics.fillCircle(x + 44, 300 - height + 8, 54);
    }
    graphics.lineStyle(2, 0x65d9ff, 0.12);
    for (let x = 0; x < GAME_WIDTH + 120; x += 240) {
      graphics.lineBetween(x, 210, x + 80, 142);
      graphics.lineBetween(x + 80, 142, x + 180, 202);
    }
    graphics.generateTexture('bg-near-structures', GAME_WIDTH, 300);
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
    graphics.generateTexture('bg-ground-haze', GAME_WIDTH, 210);
    graphics.destroy();
  }

  private drawPlatforms(): void {
    this.platformGraphics.clear();
    for (const platform of this.chunk.platforms) {
      const color = platform.kind === 'boost' ? COLORS.boost : this.getBiomePlatformColor(platform.x);
      const accent = platform.kind === 'boost' ? COLORS.green : this.getBiomeAccentColor(platform.x);
      this.platformGraphics.fillStyle(color, 1);
      this.platformGraphics.fillRoundedRect(platform.x, platform.y, platform.w, platform.h, 12);
      this.platformGraphics.lineStyle(platform.kind === 'boost' ? 4 : 3, accent, platform.kind === 'boost' ? 0.75 : 0.42);
      this.platformGraphics.strokeRoundedRect(platform.x, platform.y, platform.w, platform.h, 12);
    }
    this.drawMilestoneBeacons();
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

      const pulse = 0.62 + Math.sin(this.time.now / 180) * 0.2;
      this.platformGraphics.lineStyle(3, milestone.color, pulse);
      this.platformGraphics.lineBetween(x, 118, x, GROUND_Y - 36);
      this.platformGraphics.fillStyle(milestone.color, 0.22 + pulse * 0.22);
      this.platformGraphics.fillCircle(x, 118, 24);
      this.platformGraphics.fillStyle(milestone.color, 0.92);
      this.platformGraphics.fillTriangle(x - 12, 118, x + 18, 106, x + 18, 130);
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
    const x = START_X - 78;
    const y = GROUND_Y - 185;

    this.launchGraphics.fillStyle(0x041108, 0.9);
    this.launchGraphics.fillRoundedRect(x, y, 156, 18, 9);
    this.launchGraphics.lineStyle(2, COLORS.green, 0.58);
    this.launchGraphics.strokeRoundedRect(x, y, 156, 18, 9);
    this.launchGraphics.fillStyle(ratio > 0.82 ? 0x8cfffb : COLORS.green, 0.95);
    this.launchGraphics.fillRoundedRect(x + 4, y + 4, 148 * ratio, 10, 5);
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
    this.hudText.setText(`${this.stats.distance.toFixed(1)} m\ncombo x${this.stats.combo}\n${nextLine}`);
  }

  private emitHud(): void {
    const snap = this.titan.getSnapshot();
    const hud: HudState = {
      distance: this.stats.distance,
      combo: this.stats.combo,
      speedPercent: clamp(Math.abs(snap.vx) / (this.playerStats.topSpeed + 580) * 100, 0, 100),
      jumpsLeft: snap.grounded ? this.playerStats.maxJumps : snap.jumpsLeft,
      maxJumps: this.playerStats.maxJumps,
      rocketPercent: clamp((snap.rocketFuel / this.playerStats.rocketMax) * 100, 0, 100),
      nextGoalLabel: this.getNextGoalLabel(),
      nextGoalDistance: this.getNextGoalDistance(),
      storyEvents: this.stats.storyEvents,
    };
    this.game.events.emit(GameEvents.HudUpdate, hud);
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
          `bounce: ${this.playerStats.bouncePower.toFixed(0)}`,
          `space: ${snap.spaceExposure.toFixed(2)} / suit ${this.playerStats.hasSpaceSuit}`,
          `story: ${this.stats.storyEvents}/${RUN_MILESTONES.length}`,
          `platforms: ${this.chunk.platforms.length}`,
          `entities: ${this.chunk.entities.length}`,
          `combo: ${this.stats.combo}`,
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

  private spawnRocketTrail(x: number, y: number, facing: number): void {
    for (let i = 0; i < 3; i += 1) {
      this.createParticle(x - facing * 46 + Math.random() * 16 - 8, y + Math.random() * 42 - 18, -facing * (230 + Math.random() * 260), -60 + Math.random() * 120, 0x7dff50, 0.32 + Math.random() * 0.22);
    }
  }

  private createParticle(x: number, y: number, vx: number, vy: number, color: number, life: number): void {
    const shape = this.add.circle(x, y, 4 + Math.random() * 9, color, 0.75).setDepth(18);
    this.particles.push({ shape, vx, vy, life, max: life });
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

  private finishRun(): void {
    if (this.ended) {
      return;
    }

    this.ended = true;
    this.titan.knockOut();
    soundSystem.finish();
    const finishReason: RunSummary['finishReason'] = this.titan.isLostInSpace() ? 'space' : 'fall';
    if (finishReason === 'space') {
      this.game.events.emit(GameEvents.Message, {
        title: "Perdu dans l'espace",
        body: 'La tenue cosmonaute protege Titan quand la gravite devient trop faible.',
      });
    }
    const summary: RunSummary = saveSystem.recordRun(this.stats, this.seed, finishReason);
    this.game.events.emit(GameEvents.SaveChanged, saveSystem.getSnapshot());
    this.game.events.emit(GameEvents.RunFinished, summary);
    this.scene.start('ResultScene', { summary });
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
