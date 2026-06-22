import { UPGRADE_DEFINITIONS } from '../game/constants';
import type { PlayerStats, SaveData, UpgradeId, UpgradeShopItem } from '../types/game';
import { saveSystem, type SaveSystem } from './SaveSystem';

const upgradeIds = Object.keys(UPGRADE_DEFINITIONS) as UpgradeId[];

export class UpgradeSystem {
  constructor(private readonly saves: SaveSystem) {}

  getShopItems(): UpgradeShopItem[] {
    const save = this.saves.getSnapshot();

    return upgradeIds.map((id) => {
      const definition = UPGRADE_DEFINITIONS[id];
      const level = save.upgrades[id] ?? 0;
      const cost = this.getCost(id, save);

      return {
        id,
        ...definition,
        level,
        cost,
        canBuy: level < definition.max && save.coins >= cost,
        isMaxed: level >= definition.max,
      };
    });
  }

  buy(id: UpgradeId): boolean {
    return this.saves.buyUpgrade(id, this.getCost(id, this.saves.getSnapshot()));
  }

  getPlayerStats(): PlayerStats {
    const save = this.saves.getSnapshot();
    const level = (id: UpgradeId) => save.upgrades[id] ?? 0;
    const bounceLevel = level('bounce');

    return {
      maxJumps: 2 + Math.floor(level('ramp') / 3),
      rocketMax: 70 + level('rocket') * 18,
      topSpeed: 820 + level('shoes') * 70 + level('start') * 18,
      jumpPower: 760 + level('ramp') * 32,
      airJumpPowerRatio: Math.min(1, 0.88 + level('ramp') * 0.018),
      bouncePower: bounceLevel > 0 ? 500 + bounceLevel * 42 : 0,
      bouncePush: bounceLevel > 0 ? 80 + bounceLevel * 18 : 0,
      hasSpaceSuit: level('suit') > 0,
      startVelocity: 260 + level('start') * 45,
      groundAcceleration: 1320 + level('shoes') * 95,
      airAcceleration: 760 + level('cape') * 62,
      airDrag: 0.035 + level('cape') * 0.004,
      gravityScale: 1 - level('cape') * 0.018,
      rocketPush: 1120 + level('rocket') * 115,
      rocketLift: 80 + level('rocket') * 10,
    };
  }

  private getCost(id: UpgradeId, save: SaveData): number {
    const definition = UPGRADE_DEFINITIONS[id];
    return Math.floor(definition.base * Math.pow(1.5, save.upgrades[id] ?? 0));
  }
}

export const upgradeSystem = new UpgradeSystem(saveSystem);
