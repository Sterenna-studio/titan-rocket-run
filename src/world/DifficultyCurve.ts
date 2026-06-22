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
    const value = clamp(worldX / 7600, 0, 1);

    return {
      value,
      minGap: 112 + value * 32,
      maxGap: 285 + value * 92,
      minWidth: 210 - value * 35,
      maxWidth: 560 - value * 120,
      verticalRange: 265 + value * 210,
      mineChance: 0.16 + value * 0.2,
      boostChance: 0.15 + value * 0.04,
      floatingBoneChance: 0.48 + value * 0.1,
    };
  }
}
