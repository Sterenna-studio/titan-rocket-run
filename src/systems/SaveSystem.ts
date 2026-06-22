import { SAVE_KEY, UPGRADE_DEFINITIONS } from '../game/constants';
import type { RunStats, RunSummary, SaveData, UpgradeId } from '../types/game';

const upgradeIds = Object.keys(UPGRADE_DEFINITIONS) as UpgradeId[];

function createDefaultSave(): SaveData {
  return {
    coins: 0,
    best: 0,
    upgrades: {
      shoes: 0,
      ramp: 0,
      bounce: 0,
      rocket: 0,
      cape: 0,
      start: 0,
      suit: 0,
    },
  };
}

function cloneSave(save: SaveData): SaveData {
  return JSON.parse(JSON.stringify(save)) as SaveData;
}

function normalizeSave(raw: Partial<SaveData> | null): SaveData {
  const fallback = createDefaultSave();

  if (!raw) {
    return fallback;
  }

  const upgrades = { ...fallback.upgrades };
  for (const id of upgradeIds) {
    const value = Number(raw.upgrades?.[id] ?? 0);
    upgrades[id] = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  }

  return {
    coins: Number.isFinite(raw.coins) ? Math.max(0, Math.floor(raw.coins ?? 0)) : fallback.coins,
    best: Number.isFinite(raw.best) ? Math.max(0, Number(raw.best ?? 0)) : fallback.best,
    upgrades,
  };
}

function pickBadge(stats: RunStats): string {
  if (stats.distance > 220) return 'Sonic dog spirit';
  if (stats.bestCombo >= 8) return "Combo d'os";
  if (stats.hits === 0 && stats.distance > 80) return 'Run propre';
  if (stats.jumps >= 12) return 'Plateformer ne';
  return '';
}

export class SaveSystem {
  private save: SaveData;

  constructor() {
    this.save = this.load();
  }

  getSnapshot(): SaveData {
    return cloneSave(this.save);
  }

  reset(): SaveData {
    this.save = createDefaultSave();
    this.write();
    return this.getSnapshot();
  }

  buyUpgrade(id: UpgradeId, cost: number): boolean {
    const definition = UPGRADE_DEFINITIONS[id];
    const level = this.save.upgrades[id] ?? 0;

    if (level >= definition.max || this.save.coins < cost) {
      return false;
    }

    this.save.coins -= cost;
    this.save.upgrades[id] = level + 1;
    this.write();
    return true;
  }

  recordRun(stats: RunStats, seed = '', finishReason: RunSummary['finishReason'] = 'fall'): RunSummary {
    const distance = Math.max(0, stats.distance);
    const reward = Math.max(
      1,
      Math.floor(
        distance * 0.65 +
          stats.bonusBones +
          stats.bestCombo * 1.2 +
          Math.max(0, stats.landed - stats.hits) * 0.8,
      ),
    );
    const isRecord = distance > this.save.best;

    this.save.coins += reward;
    if (isRecord) {
      this.save.best = distance;
    }

    this.write();

    return {
      ...stats,
      distance,
      reward,
      isRecord,
      badge: pickBadge(stats),
      seed,
      finishReason,
    };
  }

  private load(): SaveData {
    try {
      return normalizeSave(JSON.parse(window.localStorage.getItem(SAVE_KEY) || 'null') as Partial<SaveData> | null);
    } catch {
      return createDefaultSave();
    }
  }

  private write(): void {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(this.save));
  }
}

export const saveSystem = new SaveSystem();
