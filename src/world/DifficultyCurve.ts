import { clamp } from '../game/constants';

export interface DifficultyState {
  value: number;
  minGap: number;
  maxGap: number;
  minWidth: number;
  maxWidth: number;
  verticalRange: number;
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
      minGap: 95 + value * 55,
      maxGap: 250 + value * 95,
      minWidth: 300 - value * 58,
      maxWidth: 680 - value * 120,
      verticalRange: 46 + value * 64,
      boostChance: 0.1 + value * 0.03,
      rampChance: 0,
      pathChance: Math.max(0.12, 0.24 - value * 0.07),
      floatingBoneChance: 0.18 + value * 0.12,
    };
  }
}
