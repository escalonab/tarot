import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import {
  INITIAL_STATS,
  type LeaderboardEntry,
  type LobbyPlayer,
  type PlayerStats,
  type ServerMessage,
  type UnlockedAchievement,
} from "@tarot/shared";

export interface Player {
  id: string;
  /** Secret session token the browser stores to resume its identity. Never sent to other players. */
  token: string;
  name: string;
  socket: WebSocket | null;
  matchId: string | null;
  stats: PlayerStats;
  achievements: UnlockedAchievement[];
  lastSeen: number;
}

/**
 * In-memory player registry. Swap the Maps for a database later; the rest of the server
 * only talks to this class.
 */
export class PlayerRegistry {
  private byId = new Map<string, Player>();
  private byToken = new Map<string, Player>();

  create(name: string): Player {
    const player: Player = {
      id: randomUUID(),
      token: randomUUID(),
      name,
      socket: null,
      matchId: null,
      stats: { ...INITIAL_STATS },
      achievements: [],
      lastSeen: Date.now(),
    };
    this.byId.set(player.id, player);
    this.byToken.set(player.token, player);
    return player;
  }

  get(id: string): Player | undefined {
    return this.byId.get(id);
  }

  getByToken(token: string): Player | undefined {
    return this.byToken.get(token);
  }

  online(): Player[] {
    return [...this.byId.values()].filter((p) => p.socket?.readyState === 1);
  }

  toLobbyPlayer(p: Player, queued: boolean): LobbyPlayer {
    return { id: p.id, name: p.name, status: p.matchId ? "playing" : queued ? "queued" : "idle" };
  }

  leaderboard(limit = 20): LeaderboardEntry[] {
    return [...this.byId.values()]
      .filter((p) => p.stats.games > 0)
      .sort((a, b) => b.stats.rating - a.stats.rating || b.stats.wins - a.stats.wins)
      .slice(0, limit)
      .map((p) => ({
        playerId: p.id,
        name: p.name,
        rating: p.stats.rating,
        wins: p.stats.wins,
        losses: p.stats.losses,
        draws: p.stats.draws,
      }));
  }
}

export function send(player: Player, message: ServerMessage): void {
  const socket = player.socket;
  if (socket && socket.readyState === 1) socket.send(JSON.stringify(message));
}
