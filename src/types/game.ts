export type UpgradeId = 'shoes' | 'ramp' | 'bounce' | 'rocket' | 'missile' | 'cape' | 'start' | 'suit';

export type PlatformKind = 'start' | 'normal' | 'boost' | 'ramp' | 'path' | 'underground' | 'recovery' | 'aerial';

export type CollectibleEntityKind = 'bone' | 'undergroundBoost';
export type ObstacleEntityKind = 'seagull' | 'cable' | 'granny' | 'menhir' | 'gust';
export type EntityKind = CollectibleEntityKind | ObstacleEntityKind;

export interface UpgradeDefinition {
  name: string;
  desc: string;
  base: number;
  max: number;
}

export interface SaveData {
  version: number;
  coins: number;
  best: number;
  runs: number;
  welcomeSeen: boolean;
  lastMilestone: string;
  milestones: Record<string, boolean>;
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
  airJumpPowerRatio: number;
  bouncePower: number;
  bouncePush: number;
  hasSpaceSuit: boolean;
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
  jumpHeld: boolean;
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
  grazed: boolean;
  bob: number;
}

export type EntityDraft = Omit<WorldEntity, 'id' | 'hit' | 'grazed'>;

export interface CollisionCircle {
  x: number;
  y: number;
  r: number;
}

export interface PlayerStepResult {
  landed: boolean;
  boostPad: boolean;
  rocketUsed: boolean;
  bounceUsed: boolean;
  impactSpeed: number;
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

export type ObstacleEntity = WorldEntity & { type: ObstacleEntityKind };

export interface RunStats {
  distance: number;
  maxSpeed: number;
  jumps: number;
  landed: number;
  pickups: number;
  bonusBones: number;
  overdrives: number;
  combo: number;
  bestCombo: number;
  storyEvents: number;
  bestMilestone: string;
  milestonesReached: string[];
}

export interface RunSummary extends RunStats {
  reward: number;
  isRecord: boolean;
  badge: string;
  seed: string;
  finishReason: 'fall';
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  score: number;
  distance: number;
  combo: number;
  source: 'preset' | 'local';
  createdAt: string;
}

export interface HudState {
  distance: number;
  combo: number;
  speedPercent: number;
  jumpsLeft: number;
  maxJumps: number;
  rocketPercent: number;
  nextGoalLabel: string;
  nextGoalDistance: number;
  storyEvents: number;
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

export interface RunMilestone {
  id: string;
  distance: number;
  title: string;
  body: string;
  rewardBones: number;
  rocketPercent: number;
  speedBoost: number;
  color: number;
  badge?: string;
}
