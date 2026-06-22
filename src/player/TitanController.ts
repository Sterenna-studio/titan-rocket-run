import Phaser from 'phaser';
import {
  DEATH_Y,
  GRAVITY,
  LAUNCH_MAX_VX,
  LAUNCH_MAX_VY,
  LAUNCH_MIN_VX,
  LAUNCH_MIN_VY,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  SKY_Y,
  SPACE_LOST_SECONDS,
  SPACE_Y,
  START_X,
  TITAN_BOTTOM_PAD,
  WORLD_SCALE,
  GROUND_Y,
  clamp,
} from '../game/constants';
import type {
  CollisionCircle,
  InputState,
  PlatformData,
  PlayerSnapshot,
  PlayerStats,
  PlayerStepResult,
} from '../types/game';
import { defaultTitanFrame, scaleTitanSprite, titanAnimKey } from './TitanAnimations';

type TitanAnimationName = 'idle' | 'walk' | 'run' | 'jump' | 'bark_energy_blast' | 'hurt' | 'knockout';

export class TitanController {
  readonly sprite: Phaser.GameObjects.Sprite;

  private stats: PlayerStats;
  private state: PlayerSnapshot;
  private facing = 1;
  private currentAnimation: TitanAnimationName = 'idle';
  private rotation = 0;
  private launchSpeedCapBonus = 0;

  constructor(private readonly scene: Phaser.Scene, stats: PlayerStats) {
    this.stats = stats;
    this.state = this.createInitialState(stats);
    this.sprite = scene.add.sprite(START_X, GROUND_Y + TITAN_BOTTOM_PAD, defaultTitanFrame()).setOrigin(0.5, 1).setDepth(20);
    scaleTitanSprite(scene, this.sprite);
    this.sprite.on(Phaser.Animations.Events.ANIMATION_UPDATE, () => scaleTitanSprite(scene, this.sprite));
    this.sprite.on(Phaser.Animations.Events.ANIMATION_START, () => scaleTitanSprite(scene, this.sprite));
    this.play('idle');
    this.syncSprite();
  }

  reset(stats: PlayerStats): void {
    this.stats = stats;
    this.state = this.createInitialState(stats);
    this.facing = 1;
    this.rotation = 0;
    this.launchSpeedCapBonus = 0;
    this.currentAnimation = 'idle';
    this.play('run');
    this.syncSprite();
  }

  update(dt: number, input: InputState, platforms: PlatformData[]): PlayerStepResult {
    const wasGrounded = this.state.grounded;
    let rocketUsed = false;
    let boostPad = false;
    let bounceUsed = false;

    this.state.hurt = Math.max(0, this.state.hurt - dt);
    this.state.invuln = Math.max(0, this.state.invuln - dt);

    const acceleration = this.state.grounded ? this.stats.groundAcceleration : this.stats.airAcceleration;
    if (input.left) {
      this.state.vx -= acceleration * dt;
      this.facing = -1;
    }
    if (input.right) {
      this.state.vx += acceleration * dt;
      this.facing = 1;
    }

    if (!input.left && !input.right && this.state.grounded) {
      this.state.vx *= Math.pow(0.82, dt * 10);
    } else if (!this.state.grounded) {
      this.state.vx *= 1 - this.stats.airDrag * dt;
    }

    if (input.rocket && !this.state.grounded && this.state.rocketFuel > 0) {
      this.state.vx += this.facing * this.stats.rocketPush * dt;
      this.state.vy -= this.stats.rocketLift * dt;
      this.state.rocketFuel = Math.max(0, this.state.rocketFuel - 42 * dt);
      rocketUsed = true;
    } else if (this.state.grounded) {
      this.state.rocketFuel = Math.min(this.stats.rocketMax, this.state.rocketFuel + 8 * dt);
    }

    this.state.vx = clamp(
      this.state.vx,
      -this.stats.topSpeed * 0.74 - this.launchSpeedCapBonus * 0.5,
      this.stats.topSpeed + (rocketUsed ? 580 : 0) + this.launchSpeedCapBonus,
    );
    this.launchSpeedCapBonus = Math.max(0, this.launchSpeedCapBonus - 720 * dt);
    this.updateSpaceExposure(dt);

    const prevY = this.state.y;
    this.state.vy += GRAVITY * this.stats.gravityScale * this.getAltitudeGravityScale() * dt;
    this.state.vy = Math.min(this.state.vy, 1180);
    this.state.x += this.state.vx * dt;
    this.state.y += this.state.vy * dt;

    const impactVy = this.state.vy;
    const collision = this.collidePlatforms(prevY, platforms, wasGrounded);
    boostPad = collision.boostPad;
    if (boostPad && Math.abs(this.state.vx) < this.stats.topSpeed * 0.96) {
      this.state.vx += this.facing * 230;
    }

    if (collision.landed && input.jumpHeld && this.stats.bouncePower > 0 && impactVy > 360) {
      this.rebound(impactVy);
      bounceUsed = true;
    }

    if (!this.state.grounded && wasGrounded) {
      this.setCoyote(0.11);
    } else if (!this.state.grounded) {
      this.setCoyote(Math.max(0, this.state.coyote - dt));
    }

    this.pickAnimation(rocketUsed);
    this.syncSprite();

    return {
      landed: collision.landed,
      boostPad,
      rocketUsed,
      bounceUsed,
      impactSpeed: collision.landed ? impactVy : 0,
    };
  }

