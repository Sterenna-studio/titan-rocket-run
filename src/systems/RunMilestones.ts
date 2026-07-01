import type { RunMilestone } from '../types/game';

export const RUN_MILESTONES: RunMilestone[] = [
  {
    id: 'sniky-garage',
    distance: 80,
    title: 'Garage de Sniky',
    body: 'Premier signal : Sniky valide le depart et recharge un peu la rocket.',
    rewardBones: 10,
    rocketPercent: 35,
    speedBoost: 220,
    color: 0x62ff52,
    badge: 'Depart valide',
  },
  {
    id: 'saint-malo-ramparts',
    distance: 240,
    title: 'Remparts de Saint-Malo',
    body: 'Le vent de mer pousse Titan. Les os indiquent la ligne sure entre les pierres.',
    rewardBones: 16,
    rocketPercent: 42,
    speedBoost: 300,
    color: 0x65d9ff,
    badge: 'Remparts franchis',
  },
  {
    id: 'broceliande-fog',
    distance: 520,
    title: 'Brume de Broceliande',
    body: 'La piste devient mystique. Garde le combo pour allumer les reperes verts.',
    rewardBones: 24,
    rocketPercent: 48,
    speedBoost: 390,
    color: 0xd6a0ff,
    badge: 'Brume traversee',
  },
  {
    id: 'carnac-lines',
    distance: 900,
    title: 'Alignements de Carnac',
    body: 'Les menhirs rythment la route. Saute tard, booste court, reste dans l axe.',
    rewardBones: 36,
    rocketPercent: 58,
    speedBoost: 500,
    color: 0xffd36a,
    badge: 'Carnac aligne',
  },
  {
    id: 'brest-harbor',
    distance: 1380,
    title: 'Port de Brest',
    body: 'Containers, cables et pluie arrivent bientot. Titan gagne une grosse relance.',
    rewardBones: 54,
    rocketPercent: 72,
    speedBoost: 650,
    color: 0x8cfffb,
    badge: 'Port traverse',
  },
  {
    id: 'monts-arree-signal',
    distance: 2100,
    title: "Signal des Monts d'Arree",
    body: 'La lande appelle Titan. Garde une reserve de rocket pour la derniere ligne.',
    rewardBones: 82,
    rocketPercent: 100,
    speedBoost: 860,
    color: 0xf0fff4,
    badge: 'Signal breton capte',
  },
];

export function getNextMilestone(distance: number, reached: ReadonlySet<string>): RunMilestone | undefined {
  return RUN_MILESTONES.find((milestone) => milestone.distance > distance && !reached.has(milestone.id));
}
