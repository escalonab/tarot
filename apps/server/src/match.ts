import { randomUUID, randomInt } from "node:crypto";
import {
  ACHIEVEMENTS,
  GameError,
  applyAction,
  createGame,
  eloDelta,
  toPlayerView,
  type GameAction,
  type GameState,
  type MatchResult,
  type UnlockedAchievement,
} from "@tarot/shared";
import { config } from "./config.js";
import { send, type Player } from "./players.js";

export interface MatchHooks {
  onEnd: (match: Match) => void;
}

export class Match {
  readonly id = randomUUID();
  private state: GameState;
  private disconnectTimers = new Map<string, NodeJS.Timeout>();
  ended = false;

  constructor(
    readonly players: [Player, Player],
    private readonly hooks: MatchHooks,
  ) {
    this.state = createGame(
      [
        { id: players[0].id, name: players[0].name },
        { id: players[1].id, name: players[1].name },
      ],
      randomInt(0, 2 ** 31),
    );
    for (const p of players) p.matchId = this.id;
  }

  start(): void {
    for (const p of this.players) send(p, { type: "match:started", matchId: this.id, view: toPlayerView(this.state, p.id) });
  }

  has(player: Player): boolean {
    return this.players.some((p) => p.id === player.id);
  }

  opponentOf(player: Player): Player {
    return this.players[0].id === player.id ? this.players[1] : this.players[0];
  }

  handleAction(player: Player, action: GameAction): void {
    if (this.ended) return send(player, { type: "error", code: "MATCH_OVER", message: "The match is over." });
    try {
      const { state, events } = applyAction(this.state, player.id, action);
      this.state = state;
      for (const p of this.players) {
        send(p, { type: "match:update", matchId: this.id, view: toPlayerView(state, p.id), events });
      }
      if (state.phase === "finished") this.finish("completed", state.winnerId);
    } catch (err) {
      if (err instanceof GameError) return send(player, { type: "error", code: err.code, message: err.message });
      throw err;
    }
  }

  /** Called when a player's socket drops; they forfeit unless they come back in time. */
  playerDisconnected(player: Player): void {
    if (this.ended) return;
    this.clearTimer(player.id);
    this.disconnectTimers.set(
      player.id,
      setTimeout(() => this.forfeit(player), config.reconnectGraceMs),
    );
  }

  playerReconnected(player: Player): void {
    this.clearTimer(player.id);
    send(player, { type: "match:started", matchId: this.id, view: toPlayerView(this.state, player.id) });
  }

  forfeit(player: Player): void {
    if (this.ended) return;
    this.finish("forfeit", this.opponentOf(player).id);
  }

  private clearTimer(playerId: string): void {
    const t = this.disconnectTimers.get(playerId);
    if (t) clearTimeout(t);
    this.disconnectTimers.delete(playerId);
  }

  private finish(reason: MatchResult["reason"], winnerId: string | null): void {
    if (this.ended) return;
    this.ended = true;
    for (const id of this.disconnectTimers.keys()) this.clearTimer(id);

    const [a, b] = this.players;
    const scoreA = winnerId === null ? 0.5 : winnerId === a.id ? 1 : 0;
    const [deltaA, deltaB] = eloDelta(a.stats.rating, b.stats.rating, scoreA);
    const deltas: Record<string, number> = { [a.id]: deltaA, [b.id]: deltaB };

    const scores =
      this.state.phase === "finished"
        ? this.state.scores
        : Object.fromEntries(this.players.map((p) => [p.id, toPlayerView(this.state, p.id).scores[p.id] ?? 0]));

    const unlockedByPlayer = new Map<string, UnlockedAchievement[]>();
    for (const p of this.players) {
      const opp = this.opponentOf(p);
      const won = winnerId === p.id;
      const draw = winnerId === null;
      const s = p.stats;
      s.games++;
      if (won) s.wins++;
      else if (draw) s.draws++;
      else s.losses++;
      s.winStreak = won ? s.winStreak + 1 : 0;
      if (won && reason === "completed") {
        s.bestMargin = Math.max(s.bestMargin, (scores[p.id] ?? 0) - (scores[opp.id] ?? 0));
      }
      s.rating += deltas[p.id] ?? 0;
      unlockedByPlayer.set(p.id, this.evaluateAchievements(p));
    }

    for (const p of this.players) {
      send(p, {
        type: "match:ended",
        matchId: this.id,
        view: toPlayerView(this.state, p.id),
        result: { winnerId, scores, ratingDelta: deltas[p.id] ?? 0, reason },
        unlocked: unlockedByPlayer.get(p.id) ?? [],
      });
    }
    this.hooks.onEnd(this);
  }

  private evaluateAchievements(player: Player): UnlockedAchievement[] {
    const have = new Set(player.achievements.map((a) => a.id));
    const fresh: UnlockedAchievement[] = [];
    for (const rule of ACHIEVEMENTS) {
      if (have.has(rule.id)) continue;
      if (rule.check({ stats: player.stats, game: this.state, playerId: player.id })) {
        const unlocked = { id: rule.id, name: rule.name, description: rule.description, unlockedAt: Date.now() };
        player.achievements.push(unlocked);
        fresh.push(unlocked);
      }
    }
    return fresh;
  }
}
