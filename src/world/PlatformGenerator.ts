import alea from 'alea';
import { createNoise2D } from 'simplex-noise';
import { GROUND_Y, clamp } from '../game/constants';
import type { EntityDraft, PlatformData, PlatformKind } from '../types/game';
import { DifficultyCurve } from './DifficultyCurve';

export class PlatformGenerator {
  private readonly random: () => number;
  private readonly noise2D: (x: number, y: number) => number;

  constructor(
    seed: string | number,
    private readonly curve = new DifficultyCurve(),
  ) {
    this.random = alea(seed);
    this.noise2D = createNoise2D(this.random);
  }

  nextPlatform(previous: PlatformData, id: number): PlatformData {
    const difficulty = this.curve.sample(previous.x + previous.w);
    const kind = this.pickKind(difficulty, id);
    const gap = this.lerp(difficulty.minGap, difficulty.maxGap, this.random());
    const baseWidth = this.lerp(difficulty.minWidth, difficulty.maxWidth, this.random());
    const width = this.getWidth(baseWidth, difficulty.value, kind);
    const noise = this.noise2D(id * 0.23, 0.4);
    const stepPressure = id > 5 && id % 4 === 0 ? 74 + difficulty.value * 104 : 0;
    const routeSeparation = id > 3 ? difficulty.value * 54 + (kind === 'path' ? 82 : kind === 'ramp' ? 44 : 0) : 0;
    const rawY = clamp(
      previous.y + noise * difficulty.verticalRange + (this.random() - 0.5) * 165,
      430,
      GROUND_Y - 56,
    );
    const y = this.getRouteY(rawY, previous.y, kind);

    return {
      id,
      x: previous.x + previous.w + gap + stepPressure + routeSeparation,
      y,
      w: width,
      h: kind === 'path' ? 28 + this.random() * 10 : kind === 'ramp' ? 48 + this.random() * 16 : 34 + this.random() * 18,
      kind,
    };
  }

  decorate(platform: PlatformData): EntityDraft[] {
    const difficulty = this.curve.sample(platform.x);
    const entities: EntityDraft[] = [];
    const boneCount = platform.kind === 'path' ? 2 + Math.floor(this.random() * 3) : 1 + Math.floor(this.random() * 3);

    for (let i = 0; i < boneCount; i += 1) {
      const floating = this.random() < (platform.kind === 'path' ? difficulty.floatingBoneChance * 0.58 : difficulty.floatingBoneChance);
      entities.push({
        type: 'bone',
        x: platform.x + 55 + this.random() * Math.max(60, platform.w - 110),
        y: platform.y - (floating ? 170 + this.random() * 190 : 66),
        r: 19,
        value: floating ? 5 : 3,
        bob: this.random() * Math.PI * 2,
      });
    }

    return entities;
  }

  private lerp(min: number, max: number, ratio: number): number {
    return min + (max - min) * ratio;
  }

  private pickKind(difficulty: ReturnType<DifficultyCurve['sample']>, id: number): PlatformKind {
    if (id < 2) {
      return 'normal';
    }

    const roll = this.random();
    if (roll < difficulty.boostChance) {
      return 'boost';
    }

    if (roll < difficulty.boostChance + difficulty.rampChance) {
      return 'ramp';
    }

    if (roll < difficulty.boostChance + difficulty.rampChance + difficulty.pathChance) {
      return 'path';
    }

    return 'normal';
  }

  private getWidth(baseWidth: number, difficulty: number, kind: PlatformKind): number {
    if (kind === 'path') {
      return clamp(baseWidth * 1.42 + 150, 360, 720 - difficulty * 130);
    }

    if (kind === 'ramp') {
      return clamp(baseWidth * 1.12 + 72, 230, 510 - difficulty * 80);
    }

    return baseWidth;
  }

  private getRouteY(rawY: number, previousY: number, kind: PlatformKind): number {
    if (kind === 'path') {
      return clamp(previousY + (this.random() - 0.42) * 90, GROUND_Y - 215, GROUND_Y - 38);
    }

    if (kind === 'ramp') {
      return clamp(rawY + 70 + this.random() * 90, 520, GROUND_Y - 44);
    }

    return rawY;
  }
}
