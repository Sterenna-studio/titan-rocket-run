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
    const y = clamp(
      previous.y + noise * difficulty.verticalRange + (this.random() - 0.5) * 125,
      430,
      GROUND_Y - 56,
    );

    return {
      id,
      x: previous.x + previous.w + gap,
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

    if (platform.id > 1 && this.random() < difficulty.mineChance) {
      entities.push({
        type: 'mine',
        x: platform.x + 80 + this.random() * Math.max(40, platform.w - 160),
        y: platform.y - 30,
        r: 24,
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
