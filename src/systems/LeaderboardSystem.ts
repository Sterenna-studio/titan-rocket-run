import type { LeaderboardEntry, RunSummary } from '../types/game';

const LEADERBOARD_KEY = 'titanRocketRunArcadeLeaderboardV1';
const MAX_VISIBLE_ENTRIES = 10;
const MAX_LOCAL_ENTRIES = 20;

const PRESET_ENTRIES: LeaderboardEntry[] = [
  { id: 'preset-sniky', name: 'SNIKY', score: 48150, distance: 2850, combo: 28, source: 'preset', createdAt: 'preset' },
  { id: 'preset-titan', name: 'TITAN', score: 43880, distance: 2590, combo: 24, source: 'preset', createdAt: 'preset' },
  { id: 'preset-rocket', name: 'ROCKT', score: 39740, distance: 2320, combo: 21, source: 'preset', createdAt: 'preset' },
  { id: 'preset-street', name: 'STRIT', score: 35120, distance: 2060, combo: 19, source: 'preset', createdAt: 'preset' },
  { id: 'preset-bones', name: 'BONES', score: 30990, distance: 1780, combo: 17, source: 'preset', createdAt: 'preset' },
  { id: 'preset-neonx', name: 'NEONX', score: 26540, distance: 1510, combo: 14, source: 'preset', createdAt: 'preset' },
  { id: 'preset-orbit', name: 'ORBIT', score: 21820, distance: 1240, combo: 11, source: 'preset', createdAt: 'preset' },
];

export class LeaderboardSystem {
  // Replace these local read/write methods with Supabase calls when the backend is ready.
  getEntries(): LeaderboardEntry[] {
    return this.rank([...PRESET_ENTRIES, ...this.loadLocalEntries()]).slice(0, MAX_VISIBLE_ENTRIES);
  }

  calculateScore(summary: RunSummary): number {
    const score =
      summary.distance * 12 +
      summary.maxSpeed * 0.35 +
      summary.reward * 14 +
      summary.bonusBones * 18 +
      summary.bestCombo * 175 +
      summary.storyEvents * 900 +
      summary.overdrives * 1250 +
      summary.landed * 25;

    return Math.max(0, Math.floor(score));
  }

  submitLocalScore(name: string, summary: RunSummary): LeaderboardEntry | null {
    const initials = this.normalizeInitials(name);
    if (!initials) {
      return null;
    }

    const entry: LeaderboardEntry = {
      id: `local-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      name: initials,
      score: this.calculateScore(summary),
      distance: Math.round(summary.distance),
      combo: summary.bestCombo,
      source: 'local',
      createdAt: new Date().toISOString(),
    };

    const nextEntries = this.rank([...this.loadLocalEntries(), entry]).slice(0, MAX_LOCAL_ENTRIES);
    this.writeLocalEntries(nextEntries);
    return entry;
  }

  normalizeInitials(value: string): string | null {
    const initials = value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);
    return initials.length === 5 ? initials : null;
  }

  private rank(entries: LeaderboardEntry[]): LeaderboardEntry[] {
    return entries
      .slice()
      .sort((a, b) => b.score - a.score || b.distance - a.distance || b.combo - a.combo);
  }

  private loadLocalEntries(): LeaderboardEntry[] {
    try {
      const raw = JSON.parse(window.localStorage.getItem(LEADERBOARD_KEY) || '[]') as Partial<LeaderboardEntry>[];
      return raw
        .map((entry) => this.normalizeEntry(entry))
        .filter((entry): entry is LeaderboardEntry => Boolean(entry));
    } catch {
      return [];
    }
  }

  private normalizeEntry(raw: Partial<LeaderboardEntry>): LeaderboardEntry | null {
    const name = typeof raw.name === 'string' ? this.normalizeInitials(raw.name) : null;
    const score = Number(raw.score);
    const distance = Number(raw.distance);
    const combo = Number(raw.combo);
    if (!name || !Number.isFinite(score) || !Number.isFinite(distance) || !Number.isFinite(combo)) {
      return null;
    }

    return {
      id: typeof raw.id === 'string' ? raw.id : `local-${name}-${score}`,
      name,
      score: Math.max(0, Math.floor(score)),
      distance: Math.max(0, Math.round(distance)),
      combo: Math.max(0, Math.floor(combo)),
      source: 'local',
      createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    };
  }

  private writeLocalEntries(entries: LeaderboardEntry[]): void {
    window.localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(entries.filter((entry) => entry.source === 'local')));
  }
}

export const leaderboardSystem = new LeaderboardSystem();
