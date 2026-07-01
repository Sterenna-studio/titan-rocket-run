import type { RunMilestone } from '../types/game';

export const RUN_MILESTONES: RunMilestone[] = [
  {
    id: 'garage-gate',
    distance: 120,
    title: 'Portail du garage',
    body: 'Premier repere atteint : la piste devient lisible, garde le rythme.',
    rewardBones: 8,
    rocketPercent: 32,
    speedBoost: 260,
    color: 0x62ff52,
    badge: 'Piste retrouvee',
  },
  {
    id: 'moss-bridge',
    distance: 360,
    title: 'Pont de mousse',
    body: 'Les gaps se resserrent. Saute proprement et garde la rocket pour corriger.',
    rewardBones: 14,
    rocketPercent: 38,
    speedBoost: 320,
    color: 0x65d9ff,
    badge: 'Pont franchi',
  },
  {
    id: 'neon-woods',
    distance: 720,
    title: 'Foret neon',
    body: 'Les os tracent la bonne ligne. Suis-les pour garder le combo.',
    rewardBones: 22,
    rocketPercent: 45,
    speedBoost: 420,
    color: 0xd6a0ff,
    badge: 'Foret neon',
  },
  {
    id: 'sky-ramp',
    distance: 1180,
    title: 'Virage des neons',
    body: 'La vitesse monte doucement. Un boost court suffit si le saut est tardif.',
    rewardBones: 34,
    rocketPercent: 55,
    speedBoost: 520,
    color: 0xffd36a,
    badge: 'Virage tenu',
  },
  {
    id: 'orbit-bone',
    distance: 1780,
    title: 'Relais des os',
    body: 'La route reste basse, mais les trous punissent les sauts lances trop tard.',
    rewardBones: 52,
    rocketPercent: 72,
    speedBoost: 680,
    color: 0x8cfffb,
    badge: 'Relais franchi',
  },
  {
    id: 'titan-signal',
    distance: 2800,
    title: 'Signal Titan',
    body: 'Dernier signal du parcours : garde une reserve de rocket et reste dans la ligne.',
    rewardBones: 80,
    rocketPercent: 100,
    speedBoost: 900,
    color: 0xf0fff4,
    badge: 'Signal capte',
  },
];

export function getNextMilestone(distance: number, reached: ReadonlySet<string>): RunMilestone | undefined {
  return RUN_MILESTONES.find((milestone) => milestone.distance > distance && !reached.has(milestone.id));
}
