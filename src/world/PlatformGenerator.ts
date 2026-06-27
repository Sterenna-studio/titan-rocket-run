import alea from 'alea';
import { createNoise2D } from 'simplex-noise';
import { GROUND_Y, clamp } from '../game/constants';
import type { EntityDraft, PlatformData } from '../types/game';
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
    const gap = this.lerp(difficulty.minGap, difficulty.maxGap, this.random());
    const width = this.lerp(difficulty.minWidth, difficulty.maxWidth, this.random());
    const noise = this.noise2D(id * 0.23, 0.4);
    const stepPressure = id > 5 && id % 4 === 0 ? 58 + difficulty.value * 80 : 0;
    const y = clamp(
      previous.y + noise * difficulty.verticalRange + (this.random() - 0.5) * 165,
      430,
      GROUND_Y - 56,
    );

    return {
      id,
      x: previous.x + previous.w + gap + stepPressure,
      y,
      w: width,
      h: 34 + this.random() * 18,
      kind: this.random() < difficulty.boostChance ? 'boost' : 'normal',
    };
  }

  decorate(platform: PlatformData): EntityDraft[] {
    const difficulty = this.curve.sample(platform.x);
    const entities: EntityDraft[] = [];
    const boneCount = 1 + Math.floor(this.random() * 3);

    for (let i = 0; i < boneCount; i += 1) {
      const floating = this.random() < difficulty.floatingBoneChance;
      entities.push({
        type: 'bone',
        x: platform.x + 55 + this.random() * Math.max(60, platform.w - 110),
        y: platform.y - (floating ? 170 + this.random() * 190 : 66),
        r: 19,
        value: floating ? 5 : 3,
        bob: this.random() * Math.PI * 2,
      });
    }

    const mineRolls = 1 + (difficulty.value > 0.42 && platform.w > 210 ? 1 : 0);
    for (let i = 0; i < mineRolls; i += 1) {
      const chance = i === 0 ? difficulty.mineChance : difficulty.mineChance * 0.46;
      if (platform.id <= 1 || this.random() >= chance) {
        continue;
      }

      const airborne = i > 0 || (difficulty.value > 0.68 && this.random() < 0.28);
      entities.push({
        type: 'mine',
        x: platform.x + 70 + this.random() * Math.max(40, platform.w - 140),
        y: platform.y - (airborne ? 92 + this.random() * 86 : 30),
        r: airborne ? 27 : 24,
        value: 0,
        bob: this.random() * Math.PI * 2,
      });
    }

    return entities;
  }

  private lerp(min: number, max: number, ratio: number): number {
    return min + (max - min) * ratio;
  }
}
