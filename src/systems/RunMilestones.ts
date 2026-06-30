import type { RunMilestone } from '../types/game';

export const RUN_MILESTONES: RunMilestone[] = [
  {
    id: 'garage-gate',
    distance: 120,
    title: 'Portail du garage',
    body: "Titan retrouve la piste du premier os-fusee. Bonus de depart debloque.",
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
    body: 'Les plateformes deviennent plus rapides. Ramasse le cache-os avant que Titan ne perde son elan au sol.',
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
    body: 'La trace brille dans les arbres. Combo renforce pour les bons sauts.',
    rewardBones: 22,
    rocketPercent: 45,
    speedBoost: 420,
    color: 0xd6a0ff,
    badge: 'Foret neon',
  },
  {
    id: 'sky-ramp',
    distance: 1200,
    title: 'Rampe du ciel',
    body: "Le ciel aspire Titan. Utilise les doubles sauts et la rocket pour rester dans l'axe.",
    rewardBones: 34,
    rocketPercent: 55,
    speedBoost: 520,
    color: 0xffd36a,
    badge: 'Rampe du ciel',
  },
  {
    id: 'orbit-bone',
    distance: 1850,
    title: 'Os en orbite',
    body: "Un fragment flotte au-dessus de la piste. La tenue cosmonaute devient critique.",
    rewardBones: 52,
    rocketPercent: 72,
    speedBoost: 680,
    color: 0x8cfffb,
    badge: 'Os orbital',
  },
  {
    id: 'titan-signal',
    distance: 2800,
    title: 'Signal Titan',
    body: "Titan entend l'aboiement du signal final. Les gros departs peuvent traverser un biome entier.",
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
