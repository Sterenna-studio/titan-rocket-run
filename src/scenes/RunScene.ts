import Phaser from 'phaser';
import {
  COLORS,
  CRASH_GROUND_Y,
  GAME_HEIGHT,
  GAME_WIDTH,
  GameEvents,
  GROUND_Y,
  SKY_Y,
  SPACE_Y,
  START_X,
  UNDERGROUND_Y,
  WORLD_SCALE,
  clamp,
} from '../game/constants';
import { TitanController } from '../player/TitanController';
import { CollectibleSystem } from '../systems/CollectibleSystem';
import { RUN_MILESTONES, getNextMilestone } from '../systems/RunMilestones';
import { saveSystem } from '../systems/SaveSystem';
import { soundSystem } from '../systems/SoundSystem';
import { upgradeSystem } from '../systems/UpgradeSystem';
import type {
  HudState,
  InputState,
  PlatformData,
  PlayerSnapshot,
  RunMilestone,
  RunStats,
  RunSummary,
  VirtualInput,
  WorldEntity,
} from '../types/game';
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

interface ImpactMark {
  x: number;
  y: number;
  radius: number;
  power: number;
  life: number;
  max: number;
  seed: number;
}

type KeyMap = Record<'a' | 'q' | 'd' | 'left' | 'right' | 'space' | 'shift', Phaser.Input.Keyboard.Key>;
type RunPhase = 'surface' | 'underground' | 'recovering' | 'gameOver';

const SCRIPTED_ID_START = 100000;
const SURFACE_FALL_BOTTOM_Y = CRASH_GROUND_Y + 24;
const RECOVERY_DURATION = 1.15;

export class RunScene extends Phaser.Scene {
  private seed = '';
  private chunk!: ChunkManager;
  private titan!: TitanController;
  private collect = new CollectibleSystem();
  private groundGraphics!: Phaser.GameObjects.Graphics;
  private platformGraphics!: Phaser.GameObjects.Graphics;
  private hitboxGraphics!: Phaser.GameObjects.Graphics;
  private debugText!: Phaser.GameObjects.Text;
  private hudText!: Phaser.GameObjects.Text;
  private milestoneBanner!: Phaser.GameObjects.Text;
  private flash!: Phaser.GameObjects.Rectangle;
  private backgroundLayers: ParallaxLayer[] = [];
  private entitySprites = new Map<number, Phaser.GameObjects.Image>();
  private particles: Particle[] = [];
  private impactMarks: ImpactMark[] = [];
  private keys!: KeyMap;
  private virtualDown = new Set<VirtualInput['key']>();
  private stats!: RunStats;
  private reachedMilestones = new Set<string>();
  private playerStats = upgradeSystem.getPlayerStats();
  private jumpBuffer = 0;
  private boostSoundCooldown = 0;
  private rocketVisualCooldown = 0;
  private nextOverdriveCombo = 6;
  private lastCrashMessageAt = 0;
  private debugVisible = false;
  private hitboxesVisible = false;
  private ended = false;
  private phase: RunPhase = 'surface';
  private recoveryTimer = 0;
  private nextScriptedId = SCRIPTED_ID_START;
  private undergroundPlatforms: PlatformData[] = [];
  private recoveryPlatforms: PlatformData[] = [];
  private undergroundEntities: WorldEntity[] = [];

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
    this.lastCrashMessageAt = 0;
    this.rocketVisualCooldown = 0;
    this.nextOverdriveCombo = 6;
    this.ended = false;
    this.phase = 'surface';
    this.recoveryTimer = 0;
    this.nextScriptedId = SCRIPTED_ID_START;
    this.undergroundPlatforms = [];
    this.recoveryPlatforms = [];
    this.undergroundEntities = [];
    this.particles = [];
    this.impactMarks = [];
    this.entitySprites.clear();
    this.virtualDown.clear();
    this.chunk = new ChunkManager(this.seed);

    this.collect.createTextures(this);
    this.drawBackground();

    this.groundGraphics = this.add.graphics().setDepth(5);
    this.platformGraphics = this.add.graphics().setDepth(8);
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
      title: 'Course lancee',
      body: 'Titan avance tout seul : saute les trous, garde un peu de rocket pour sauver les longues distances et vise les balises.',
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
    this.rocketVisualCooldown = Math.max(0, this.rocketVisualCooldown - dt);
    this.updateRecoveryTimer(dt);
    this.chunk.ensure(this.cameras.main.scrollX, GAME_WIDTH);

