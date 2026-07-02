import Phaser from 'phaser';
import {
  DEATH_Y,
  GRAVITY,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  START_X,
  TITAN_BOTTOM_PAD,
  WORLD_SCALE,
  GROUND_Y,
  clamp,
} from '../game/constants';
import type {
  CollisionCircle,
  InputState,
  ObstacleEntityKind,
  PlatformData,
  PlayerSnapshot,
  PlayerStats,
  PlayerStepResult,
} from '../types/game';
import { defaultTitanFrame, getTitanFrameScale, scaleTitanSprite, titanAnimKey } from './TitanAnimations';

type TitanAnimationName = 'idle' | 'walk' | 'run' | 'jump' | 'bark_energy_blast' | 'hurt' | 'knockout';

export class TitanController {
  readonly sprite: Phaser.GameObjects.Sprite;

  private stats: PlayerStats;
  private state: PlayerSnapshot;
  private facing = 1;
  private currentAnimation: TitanAnimationName = 'idle';
  private rotation = 0;
  private speedBonus = 0;
  private speedStretch = 0;
  private landingSquash = 0;
  private launchWobble = 0;

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
    this.speedBonus = 0;
    this.speedStretch = 0;
    this.landingSquash = 0;
    this.launchWobble = 0;
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
    this.speedStretch = Math.max(0, this.speedStretch - dt * 3.2);
    this.landingSquash = Math.max(0, this.landingSquash - dt * 5.8);
    this.launchWobble = Math.max(0, this.launchWobble - dt * 1.8);

    this.facing = 1;
    this.applyRunnerSpeed(dt, input);

    if (input.rocket && this.state.rocketFuel > 0) {
      this.state.vx += this.stats.rocketPush * dt;
      if (!this.state.grounded) {
        this.state.vy -= this.stats.rocketLift * dt;
      }
      this.state.rocketFuel = Math.max(0, this.state.rocketFuel - 48 * dt);
      rocketUsed = true;
      this.speedStretch = Math.max(this.speedStretch, 0.065);
    } else if (this.state.grounded) {
      this.state.rocketFuel = Math.min(this.stats.rocketMax, this.state.rocketFuel + (this.stats.hasSpaceSuit ? 13 : 10) * dt);
    }

    this.state.vx = clamp(
      this.state.vx,
      this.stats.startVelocity * 0.62,
      this.stats.topSpeed + 420 + this.speedBonus,
    );

    const prevY = this.state.y;
    this.state.vy += GRAVITY * this.stats.gravityScale * dt;
    this.state.vy = Math.min(this.state.vy, 1180);
    this.state.x += this.state.vx * dt;
    this.state.y += this.state.vy * dt;

    const impactVy = this.state.vy;
    const collision = this.collidePlatforms(prevY, platforms, wasGrounded);
    boostPad = collision.boostPad;
    if (boostPad && Math.abs(this.state.vx) < this.stats.topSpeed * 0.96) {
      this.state.vx += 190;
    }
    if (boostPad) {
      this.speedStretch = Math.max(this.speedStretch, 0.085);
    }
    if (collision.landed) {
      this.landingSquash = Math.max(this.landingSquash, clamp((impactVy - 280) / 760, 0.08, 1));
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

    this.pickAnimation();
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

  releaseJump(): void {
    if (this.state.vy < -this.stats.jumpPower * 0.42) {
      this.state.vy *= 0.58;
    }
  }

  collectBone(value: number): void {
    this.state.rocketFuel = Math.min(this.stats.rocketMax, this.state.rocketFuel + 9);
    this.state.vx += 18 + value;
  }

  awardRunReward(rocketPercent: number, speedBoost: number): void {
    const rocketGain = this.stats.rocketMax * clamp(rocketPercent, 0, 100) / 100;
    this.state.rocketFuel = Math.min(this.stats.rocketMax, this.state.rocketFuel + rocketGain);
    this.speedBonus = Math.max(this.speedBonus, speedBoost * 0.28);
    this.speedStretch = Math.max(this.speedStretch, clamp(speedBoost / 2600, 0.04, 0.13));
    this.state.vx += speedBoost * 0.18;
    this.syncSprite();
  }

  applyChargedLaunch(power: number, unstable = false): void {
    const charge = clamp(power, 0, 1);
    const boost = 110 + charge * 520 + (unstable ? 110 : 0);
    this.state.vx += boost;
    this.speedBonus = Math.max(this.speedBonus, boost * 0.72);
    this.speedStretch = Math.max(this.speedStretch, 0.08 + charge * 0.09);
    this.landingSquash = Math.max(this.landingSquash, 0.1);
    this.launchWobble = unstable ? 1 : 0;
    this.state.rocketFuel = unstable ? Math.max(this.state.rocketFuel, this.stats.rocketMax * 0.72) : this.stats.rocketMax;
    this.syncSprite();
  }

  hitObstacle(kind: ObstacleEntityKind): boolean {
    if (this.state.invuln > 0) {
      return false;
    }

    const severity =
      kind === 'menhir'
        ? 1
        : kind === 'granny'
          ? 0.78
          : kind === 'cable'
            ? 0.62
            : kind === 'seagull'
              ? 0.44
              : 0.32;
    const penalty = 150 + severity * 300;
    this.state.vx = Math.max(this.stats.startVelocity * 0.66, this.state.vx - penalty);
    this.speedBonus = Math.max(0, this.speedBonus - penalty * 0.45);
    this.state.rocketFuel = Math.max(0, this.state.rocketFuel - (kind === 'cable' ? 18 : 10 + severity * 8));
    this.state.hurt = 0.28 + severity * 0.2;
    this.state.invuln = 0.52 + severity * 0.22;
    this.landingSquash = Math.max(this.landingSquash, 0.16 + severity * 0.12);
    this.speedStretch = 0;

    if (kind === 'gust') {
      this.state.vx += 70;
      this.state.vy -= 145;
      this.rotation -= 0.14;
    } else {
      this.state.vy = Math.min(this.state.vy, -80 - severity * 60);
      this.rotation += 0.12;
    }

    this.play('hurt', true);
    this.syncSprite();
    return true;
  }

  placeOnPlatform(
    x: number,
    platformY: number,
    velocityX: number,
    rocketPercent = 60,
    invuln = 0.7,
    speedBonus = 0,
  ): void {
    this.state.x = x;
    this.state.y = platformY - this.state.h;
    this.state.vx = Math.max(velocityX, this.stats.startVelocity * 0.72);
    this.state.vy = 0;
    this.state.grounded = true;
    this.state.coyote = 0.12;
    this.state.jumpsLeft = Math.max(0, this.stats.maxJumps - 1);
    this.state.rocketFuel = Math.max(this.state.rocketFuel, this.stats.rocketMax * clamp(rocketPercent, 0, 100) / 100);
    this.state.hurt = 0;
    this.state.invuln = Math.max(this.state.invuln, invuln);
    this.speedBonus = Math.max(this.speedBonus, speedBonus);
    this.speedStretch = Math.max(this.speedStretch, clamp(speedBonus / 3600, 0.06, 0.16));
    this.landingSquash = Math.max(this.landingSquash, 0.18);
    this.rotation = 0;
    this.play('run', true);
    this.syncSprite();
  }

  knockOut(): void {
    this.play('knockout', true);
  }

  isDead(): boolean {
    return this.state.y > DEATH_Y;
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
    };
  }

