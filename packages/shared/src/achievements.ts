import type { AchievementDef } from "./protocol.js";
import type { GameState } from "./game/state.js";

/** Per-player lifetime stats the server tracks; achievements are derived from these plus the finished game. */
export interface PlayerStats {
  games: number;
  wins: number;
  losses: number;
  draws: number;
  rating: number;
  bestMargin: number;
  winStreak: number;
}

export const INITIAL_STATS: PlayerStats = {
  games: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  rating: 1000,
  bestMargin: 0,
  winStreak: 0,
};

export interface AchievementRule extends AchievementDef {
  check: (ctx: { stats: PlayerStats; game: GameState; playerId: string }) => boolean;
}

export const ACHIEVEMENTS: readonly AchievementRule[] = [
  {
    id: "first_game",
    name: "Welcome to the table",
    description: "Finish your first match.",
    check: ({ stats }) => stats.games >= 1,
  },
  {
    id: "first_win",
    name: "First blood",
    description: "Win a match.",
    check: ({ stats }) => stats.wins >= 1,
  },
  {
    id: "landslide",
    name: "Landslide",
    description: "Win a match by 10 or more exposed edges.",
    check: ({ stats }) => stats.bestMargin >= 10,
  },
  {
    id: "hat_trick",
    name: "Hat trick",
    description: "Win three matches in a row.",
    check: ({ stats }) => stats.winStreak >= 3,
  },
  {
    id: "veteran",
    name: "Veteran",
    description: "Play 25 matches.",
    check: ({ stats }) => stats.games >= 25,
  },
  {
    id: "architect",
    name: "Architect",
    description: "Finish a match with a board spanning at least 10 columns or rows.",
    check: ({ game }) => {
      let minX = 0,
        maxX = 0,
        minY = 0,
        maxY = 0;
      for (const p of Object.values(game.board)) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
      return maxX - minX + 1 >= 10 || maxY - minY + 1 >= 10;
    },
  },
];

/** Elo with K=32; returns [deltaA, deltaB]. `scoreA` is 1 win, 0.5 draw, 0 loss. */
export function eloDelta(ratingA: number, ratingB: number, scoreA: number, k = 32): [number, number] {
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const deltaA = Math.round(k * (scoreA - expectedA));
  return [deltaA, -deltaA];
}