    const input = this.getInputState();
    const beforeJump = this.titan.getSnapshot();
    if (this.jumpBuffer > 0 && this.titan.tryJump()) {
      this.jumpBuffer = 0;
      this.stats.jumps += 1;
      const snap = this.titan.getSnapshot();
      soundSystem.jump(!beforeJump.grounded && beforeJump.coyote <= 0);
      this.spawnBurst(snap.x, snap.y + snap.h * 0.68, 14, 0x62ff52);
    }

    const result = this.titan.update(dt, input, this.getActivePlatforms());
    let snap = this.titan.getSnapshot();
    if (result.landed) {
      this.stats.landed += 1;
      this.handleLandingImpact(snap, result.impactSpeed);
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
    this.updateImpactMarks(dt);
    this.syncEntitySprites(this.time.now / 1000);
    this.drawPlatforms();
    this.updateHudText();
    this.updateDebug();
    this.emitHud();
    this.updateRunPhase();
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

  private getActivePlatforms(): PlatformData[] {
    return [...this.chunk.platforms, ...this.undergroundPlatforms, ...this.recoveryPlatforms];
  }

  private getActiveEntities(): WorldEntity[] {
    return [...this.chunk.entities, ...this.undergroundEntities];
  }

  private handleEntities(): void {
    const time = this.time.now / 1000;
    const player = this.titan.getCollisionCircle();

    for (const entity of this.collect.findCollected(player, this.getActiveEntities(), time)) {
      entity.hit = true;

      if (entity.type === 'undergroundBoost') {
        this.collectUndergroundBoost(entity);
        continue;
      }

      this.addCombo(1, entity.x, entity.y);
      const comboBonus = Math.floor(this.stats.combo / 4);
      const earnedBones = entity.value + comboBonus;
      this.titan.collectBone(earnedBones);
      this.stats.pickups += 1;
      this.stats.bonusBones += earnedBones;
      soundSystem.collect();
      this.spawnBurst(entity.x, entity.y, 14 + comboBonus * 2, comboBonus > 0 ? 0xffd36a : 0x62ff52);
      if (comboBonus > 0 && this.stats.combo % 4 === 0) {
        this.game.events.emit(GameEvents.Message, {
          title: `Combo x${this.stats.combo}`,
          body: `Bonus serie : +${comboBonus} os sur chaque ramassage.`,
        });
      }
    }

  }

  private updateRecoveryTimer(dt: number): void {
    if (this.phase !== 'recovering') {
      return;
    }

    this.recoveryTimer = Math.max(0, this.recoveryTimer - dt);
    if (this.recoveryTimer <= 0) {
      this.phase = 'surface';
    }
  }

  private updateRunPhase(): void {
    const snap = this.titan.getSnapshot();

    if (this.phase === 'surface' && snap.y + snap.h > SURFACE_FALL_BOTTOM_Y) {
      this.enterUnderground(snap);
      return;
    }

    if (this.phase === 'underground' && this.titan.isDead()) {
      this.finishRun();
    }
  }

  private enterUnderground(snap: PlayerSnapshot): void {
    this.phase = 'underground';
    this.recoveryTimer = 0;
    const startX = Math.max(START_X + 420, snap.x - 120);
    this.undergroundPlatforms = this.createUndergroundRoute(startX);
    this.undergroundEntities = this.createUndergroundCollectibles(this.undergroundPlatforms);
    this.recoveryPlatforms = [];
    const entry = this.undergroundPlatforms[0];
    const entryX = clamp(snap.x + 120, entry.x + 96, entry.x + entry.w - 96);

    this.titan.placeOnPlatform(entryX, entry.y, Math.max(snap.vx * 0.72, this.playerStats.startVelocity * 0.88), 62, 1.1);
    const placed = this.titan.getSnapshot();
    this.spawnBurst(placed.x, placed.y + placed.h * 0.54, 30, 0x8cfffb);
    this.spawnUndergroundTransition(placed.x, placed.y + placed.h);
    soundSystem.land(0.82);
    this.cameras.main.shake(190, 0.006);
    this.cameras.main.flash(220, 36, 12, 54, false);
    this.game.events.emit(GameEvents.Message, {
      title: 'Souterrain de rattrapage',
      body: 'Seconde chance : reste sur les tunnels et attrape le boost cyan pour remonter sur la piste haute.',
    });
    this.showPhaseBanner('Souterrain de rattrapage', 'Boost cyan = remontee surface');
  }

  private collectUndergroundBoost(entity: WorldEntity): void {
    if (this.phase !== 'underground') {
      return;
    }

    const snap = this.titan.getSnapshot();
    this.stats.pickups += 1;
    this.stats.bonusBones += 18;
    this.addCombo(2, entity.x, entity.y);
    this.spawnBurst(entity.x, entity.y, 42, 0x8cfffb);
    this.spawnBoostTunnel(entity.x, entity.y);
    soundSystem.overdrive();

    const recovery = this.createRecoveryPlatform(snap.x + 420);
    this.recoveryPlatforms = [recovery];
    this.phase = 'recovering';
    this.recoveryTimer = RECOVERY_DURATION;
    this.undergroundPlatforms = this.undergroundPlatforms.filter((platform) => platform.x + platform.w > snap.x - 260);
    this.undergroundEntities = [];
    this.titan.placeOnPlatform(recovery.x + 140, recovery.y, Math.max(snap.vx + 360, this.playerStats.topSpeed + 180), 100, 1.25, 520);
    const placed = this.titan.getSnapshot();

    this.spawnBurst(placed.x, placed.y + placed.h, 34, 0xffd36a);
    this.cameras.main.shake(160, 0.004);
    this.cameras.main.flash(180, 140, 255, 251, false);
    this.game.events.emit(GameEvents.Message, {
      title: 'Remontee surface !',
      body: '+18 os, rocket pleine et vitesse bonus. La chute est sauvee, reprends la piste haute.',
    });
    this.showPhaseBanner('Remontee surface', 'Rocket pleine + vitesse bonus');
  }

  private createUndergroundRoute(startX: number): PlatformData[] {
    const widths = [760, 420, 360, 455, 390, 520];
    const gaps = [120, 142, 132, 156, 126];
    const platforms: PlatformData[] = [];
    let x = startX;

    for (let i = 0; i < widths.length; i += 1) {
      const y = clamp(UNDERGROUND_Y - 18 - (i % 3) * 34 + Math.sin((startX + i * 91) * 0.01) * 18, GROUND_Y + 54, UNDERGROUND_Y + 10);
      platforms.push({
        id: this.nextScriptedId,
        x,
        y,
        w: widths[i],
        h: i === 0 ? 46 : 34 + (i % 2) * 8,
        kind: 'underground',
      });
      this.nextScriptedId += 1;
      x += widths[i] + (gaps[i] ?? 0);
    }

    return platforms;
  }

  private createUndergroundCollectibles(platforms: PlatformData[]): WorldEntity[] {
    const entities: WorldEntity[] = [];
    for (let i = 1; i < platforms.length - 1; i += 1) {
      const platform = platforms[i];
      entities.push({
        id: this.nextScriptedId,
        type: 'bone',
        x: platform.x + platform.w * 0.36,
        y: platform.y - 58,
        r: 18,
        value: 4,
        hit: false,
        grazed: false,
        bob: i * 0.8,
      });
      this.nextScriptedId += 1;
    }

    const boostPlatform = platforms[platforms.length - 1];
    entities.push({
      id: this.nextScriptedId,
      type: 'undergroundBoost',
      x: boostPlatform.x + boostPlatform.w * 0.62,
      y: boostPlatform.y - 86,
      r: 30,
      value: 0,
      hit: false,
      grazed: false,
      bob: 4.8,
    });
    this.nextScriptedId += 1;

    return entities;
  }

  private createRecoveryPlatform(x: number): PlatformData {
    const platform: PlatformData = {
      id: this.nextScriptedId,
      x,
      y: GROUND_Y - 118,
      w: 980,
      h: 34,
      kind: 'recovery',
    };
    this.nextScriptedId += 1;
    return platform;
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

  private updateStats(): void {
    const snap = this.titan.getSnapshot();
    this.stats.distance = this.titan.getDistanceMeters();
    this.stats.maxSpeed = Math.max(this.stats.maxSpeed, Math.abs(snap.vx));
  }

  private handleMilestones(): void {
    if (this.phase === 'underground') {
      return;
    }

    for (const milestone of RUN_MILESTONES) {
      if (this.reachedMilestones.has(milestone.id) || this.stats.distance < milestone.distance) {
        continue;
      }

      this.triggerMilestone(milestone);
    }
  }

  private triggerMilestone(milestone: RunMilestone): void {
    this.reachedMilestones.add(milestone.id);
    this.stats.milestonesReached.push(milestone.id);
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

  private showPhaseBanner(title: string, body: string): void {
    this.milestoneBanner.setText(`${title}\n${body}`);
    this.milestoneBanner.setTint(0x8cfffb);
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
      hold: 1500,
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
    for (const platform of this.getActivePlatforms()) {
      const color =
        platform.kind === 'underground'
          ? 0x101a24
          : platform.kind === 'recovery'
            ? 0x14351e
            : platform.kind === 'boost'
          ? COLORS.boost
          : platform.kind === 'path'
            ? 0x14351e
            : platform.kind === 'ramp'
              ? 0x342913
              : platform.kind === 'start'
                ? 0x26321b
                : this.getBiomePlatformColor(platform.x);
      const accent =
        platform.kind === 'underground'
          ? 0x8cfffb
          : platform.kind === 'recovery'
            ? 0xffd36a
            : platform.kind === 'boost'
          ? COLORS.green
          : platform.kind === 'path'
            ? 0x8cfffb
            : platform.kind === 'ramp'
              ? 0xffd36a
              : platform.kind === 'start'
                ? 0xffd36a
                : this.getBiomeAccentColor(platform.x);
      this.platformGraphics.fillStyle(color, 1);
      if (platform.kind === 'ramp') {
        this.platformGraphics.fillStyle(0x0d150f, 0.78);
        this.platformGraphics.fillRoundedRect(platform.x, platform.y + platform.h * 0.45, platform.w, platform.h * 0.55, 10);
        this.platformGraphics.fillStyle(color, 1);
        this.platformGraphics.fillTriangle(platform.x, platform.y + platform.h, platform.x + platform.w, platform.y, platform.x + platform.w, platform.y + platform.h);
        this.platformGraphics.lineStyle(4, accent, 0.78);
        this.platformGraphics.lineBetween(platform.x + 8, platform.y + platform.h - 5, platform.x + platform.w - 8, platform.y + 4);
        for (let x = platform.x + 42; x < platform.x + platform.w - 24; x += 62) {
          this.platformGraphics.lineStyle(2, 0x0d150f, 0.36);
          this.platformGraphics.lineBetween(x, platform.y + platform.h - 8, x + 24, platform.y + platform.h - 22);
        }
        continue;
      }

      this.platformGraphics.fillRoundedRect(platform.x, platform.y, platform.w, platform.h, 12);
      this.platformGraphics.lineStyle(platform.kind === 'boost' ? 4 : 3, accent, platform.kind === 'boost' ? 0.75 : 0.42);
      this.platformGraphics.strokeRoundedRect(platform.x, platform.y, platform.w, platform.h, 12);
      if (platform.kind === 'start') {
        this.platformGraphics.fillStyle(0xffd36a, 0.16);
        this.platformGraphics.fillRoundedRect(platform.x + 24, platform.y + 10, platform.w - 48, 8, 4);
      } else if (platform.kind === 'underground') {
        this.platformGraphics.lineStyle(2, 0xffd36a, 0.18);
        this.platformGraphics.lineBetween(platform.x + 18, platform.y + platform.h - 8, platform.x + platform.w - 18, platform.y + platform.h - 8);
        for (let x = platform.x + 38; x < platform.x + platform.w - 32; x += 84) {
          this.platformGraphics.lineStyle(2, 0x8cfffb, 0.28);
          this.platformGraphics.lineBetween(x, platform.y + 5, x + 34, platform.y + 5);
        }
      } else if (platform.kind === 'recovery') {
        this.platformGraphics.fillStyle(0x8cfffb, 0.16);
        this.platformGraphics.fillRoundedRect(platform.x + 22, platform.y + 8, platform.w - 44, 7, 4);
      } else if (platform.kind === 'path') {
        this.platformGraphics.lineStyle(2, 0x071009, 0.42);
        this.platformGraphics.lineBetween(platform.x + 18, platform.y + platform.h * 0.5, platform.x + platform.w - 18, platform.y + platform.h * 0.5);
        this.platformGraphics.lineStyle(2, accent, 0.35);
        for (let x = platform.x + 34; x < platform.x + platform.w - 32; x += 76) {
          this.platformGraphics.lineBetween(x, platform.y + 7, x + 30, platform.y + 7);
        }
      }
    }
    this.drawImpactMarks();
    if (this.phase !== 'underground') {
      this.drawMilestoneBeacons();
    }
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
    this.drawUndergroundBackdrop(viewX, width, startX, endX);
    this.groundGraphics.fillStyle(0x111707, 0.94);
    for (let x = startX; x < endX; x += 96) {
      const crest = top + Math.sin(x * 0.013) * 7 + Math.sin(x * 0.031) * 5;
      this.groundGraphics.fillTriangle(x, top + 34, x + 48, crest, x + 96, top + 34);
    }
    this.groundGraphics.lineStyle(3, COLORS.red, 0.34);
    this.groundGraphics.lineBetween(viewX, top, viewX + width, top);
    this.groundGraphics.lineStyle(2, 0xffd36a, 0.2);
    for (let x = startX; x < endX; x += 132) {
      const y = top + 38 + Math.sin(x * 0.021) * 10;
      this.groundGraphics.lineBetween(x, y, x + 44, y + 22);
    }
  }

  private drawUndergroundBackdrop(viewX: number, width: number, startX: number, endX: number): void {
    const activeTunnel =
      this.phase === 'underground' ||
      this.phase === 'recovering' ||
      this.undergroundPlatforms.some((platform) => platform.x + platform.w > viewX && platform.x < viewX + width);

    if (!activeTunnel) {
      return;
    }

    const ceilingY = GROUND_Y + 50;
    this.groundGraphics.fillStyle(0x050712, 0.88);
    this.groundGraphics.fillRect(viewX, ceilingY, width, GAME_HEIGHT - ceilingY + 80);
    this.groundGraphics.lineStyle(4, 0x8cfffb, 0.24);
    this.groundGraphics.lineBetween(viewX, ceilingY + 12, viewX + width, ceilingY + 12);
    this.groundGraphics.lineStyle(2, 0xffd36a, 0.12);
    this.groundGraphics.lineBetween(viewX, UNDERGROUND_Y + 44, viewX + width, UNDERGROUND_Y + 44);

    for (let x = startX; x < endX; x += 120) {
      const rockY = ceilingY + 18 + Math.sin(x * 0.017) * 16;
      this.groundGraphics.fillStyle(0x111827, 0.82);
      this.groundGraphics.fillTriangle(x, ceilingY, x + 60, rockY, x + 120, ceilingY);
      this.groundGraphics.lineStyle(2, 0x8cfffb, 0.08);
      this.groundGraphics.lineBetween(x + 14, UNDERGROUND_Y + 64, x + 72, UNDERGROUND_Y + 82);
      this.groundGraphics.lineBetween(x + 72, UNDERGROUND_Y + 82, x + 112, UNDERGROUND_Y + 66);
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

      const beaconY = GROUND_Y - 330;
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

  private syncEntitySprites(time: number): void {
    const activeIds = new Set<number>();
    for (const entity of this.getActiveEntities()) {
      if (entity.hit) {
        continue;
      }

      activeIds.add(entity.id);
      let sprite = this.entitySprites.get(entity.id);
      if (!sprite) {
        sprite = this.collect.createBone(this, entity);
        this.entitySprites.set(entity.id, sprite);
      }
      sprite.setPosition(entity.x, entity.y + Math.sin(time * 3 + entity.bob) * 6);
      sprite.setAlpha(entity.type === 'undergroundBoost' ? 0.92 + Math.sin(time * 7) * 0.08 : 1);
      sprite.setRotation(entity.type === 'undergroundBoost' ? Math.sin(time * 2.5) * 0.08 : 0);
      sprite.clearTint();
    }

    for (const [id, sprite] of this.entitySprites) {
      if (!activeIds.has(id)) {
        sprite.destroy();
        this.entitySprites.delete(id);
      }
    }
  }

  private updateHudText(): void {
    if (this.phase === 'underground') {
      const boost = this.getUndergroundBoost();
      const boostDistance = boost ? Math.max(0, Math.ceil((boost.x - this.titan.getSnapshot().x) * WORLD_SCALE)) : 0;
      this.hudText.setText(`${this.stats.distance.toFixed(1)} m\nSOUTERRAIN\nboost cyan ${boostDistance}m`);
      return;
    }

    if (this.phase === 'recovering') {
      this.hudText.setText(`${this.stats.distance.toFixed(1)} m\nREMONTEE\nrocket pleine`);
      return;
    }

    const nextDistance = Math.ceil(this.getNextGoalDistance());
    const nextLine = nextDistance > 0 ? `${this.getNextGoalLabel()} ${nextDistance}m` : 'Signal final';
    this.hudText.setText(`${this.stats.distance.toFixed(1)} m\ncombo x${this.stats.combo}\n${nextLine}`);
  }

  private emitHud(): void {
    const snap = this.titan.getSnapshot();
    const nextGoalLabel = this.phase === 'underground' ? 'Boost cyan' : this.phase === 'recovering' ? 'Remontee surface' : this.getNextGoalLabel();
    const nextGoalDistance = this.phase === 'underground' ? this.getUndergroundBoostDistance() : this.phase === 'recovering' ? 0 : this.getNextGoalDistance();
    const hud: HudState = {
      distance: this.stats.distance,
      combo: this.stats.combo,
      speedPercent: clamp(Math.abs(snap.vx) / (this.playerStats.topSpeed + 320) * 100, 0, 100),
      jumpsLeft: snap.grounded ? this.playerStats.maxJumps : snap.jumpsLeft,
      maxJumps: this.playerStats.maxJumps,
      rocketPercent: clamp((snap.rocketFuel / this.playerStats.rocketMax) * 100, 0, 100),
      nextGoalLabel,
      nextGoalDistance,
      storyEvents: this.stats.storyEvents,
    };
    this.game.events.emit(GameEvents.HudUpdate, hud);
  }

  private getUndergroundBoost(): WorldEntity | undefined {
    return this.undergroundEntities.find((entity) => entity.type === 'undergroundBoost' && !entity.hit);
  }

  private getUndergroundBoostDistance(): number {
    const boost = this.getUndergroundBoost();
    if (!boost) {
      return 0;
    }

    return Math.max(0, (boost.x - this.titan.getSnapshot().x) * WORLD_SCALE);
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
          `phase: ${this.phase}`,
          `distance: ${this.stats.distance.toFixed(1)} m`,
          `vx/vy: ${snap.vx.toFixed(1)} / ${snap.vy.toFixed(1)}`,
          `grounded: ${snap.grounded}`,
          `jumps left: ${snap.jumpsLeft}`,
          `rocket: ${snap.rocketFuel.toFixed(1)} / ${this.playerStats.rocketMax}`,
          `bounce: ${this.playerStats.bouncePower.toFixed(0)}`,
          `story: ${this.stats.storyEvents}/${RUN_MILESTONES.length}`,
          `platforms: ${this.getActivePlatforms().length}`,
          `entities: ${this.getActiveEntities().length}`,
          `combo: ${this.stats.combo}`,
          `overdrives: ${this.stats.overdrives}`,
        ].join('\n'),
      );
    }

    this.hitboxGraphics.clear();
    if (!this.hitboxesVisible) {
      return;
    }

    this.hitboxGraphics.lineStyle(2, 0x62ff52, 0.9);
    for (const platform of this.getActivePlatforms()) {
      this.hitboxGraphics.strokeRect(platform.x, platform.y, platform.w, platform.h);
    }
    const snap = this.titan.getSnapshot();
    this.hitboxGraphics.lineStyle(2, 0xffffff, 0.9);
    this.hitboxGraphics.strokeRect(snap.x - snap.w * 0.42, snap.y, snap.w * 0.84, snap.h);
    const circle = this.titan.getCollisionCircle();
    this.hitboxGraphics.lineStyle(2, 0xff5b46, 0.9);
    this.hitboxGraphics.strokeCircle(circle.x, circle.y, circle.r);
    for (const entity of this.getActiveEntities()) {
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

  private spawnUndergroundTransition(x: number, y: number): void {
    const tunnelRing = this.add.ellipse(x, y - 34, 260, 78).setDepth(16).setStrokeStyle(6, 0x8cfffb, 0.62);
    this.tweens.add({
      targets: tunnelRing,
      alpha: 0,
      scaleX: 1.45,
      scaleY: 0.58,
      duration: 520,
      onComplete: () => tunnelRing.destroy(),
    });

    for (let i = 0; i < 24; i += 1) {
      this.createParticle(
        x + Math.random() * 220 - 110,
        y - 18 + Math.random() * 34,
        -120 + Math.random() * 240,
        -260 - Math.random() * 220,
        Math.random() > 0.5 ? 0x8cfffb : 0x2b4464,
        0.36 + Math.random() * 0.32,
      );
    }
  }

  private spawnBoostTunnel(x: number, y: number): void {
    for (let i = 0; i < 5; i += 1) {
      const ring = this.add.ellipse(x + i * 62, y, 96 + i * 42, 62 + i * 12).setDepth(16).setStrokeStyle(4, i % 2 === 0 ? 0x8cfffb : 0xffd36a, 0.46);
      this.tweens.add({
        targets: ring,
        x: ring.x + 280 + i * 36,
        alpha: 0,
        scaleX: 1.8,
        scaleY: 0.6,
        duration: 360 + i * 42,
        onComplete: () => ring.destroy(),
      });
    }

    for (let i = 0; i < 18; i += 1) {
      const line = this.add
        .rectangle(x - 40 + Math.random() * 120, y + Math.random() * 120 - 60, 80 + Math.random() * 90, 4, 0x8cfffb, 0.38)
        .setDepth(22)
        .setRotation((Math.random() - 0.5) * 0.18);
      this.tweens.add({
        targets: line,
        x: line.x + 380 + Math.random() * 180,
        alpha: 0,
        scaleX: 1.5,
        duration: 240 + Math.random() * 160,
        onComplete: () => line.destroy(),
      });
    }
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

    if (this.rocketVisualCooldown > 0) {
      return;
    }

    this.rocketVisualCooldown = 0.1;
    this.spawnBoostWake(x, y, facing);
  }

  private spawnBoostWake(x: number, y: number, facing: number): void {
    const flameX = x - facing * 68;
    const flame = this.add
      .triangle(
        flameX,
        y + Math.random() * 16 - 8,
        -facing * 44,
        0,
        facing * 12,
        -20,
        facing * 12,
        20,
        0xffd36a,
        0.66,
      )
      .setDepth(19);
    this.tweens.add({
      targets: flame,
      x: flame.x - facing * 52,
      alpha: 0,
      scaleX: 0.42,
      scaleY: 0.7,
      duration: 170,
      onComplete: () => flame.destroy(),
    });

    const distortion = this.add
      .ellipse(x - facing * 12, y, 118, 70)
      .setDepth(21)
      .setStrokeStyle(3, 0x8cfffb, 0.2)
      .setFillStyle(0x8cfffb, 0.018);
    this.tweens.add({
      targets: distortion,
      x: distortion.x - facing * 26,
      alpha: 0,
      scaleX: 1.25,
      scaleY: 0.74,
      duration: 180,
      onComplete: () => distortion.destroy(),
    });

    for (let i = 0; i < 3; i += 1) {
      const line = this.add
        .rectangle(
          x - facing * (82 + Math.random() * 90),
          y + Math.random() * 90 - 45,
          60 + Math.random() * 46,
          3,
          i === 0 ? 0xecfff0 : 0x8cfffb,
          0.32,
        )
        .setDepth(22)
        .setRotation((Math.random() - 0.5) * 0.12);
      this.tweens.add({
        targets: line,
        x: line.x - facing * (90 + Math.random() * 60),
        alpha: 0,
        scaleX: 1.35,
        duration: 170 + Math.random() * 80,
        onComplete: () => line.destroy(),
      });
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

  private finishRun(): void {
    if (this.ended) {
      return;
    }

    this.ended = true;
    const finishedUnderground = this.phase === 'underground';
    this.phase = 'gameOver';
    const finishReason: RunSummary['finishReason'] = 'fall';
    this.titan.knockOut();
    soundSystem.finish();
    this.game.events.emit(GameEvents.Message, {
      title: finishedUnderground ? 'Chute sous le souterrain' : 'Chute dans le vide',
      body: finishedUnderground
        ? 'La seconde chance est ratee : attrape le boost cyan avant le prochain trou.'
        : 'Saute plus tot ou garde un peu de rocket pour corriger la prochaine trajectoire.',
    });
    const summary: RunSummary = saveSystem.recordRun(this.stats, this.seed, finishReason);
    this.game.events.emit(GameEvents.SaveChanged, saveSystem.getSnapshot());
    const showResult = () => {
      this.game.events.emit(GameEvents.RunFinished, summary);
      this.scene.start('ResultScene', { summary });
    };

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
      overdrives: 0,
      combo: 0,
      bestCombo: 0,
      storyEvents: 0,
      bestMilestone: '',
      milestonesReached: [],
    };
  }

  private makeSeed(): string {
    return `run-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  }
}