  private collidePlatforms(prevY: number, platforms: PlatformData[], wasGrounded: boolean): { landed: boolean; boostPad: boolean } {
    this.state.grounded = false;
    const prevBottom = prevY + this.state.h;
    const bottom = this.state.y + this.state.h;

    for (const platform of platforms) {
      const over =
        this.state.x + this.state.w * 0.42 > platform.x &&
        this.state.x - this.state.w * 0.42 < platform.x + platform.w;

      if (over && this.state.vy >= 0 && prevBottom <= platform.y + 14 && bottom >= platform.y && bottom <= platform.y + 70) {
        this.state.y = platform.y - this.state.h;
        this.state.grounded = true;
        this.state.jumpsLeft = Math.max(0, this.stats.maxJumps - 1);
        this.rotation = 0;
        this.state.coyote = 0.09;
        if (platform.kind === 'ramp') {
          const direction = this.state.vx < -80 ? -1 : this.state.vx > 80 ? 1 : this.facing;
          this.state.vx += direction * (280 + clamp(Math.abs(this.state.vx) * 0.1, 0, 180));
          this.state.vy = -(190 + clamp(Math.abs(this.state.vx) * 0.08, 0, 190));
          this.state.grounded = false;
          this.state.coyote = 0;
        } else {
          this.state.vy = 0;
        }

        return {
          landed: !wasGrounded,
          boostPad: platform.kind === 'boost' || platform.kind === 'ramp',
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
    this.state.vx += this.stats.bouncePush;
    this.state.jumpsLeft = Math.max(0, this.stats.maxJumps - 1);
    this.play('jump', true);
  }

  private applyRunnerSpeed(dt: number, input: InputState): void {
    const cruise = this.stats.startVelocity + this.speedBonus;
    const target = clamp(
      cruise + (input.right ? 95 : 0) - (input.left ? 145 : 0),
      this.stats.startVelocity * 0.68,
      this.stats.topSpeed,
    );

    if (this.state.grounded) {
      const blend = Math.min(1, dt * 3.8);
      if (target > this.state.vx || input.left) {
        this.state.vx += (target - this.state.vx) * blend;
      }
      return;
    }

    if (input.left) {
      this.state.vx -= this.stats.airAcceleration * 0.42 * dt;
    }
    if (input.right) {
      this.state.vx += this.stats.airAcceleration * 0.42 * dt;
    }
    this.state.vx *= 1 - this.stats.airDrag * dt;
  }

  private pickAnimation(): void {
    if (this.state.hurt > 0) {
      this.play('hurt');
      return;
    }

    if (!this.state.grounded) {
      this.rotation = clamp(this.state.vy / 1400, -0.2, 0.42);
      this.play('jump');
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
    const wobble = this.launchWobble > 0 ? Math.sin(this.scene.time.now * 0.018) * 0.08 * this.launchWobble : 0;
    this.sprite.setRotation(this.rotation + wobble);
    this.sprite.setAlpha(this.state.invuln > 0 && Math.floor(this.scene.time.now / 80) % 2 === 0 ? 0.55 : 1);
    const baseScale = getTitanFrameScale(this.scene, this.sprite);
    const speedRatio = clamp(
      (Math.abs(this.state.vx) - this.stats.startVelocity * 0.95) / Math.max(1, this.stats.topSpeed + this.speedBonus + 240 - this.stats.startVelocity),
      0,
      1,
    );
    const stretchX = 1 + speedRatio * 0.075 + this.speedStretch;
    const stretchY = 1 - speedRatio * 0.038 - this.speedStretch * 0.36;
    const squashX = 1 + this.landingSquash * 0.13;
    const squashY = 1 - this.landingSquash * 0.16;
    this.sprite.setScale(baseScale * stretchX * squashX, baseScale * Math.max(0.78, stretchY * squashY));
  }

  private setCoyote(value: number): void {
    this.state.coyote = value;
  }
}
