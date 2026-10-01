import { randomUUID } from "node:crypto";
import { MAX_PLAYERS, MIN_PLAYERS, type TableInfo } from "@tarot/shared";
import { Match } from "./match.js";
import { send, type Player, type PlayerRegistry } from "./players.js";

/** Seated players waiting to start; the first seat is the host. */
interface Table {
  id: string;
  players: Player[];
}

/** Server-managed lobby: presence, open tables and the set of live matches. */
export class Lobby {
  private tables = new Map<string, Table>();
  private matches = new Map<string, Match>();

  constructor(private readonly players: PlayerRegistry) {}

  getMatch(id: string | null): Match | undefined {
    return id ? this.matches.get(id) : undefined;
  }

  private tableOf(player: Player): Table | undefined {
    return [...this.tables.values()].find((t) => t.players.some((p) => p.id === player.id));
  }

  isSeated(player: Player): boolean {
    return this.tableOf(player) !== undefined;
  }

  /** True when the player may sit at a table; otherwise tells them why not. */
  private canSit(player: Player): boolean {
    const current = this.getMatch(player.matchId);
    if (current && !current.ended) {
      send(player, { type: "error", code: "IN_MATCH", message: "Finish or leave your match first." });
      return false;
    }
    if (current?.ended) this.detach(player);
    if (this.isSeated(player)) {
      send(player, { type: "error", code: "ALREADY_SEATED", message: "Leave your table first." });
      return false;
    }
    return true;
  }

  createTable(player: Player): void {
    if (!this.canSit(player)) return;
    const table: Table = { id: randomUUID(), players: [player] };
    this.tables.set(table.id, table);
    this.broadcastState();
  }

  joinTable(player: Player, tableId: string): void {
    const table = this.tables.get(tableId);
    if (!table) return send(player, { type: "error", code: "NO_TABLE", message: "That table no longer exists." });
    if (!this.canSit(player)) return;
    if (table.players.length >= MAX_PLAYERS) {
      return send(player, { type: "error", code: "TABLE_FULL", message: "That table is full." });
    }
    table.players.push(player);
    if (table.players.length === MAX_PLAYERS) this.launch(table);
    else this.broadcastState();
  }

  /** Leaving as host passes the host seat to the next player; an empty table disappears. */
  leaveTable(player: Player): void {
    const table = this.tableOf(player);
    if (!table) return;
    table.players = table.players.filter((p) => p.id !== player.id);
    if (table.players.length === 0) this.tables.delete(table.id);
    this.broadcastState();
  }

  startTable(player: Player): void {
    const table = this.tableOf(player);
    if (!table) return send(player, { type: "error", code: "NO_TABLE", message: "You are not at a table." });
    if (table.players[0]!.id !== player.id) {
      return send(player, { type: "error", code: "NOT_HOST", message: "Only the host can start the match." });
    }
    if (table.players.length < MIN_PLAYERS) {
      return send(player, { type: "error", code: "TOO_FEW_PLAYERS", message: `Need at least ${MIN_PLAYERS} players.` });
    }
    this.launch(table);
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
    this.leaveTable(player);
    const match = this.getMatch(player.matchId);
    if (match && !match.ended) match.playerDisconnected(player);
    this.broadcastState();
  }

  onReconnect(player: Player): void {
    const match = this.getMatch(player.matchId);
    if (match && !match.ended && !match.isEliminated(player)) match.playerReconnected(player);
    else if (match) this.detach(player);
    this.broadcastState();
  }

  broadcastState(): void {
    const online = this.players.online();
    const tables: TableInfo[] = [...this.tables.values()].map((t) => ({
      id: t.id,
      hostId: t.players[0]!.id,
      players: t.players.map((p) => ({ id: p.id, name: p.name })),
      maxPlayers: MAX_PLAYERS,
    }));
    const message = {
      type: "lobby:state" as const,
      players: online.map((p) => this.players.toLobbyPlayer(p, this.isSeated(p))),
      tables,
      activeMatches: [...this.matches.values()].filter((m) => !m.ended).length,
    };
    for (const p of online) send(p, message);
  }

  private launch(table: Table): void {
    this.tables.delete(table.id);
    const match = new Match(table.players, { onEnd: () => this.broadcastState() });
    this.matches.set(match.id, match);
    match.start();
    this.broadcastState();
  }

  private detach(player: Player): void {
    const match = this.getMatch(player.matchId);
    player.matchId = null;
    if (match && match.ended && match.players.every((p) => p.matchId !== match.id)) {
      this.matches.delete(match.id);
    }
  }
}
