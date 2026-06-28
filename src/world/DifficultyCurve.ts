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
  rampChance: number;
  pathChance: number;
  floatingBoneChance: number;
}

export class DifficultyCurve {
  sample(worldX: number): DifficultyState {
    const value = clamp(worldX / 6200, 0, 1);

    return {
      value,
      minGap: 150 + value * 74,
      maxGap: 380 + value * 190,
      minWidth: 172 - value * 42,
      maxWidth: 470 - value * 155,
      verticalRange: 340 + value * 300,
      mineChance: 0.23 + value * 0.3,
      boostChance: Math.max(0.07, 0.14 - value * 0.03),
      rampChance: 0.12 + value * 0.08,
      pathChance: Math.max(0.07, 0.17 - value * 0.07),
      floatingBoneChance: 0.58 + value * 0.18,
    };
  }
}
