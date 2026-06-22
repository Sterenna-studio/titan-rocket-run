export type UpgradeId = 'shoes' | 'ramp' | 'rocket' | 'cape' | 'start';

export type PlatformKind = 'start' | 'normal' | 'boost';

export type EntityKind = 'bone' | 'mine';

export interface UpgradeDefinition {
  name: string;
  desc: string;
  base: number;
  max: number;
}

export interface SaveData {
  coins: number;
  best: number;
  upgrades: Record<UpgradeId, number>;
}

export interface UpgradeShopItem extends UpgradeDefinition {
  id: UpgradeId;
  level: number;
  cost: number;
  canBuy: boolean;
  isMaxed: boolean;
}

export interface PlayerStats {
  maxJumps: number;
  rocketMax: number;
  topSpeed: number;
  jumpPower: number;
  startVelocity: number;
  groundAcceleration: number;
  airAcceleration: number;
  airDrag: number;
  gravityScale: number;
  rocketPush: number;
  rocketLift: number;
}

export interface InputState {
  left: boolean;
  right: boolean;
  rocket: boolean;
}

export interface PlatformData {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: PlatformKind;
}

export interface WorldEntity {
  id: number;
  type: EntityKind;
  x: number;
  y: number;
  r: number;
  value: number;
  hit: boolean;
  bob: number;
}

export type EntityDraft = Omit<WorldEntity, 'id' | 'hit'>;

export interface CollisionCircle {
  x: number;
  y: number;
  r: number;
}

export interface PlayerStepResult {
  landed: boolean;
  boostPad: boolean;
  rocketUsed: boolean;
}

export interface PlayerSnapshot {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  grounded: boolean;
  coyote: number;
  jumpsLeft: number;
  rocketFuel: number;
  hurt: number;
  invuln: number;
}

export interface RunStats {
  distance: number;
  maxSpeed: number;
  jumps: number;
  landed: number;
  pickups: number;
  bonusBones: number;
  hits: number;
  combo: number;
  bestCombo: number;
}

export interface RunSummary extends RunStats {
  reward: number;
  isRecord: boolean;
  badge: string;
  seed: string;
}

export interface HudState {
  distance: number;
  combo: number;
  speedPercent: number;
  jumpsLeft: number;
  maxJumps: number;
  rocketPercent: number;
}

export interface UiMessage {
  title: string;
  body: string;
}

export interface VirtualInput {
  key: 'a' | 'd' | 'space' | 'shift' | 'r';
  down: boolean;
}

export interface TitanAnimationData {
  fps: number;
  loop: boolean;
  frames: string[];
}

export interface TitanAnimationManifest {
  character: string;
  game: string;
  animations: Record<string, TitanAnimationData>;
}
