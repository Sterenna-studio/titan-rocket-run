import { clamp } from '../game/constants';

export interface DifficultyState {
  value: number;
  minGap: number;
  maxGap: number;
  minWidth: number;
  maxWidth: number;
  verticalRange: number;
  mineChance: number;
  boostChance: number;
  floatingBoneChance: number;
}

export class DifficultyCurve {
  sample(worldX: number): DifficultyState {
    const value = clamp(worldX / 6200, 0, 1);

    return {
      value,
      minGap: 128 + value * 58,
      maxGap: 325 + value * 150,
      minWidth: 190 - value * 55,
      maxWidth: 500 - value * 180,
      verticalRange: 310 + value * 265,
      mineChance: 0.23 + value * 0.3,
      boostChance: Math.max(0.07, 0.14 - value * 0.03),
      floatingBoneChance: 0.58 + value * 0.18,
    };
  }
}
