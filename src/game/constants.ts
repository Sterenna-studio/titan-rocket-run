import type { UpgradeDefinition, UpgradeId } from '../types/game';

export const GAME_WIDTH = 2560;
export const GAME_HEIGHT = 1440;
export const MANIFEST_URL = 'assets/titan_manifest.json';
export const SAVE_KEY = 'titanRocketRunSave';

export const START_X = 145;
export const GROUND_Y = 1220;
export const CRASH_GROUND_Y = GAME_HEIGHT - 84;
export const WORLD_SCALE = 0.09;
export const DEATH_Y = 1760;
export const GRAVITY = 1900;
export const WORLD_AHEAD = 2200;
export const WORLD_BEHIND = 650;
export const SKY_Y = 590;
export const SPACE_Y = 170;
export const SPACE_LOST_SECONDS = 1.1;
export const LAUNCH_CHARGE_SECONDS = 1.75;
export const LAUNCH_PERFECT_MIN = 0.72;
export const LAUNCH_PERFECT_MAX = 0.9;
export const LAUNCH_MIN_VX = 420;
export const LAUNCH_MAX_VX = 3600;
export const LAUNCH_MIN_VY = 560;
export const LAUNCH_MAX_VY = 1120;

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
  shoes: { name: 'Chaussures', desc: "Acceleration et vitesse au sol.", base: 120, max: 8 },
  ramp: { name: 'Bottes double saut', desc: 'Air-jumps plus hauts et plus nombreux.', base: 170, max: 8 },
  bounce: { name: 'Bottes rebondissantes', desc: 'Maintiens saut en atterrissant pour rebondir.', base: 180, max: 8 },
  rocket: { name: 'Rocket', desc: 'Boost horizontal avec Shift.', base: 220, max: 8 },
  missile: { name: 'Missile Titan', desc: 'Debloque E / bouton Missile pour detruire les mines.', base: 700, max: 5 },
  cape: { name: 'Cape aero', desc: "Meilleur controle en l'air.", base: 160, max: 8 },
  start: { name: 'Elan de depart', desc: 'Vitesse initiale augmentee.', base: 110, max: 8 },
  suit: { name: 'Tenue cosmonaute', desc: "Survie dans l'espace.", base: 950, max: 1 },
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
