import type { UpgradeDefinition, UpgradeId } from '../types/game';
import { withAssetCacheBust } from './cacheBust';

export const GAME_WIDTH = 2560;
export const GAME_HEIGHT = 1440;
export const MANIFEST_URL = withAssetCacheBust('assets/titan_manifest.json');
export const SAVE_VERSION = 1;
export const STARTER_BONES = 130;
export const SAVE_KEY = `titanRocketRunSaveV${SAVE_VERSION}`;

export const START_X = 145;
export const GROUND_Y = 1220;
export const CRASH_GROUND_Y = GAME_HEIGHT - 84;
export const UNDERGROUND_Y = GAME_HEIGHT - 116;
export const WORLD_SCALE = 0.09;
export const DEATH_Y = 1580;
export const GRAVITY = 1900;
export const WORLD_AHEAD = 2200;
export const WORLD_BEHIND = 650;
export const SKY_Y = 590;
export const SPACE_Y = 170;

export const PLAYER_WIDTH = 62;
export const PLAYER_HEIGHT = 126;
export const TITAN_DISPLAY_HEIGHT = 168;
export const TITAN_BOTTOM_PAD = 16;

export const COLORS = {
  skyTop: '#07150d',
  skyMid: '#0b2112',
  skyBottom: '#10120c',
  panel: '#041108',
  platform: 0x1a2a1c,
  platformDark: 0x0d150f,
  boost: 0x244022,
  green: 0x62ff52,
  greenText: '#62ff52',
  text: '#ecfff0',
  muted: '#a7c7ad',
  red: 0xff5b46,
};

export const UPGRADE_DEFINITIONS: Record<UpgradeId, UpgradeDefinition> = {
  shoes: { name: 'Allure', desc: 'Vitesse automatique plus stable.', base: 120, max: 8 },
  ramp: { name: 'Saut', desc: 'Sauts plus hauts et air-jumps plus confortables.', base: 170, max: 8 },
  bounce: { name: 'Amorti', desc: 'Rebond assiste sur les gros atterrissages.', base: 180, max: 8 },
  rocket: { name: 'Rocket', desc: "Boost court avec Shift, au sol comme en l'air.", base: 220, max: 8 },
  missile: { name: 'Missile archive', desc: 'Ancien upgrade conserve pour compatibilite de sauvegarde.', base: 700, max: 0 },
  cape: { name: 'Controle', desc: "Correction plus douce en l'air.", base: 160, max: 8 },
  start: { name: 'Depart rapide', desc: 'Vitesse de base augmentee.', base: 110, max: 8 },
  suit: { name: 'Stabilisateur', desc: 'Trajectoire plus calme et rocket plus genereuse.', base: 950, max: 1 },
};

export const GameEvents = {
  MenuReady: 'titan:menu-ready',
  StartRun: 'titan:start-run',
  RunStarted: 'titan:run-started',
  RunFinished: 'titan:run-finished',
  HudUpdate: 'titan:hud-update',
  Message: 'titan:message',
  SaveChanged: 'titan:save-changed',
  VirtualInput: 'titan:virtual-input',
} as const;

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