  tryJump(): boolean {
    const groundJump = this.state.grounded || this.state.coyote > 0;
    if (!groundJump && this.state.jumpsLeft <= 0) {
      return false;
    }

    this.state.grounded = false;
    this.state.coyote = 0;
    if (!groundJump) {
      this.state.jumpsLeft = Math.max(0, this.state.jumpsLeft - 1);
    } else {
      this.state.jumpsLeft = Math.max(0, this.stats.maxJumps - 1);
    }
    this.state.vy = -this.stats.jumpPower * (groundJump ? 1 : this.stats.airJumpPowerRatio);
    this.state.vx += this.facing * (groundJump ? 18 : 36);
    this.play('jump', true);
    this.syncSprite();
    return true;
  }

  launch(charge: number, direction: number): void {
    const power = clamp(charge, 0, 1);
    this.facing = direction < 0 ? -1 : 1;
    this.state.grounded = false;
    this.state.coyote = 0;
    this.state.jumpsLeft = Math.max(0, this.stats.maxJumps - 1);
    this.launchSpeedCapBonus = LAUNCH_MIN_VX + LAUNCH_MAX_VX * power + this.stats.startVelocity * 0.5;
    this.state.vx = this.facing * (this.stats.startVelocity + this.launchSpeedCapBonus);
    this.state.vy = -(LAUNCH_MIN_VY + LAUNCH_MAX_VY * power);
    this.state.rocketFuel = Math.min(this.stats.rocketMax, this.state.rocketFuel + 12 + power * 18);
    this.play('jump', true);
    this.syncSprite();
  }

  releaseJump(): void {
    if (this.state.vy < -this.stats.jumpPower * 0.42) {
      this.state.vy *= 0.58;
    }
  }

  collectBone(value: number): void {
    this.state.rocketFuel = Math.min(this.stats.rocketMax, this.state.rocketFuel + 9);
    this.state.vx += this.facing * (24 + value);
  }

  awardRunReward(rocketPercent: number, speedBoost: number): void {
    const rocketGain = this.stats.rocketMax * clamp(rocketPercent, 0, 100) / 100;
    this.state.rocketFuel = Math.min(this.stats.rocketMax, this.state.rocketFuel + rocketGain);
    this.state.vx += this.facing * speedBoost;
    if (this.state.vy > -260) {
      this.state.vy -= 120;
    }
    this.syncSprite();
  }

  applyMineHit(): boolean {
    if (this.state.invuln > 0) {
      return false;
    }

    this.state.invuln = 0.65;
    this.state.hurt = 0.38;
    this.state.vx *= this.stats.bouncePower > 0 ? 0.86 : 0.76;
    this.state.vy = Math.min(this.state.vy, this.stats.bouncePower > 0 ? -this.stats.bouncePower * 0.82 : -260);
    if (this.stats.bouncePower > 0) {
      this.state.vx += this.facing * this.stats.bouncePush;
    }
    this.play('hurt', true);
    return true;
  }

  knockOut(): void {
    this.play('knockout', true);
  }

  crashIntoGround(groundY: number): number {
    const bottom = this.state.y + this.state.h;
    if (this.state.vy <= 0 || bottom < groundY) {
      return 0;
    }

    const impactSpeed = this.state.vy;
    this.state.y = groundY - this.state.h;
    this.state.vy = 0;
    this.state.vx *= 0.16;
    this.state.grounded = true;
    this.state.coyote = 0;
    this.state.jumpsLeft = 0;
    this.state.hurt = 0.5;
    this.rotation = 0.18 * this.facing;
    this.play('hurt', true);
    this.syncSprite();
    return impactSpeed;
  }

