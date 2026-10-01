import { randomUUID, randomInt } from "node:crypto";
import {
  ACHIEVEMENTS,
  GameError,
  MIN_PLAYERS,
  applyAction,
  createGame,
  forfeitPlayer,
  multiEloDeltas,
  standings,
  toPlayerView,
  type GameAction,
  type GameEvent,
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
    /** 2-4 players in seating order. */
    readonly players: Player[],
    private readonly hooks: MatchHooks,
  ) {
    this.state = createGame(
      players.map((p) => ({ id: p.id, name: p.name })),
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

  /** True once the player has forfeited; they no longer receive match updates. */
  isEliminated(player: Player): boolean {
    return this.state.players.find((p) => p.id === player.id)?.active === false;
  }

  handleAction(player: Player, action: GameAction): void {
    if (this.ended) return send(player, { type: "error", code: "MATCH_OVER", message: "The match is over." });
    try {
      const { state, events } = applyAction(this.state, player.id, action);
      this.commit(state, events);
    } catch (err) {
      if (err instanceof GameError) return send(player, { type: "error", code: err.code, message: err.message });
      throw err;
    }
  }

  private commit(state: GameState, events: GameEvent[]): void {
    this.state = state;
    for (const p of this.players) {
      if (this.isEliminated(p)) continue;
      send(p, { type: "match:update", matchId: this.id, view: toPlayerView(state, p.id), events });
    }
    if (state.phase === "finished") this.finish();
  }

  /** Called when a player's socket drops; they forfeit unless they come back in time. */
  playerDisconnected(player: Player): void {
    if (this.ended || this.isEliminated(player)) return;
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

  /** The player drops out; everyone else plays on unless fewer than two remain. */
  forfeit(player: Player): void {
    if (this.ended || this.isEliminated(player)) return;
    this.clearTimer(player.id);
    const { state, events } = forfeitPlayer(this.state, player.id);
    this.commit(state, events);
  }

  private clearTimer(playerId: string): void {
    const t = this.disconnectTimers.get(playerId);
    if (t) clearTimeout(t);
    this.disconnectTimers.delete(playerId);
  }

  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    for (const id of [...this.disconnectTimers.keys()]) this.clearTimer(id);

    const state = this.state;
    const scores = state.scores;
    const ranks = Object.fromEntries(standings(state).map((s) => [s.playerId, s.rank]));
    const winners = new Set(state.winnerIds);
    // fewer than two players left means the others gave up rather than the cards running out
    const reason: MatchResult["reason"] = state.players.filter((p) => p.active).length < MIN_PLAYERS ? "forfeit" : "completed";
    const deltas = multiEloDeltas(this.players.map((p) => ({ rating: p.stats.rating, rank: ranks[p.id]! })));

    const unlockedByPlayer = new Map<string, UnlockedAchievement[]>();
    this.players.forEach((p, i) => {
      const won = winners.has(p.id) && winners.size === 1;
      const draw = winners.has(p.id) && winners.size > 1;
      const s = p.stats;
      s.games++;
      if (won) s.wins++;
      else if (draw) s.draws++;
      else s.losses++;
      s.winStreak = won ? s.winStreak + 1 : 0;
      if (won && reason === "completed") {
        const best = Math.max(0, ...this.players.filter((o) => o.id !== p.id).map((o) => scores[o.id] ?? 0));
        s.bestMargin = Math.max(s.bestMargin, (scores[p.id] ?? 0) - best);
      }
      s.rating += deltas[i] ?? 0;
      unlockedByPlayer.set(p.id, this.evaluateAchievements(p));
    });

    this.players.forEach((p, i) => {
      if (this.isEliminated(p)) return; // they already went back to the lobby
      send(p, {
        type: "match:ended",
        matchId: this.id,
        view: toPlayerView(state, p.id),
        result: { winnerIds: state.winnerIds, scores, ranks, ratingDelta: deltas[i] ?? 0, reason },
        unlocked: unlockedByPlayer.get(p.id) ?? [],
      });
    });
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
