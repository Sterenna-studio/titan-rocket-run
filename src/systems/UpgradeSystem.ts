import { UPGRADE_DEFINITIONS } from '../game/constants';
import type { PlayerStats, SaveData, UpgradeId, UpgradeShopItem } from '../types/game';
import { saveSystem, type SaveSystem } from './SaveSystem';

const upgradeIds = Object.keys(UPGRADE_DEFINITIONS) as UpgradeId[];
const shopUpgradeIds = upgradeIds.filter((id) => id !== 'missile');
const COST_GROWTH = 2.15;

export class UpgradeSystem {
  constructor(private readonly saves: SaveSystem) {}

  getShopItems(): UpgradeShopItem[] {
    const save = this.saves.getSnapshot();

    return shopUpgradeIds.map((id) => {
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
      rocketMax: 86 + level('rocket') * 18 + level('suit') * 18,
      topSpeed: 720 + level('shoes') * 54 + level('start') * 24,
      jumpPower: 720 + level('ramp') * 28,
      airJumpPowerRatio: Math.min(1, 0.88 + level('ramp') * 0.018),
      bouncePower: bounceLevel > 0 ? 500 + bounceLevel * 42 : 0,
      bouncePush: bounceLevel > 0 ? 80 + bounceLevel * 18 : 0,
      hasSpaceSuit: level('suit') > 0,
      startVelocity: 560 + level('start') * 34,
      groundAcceleration: 1050 + level('shoes') * 78,
      airAcceleration: 620 + level('cape') * 54,
      airDrag: 0.042 + level('cape') * 0.003,
      gravityScale: 1 - level('cape') * 0.012 - level('suit') * 0.05,
      rocketPush: 840 + level('rocket') * 92,
      rocketLift: 70 + level('rocket') * 8,
    };
  }

  private getCost(id: UpgradeId, save: SaveData): number {
    const definition = UPGRADE_DEFINITIONS[id];
    return Math.floor(definition.base * Math.pow(COST_GROWTH, save.upgrades[id] ?? 0));
  }
}

export const upgradeSystem = new UpgradeSystem(saveSystem);