  isDead(): boolean {
    return this.state.y > DEATH_Y || this.isLostInSpace();
  }

  isLostInSpace(): boolean {
    return !this.stats.hasSpaceSuit && (this.state.spaceExposure >= SPACE_LOST_SECONDS || this.state.y < -320);
  }

  getSnapshot(): PlayerSnapshot {
    return { ...this.state };
  }

  getDistanceMeters(): number {
    return Math.max(0, (this.state.x - START_X) * WORLD_SCALE);
  }

  getCollisionCircle(): CollisionCircle {
    return {
      x: this.state.x,
      y: this.state.y + this.state.h * 0.52,
      r: 42,
    };
  }

  private createInitialState(stats: PlayerStats): PlayerSnapshot {
    return {
      x: START_X,
      y: GROUND_Y - PLAYER_HEIGHT,
      w: PLAYER_WIDTH,
      h: PLAYER_HEIGHT,
      vx: stats.startVelocity,
      vy: 0,
      grounded: true,
      coyote: 0.09,
      jumpsLeft: stats.maxJumps - 1,
      rocketFuel: stats.rocketMax,
      hurt: 0,
      invuln: 0,
      spaceExposure: 0,
    };
  }

  private collidePlatforms(prevY: number, platforms: PlatformData[], wasGrounded: boolean): { landed: boolean; boostPad: boolean } {
    this.state.grounded = false;

    for (const platform of platforms) {
      const over =
        this.state.x + this.state.w * 0.42 > platform.x &&
        this.state.x - this.state.w * 0.42 < platform.x + platform.w;
      const prevBottom = prevY + this.state.h;
      const bottom = this.state.y + this.state.h;

      if (over && this.state.vy >= 0 && prevBottom <= platform.y + 14 && bottom >= platform.y && bottom <= platform.y + 70) {
        this.state.y = platform.y - this.state.h;
        this.state.vy = 0;
        this.state.grounded = true;
        this.state.jumpsLeft = Math.max(0, this.stats.maxJumps - 1);
        this.rotation = 0;
        this.state.coyote = 0.09;

        return {
          landed: !wasGrounded,
          boostPad: platform.kind === 'boost',
        };
      }
    }

    return { landed: false, boostPad: false };
  }

  private rebound(impactVy: number): void {
    const extra = clamp(impactVy * 0.16, 0, 180);
    this.state.grounded = false;
    this.state.coyote = 0;
    this.state.vy = -(this.stats.bouncePower + extra);
    this.state.vx += this.facing * this.stats.bouncePush;
    this.state.jumpsLeft = Math.max(0, this.stats.maxJumps - 1);
    this.play('jump', true);
  }

  private getAltitudeGravityScale(): number {
    if (this.state.y < SPACE_Y) {
      return this.stats.hasSpaceSuit ? 0.28 : 0.12;
    }

    if (this.state.y < SKY_Y) {
      return 0.58;
    }

    return 1;
  }

  private updateSpaceExposure(dt: number): void {
    if (this.state.y < SPACE_Y && !this.stats.hasSpaceSuit) {
      this.state.spaceExposure += dt;
      return;
    }

    this.state.spaceExposure = Math.max(0, this.state.spaceExposure - dt * 2);
  }

  private pickAnimation(rocketUsed: boolean): void {
    if (this.state.hurt > 0) {
      this.play('hurt');
      return;
    }

    if (!this.state.grounded) {
      this.rotation = clamp(this.state.vy / 1400, -0.2, 0.42);
      this.play(rocketUsed ? 'bark_energy_blast' : 'jump');
      return;
    }

    this.rotation = 0;
    const speed = Math.abs(this.state.vx);
    if (speed > 360) {
      this.play('run');
    } else if (speed > 50) {
      this.play('walk');
    } else {
      this.play('idle');
    }
  }

  private play(animation: TitanAnimationName, restart = false): void {
    if (!restart && this.currentAnimation === animation) {
      return;
    }

    this.currentAnimation = animation;
    this.sprite.play(titanAnimKey(animation), restart);
    scaleTitanSprite(this.scene, this.sprite);
  }

  private syncSprite(): void {
    this.sprite.setPosition(this.state.x, this.state.y + this.state.h + TITAN_BOTTOM_PAD);
    this.sprite.setFlipX(this.facing < 0);
    this.sprite.setRotation(this.rotation);
    this.sprite.setAlpha(this.state.invuln > 0 && Math.floor(this.scene.time.now / 80) % 2 === 0 ? 0.55 : 1);
  }

  private setCoyote(value: number): void {
    this.state.coyote = value;
  }
}
