import { Match } from "./match.js";
import { send, type Player, type PlayerRegistry } from "./players.js";

/** Server-managed lobby: presence, a FIFO matchmaking queue, and the set of live matches. */
export class Lobby {
  private queue: Player[] = [];
  private matches = new Map<string, Match>();

  constructor(private readonly players: PlayerRegistry) {}

  getMatch(id: string | null): Match | undefined {
    return id ? this.matches.get(id) : undefined;
  }

  isQueued(player: Player): boolean {
    return this.queue.some((p) => p.id === player.id);
  }

  joinQueue(player: Player): void {
    const current = this.getMatch(player.matchId);
    if (current && !current.ended) {
      return send(player, { type: "error", code: "IN_MATCH", message: "Finish or leave your match first." });
    }
    if (current?.ended) this.detach(player);
    if (!this.isQueued(player)) this.queue.push(player);
    send(player, { type: "queue:status", inQueue: true });
    this.tryMatchmake();
    this.broadcastState();
  }

  leaveQueue(player: Player, notify = true): void {
    const before = this.queue.length;
    this.queue = this.queue.filter((p) => p.id !== player.id);
    if (notify && before !== this.queue.length) send(player, { type: "queue:status", inQueue: false });
    this.broadcastState();
  }

  /** Player asks to leave: forfeits a running match, or just returns to the lobby after one has ended. */
  leaveMatch(player: Player): void {
    const match = this.getMatch(player.matchId);
    if (!match) return;
    if (!match.ended) match.forfeit(player);
    this.detach(player);
    this.broadcastState();
  }

  onDisconnect(player: Player): void {
    this.leaveQueue(player, false);
    const match = this.getMatch(player.matchId);
    if (match && !match.ended) match.playerDisconnected(player);
    this.broadcastState();
  }

  onReconnect(player: Player): void {
    const match = this.getMatch(player.matchId);
    if (match && !match.ended) match.playerReconnected(player);
    else if (match?.ended) this.detach(player);
    this.broadcastState();
  }

  broadcastState(): void {
    const online = this.players.online();
    const message = {
      type: "lobby:state" as const,
      players: online.map((p) => this.players.toLobbyPlayer(p, this.isQueued(p))),
      queueSize: this.queue.length,
      activeMatches: [...this.matches.values()].filter((m) => !m.ended).length,
    };
    for (const p of online) send(p, message);
  }

  private tryMatchmake(): void {
    while (this.queue.length >= 2) {
      const a = this.queue.shift()!;
      const b = this.queue.shift()!;
      const match = new Match([a, b], { onEnd: () => this.broadcastState() });
      this.matches.set(match.id, match);
      for (const p of [a, b]) send(p, { type: "queue:status", inQueue: false });
      match.start();
    }
  }

  private detach(player: Player): void {
    const match = this.getMatch(player.matchId);
    player.matchId = null;
    if (match && match.ended && match.players.every((p) => p.matchId !== match.id)) {
      this.matches.delete(match.id);
    }
  }
}
