/**
 * End-to-end smoke test: bots sit at a table, pick colours and play greedily until the round ends.
 * Run against a live server:  pnpm --filter @tarot/server smoke
 *
 * Env:
 *   BOTS=n      number of bots (default 2, max 4)
 *   SEATS=n     the host bot starts the match once n players are seated (default BOTS)
 *   JOIN=1      all bots join an existing table instead of Bot-1 hosting one, for human-hosted tables
 *   THINK_MS    delay before each move
 *
 * One slow bot as a table for manual play:  BOTS=1 SEATS=2 pnpm --filter @tarot/server smoke
 * (join its table in the browser and the match starts right away)
 */
import WebSocket from "ws";
import {
  COLORS,
  MAX_PLAYERS,
  getLegalPlacements,
  type ClientMessage,
  type PlayerView,
  type ServerMessage,
  type TableInfo,
} from "@tarot/shared";

const URL = process.env.WS_URL ?? "ws://localhost:8080/ws";
const BOTS = Number(process.env.BOTS ?? 2);
const SEATS = Number(process.env.SEATS ?? BOTS);
const JOIN = process.env.JOIN === "1";
const THINK_MS = Number(process.env.THINK_MS ?? 0);

if (BOTS < 1 || BOTS > MAX_PLAYERS) throw new Error(`BOTS must be 1-${MAX_PLAYERS}`);

class Bot {
  ws: WebSocket;
  id = "";
  view: PlayerView | null = null;
  done: Promise<void>;
  private resolve!: () => void;
  private colorIdx: number;
  private seated = false;
  private joining = false;
  private started = false;

  constructor(
    readonly name: string,
    private readonly index: number,
  ) {
    this.colorIdx = index;
    this.done = new Promise((r) => (this.resolve = r));
    this.ws = new WebSocket(URL);
    this.ws.on("open", () => this.send({ type: "hello", name }));
    this.ws.on("message", (raw) => this.onMessage(JSON.parse(raw.toString()) as ServerMessage));
    this.ws.on("error", (e) => {
      console.error(`[${name}] socket error`, e);
      process.exit(1);
    });
  }

  send(msg: ClientMessage): void {
    this.ws.send(JSON.stringify(msg));
  }

  private get hosts(): boolean {
    return this.index === 0 && !JOIN;
  }

  private pickColor(): void {
    const taken = new Set(this.view?.players.filter((p) => p.id !== this.id).map((p) => p.color));
    let color = COLORS[this.colorIdx % COLORS.length]!;
    while (taken.has(color)) color = COLORS[++this.colorIdx % COLORS.length]!;
    this.send({ type: "match:action", action: { type: "chooseColor", color } });
  }

  /** Hosts open a table and start it once enough bots sit; everyone else joins the host's (or any open) table. */
  private onLobby(tables: TableInfo[]): void {
    if (this.started) return;
    const mine = tables.find((t) => t.players.some((p) => p.id === this.id));
    this.seated = mine !== undefined;
    if (mine) {
      if (this.hosts && mine.players.length >= SEATS) {
        this.started = true;
        this.send({ type: "table:start" });
      }
      return;
    }
    const target = tables.find((t) => t.players.length < t.maxPlayers && (JOIN || t.hostId === hostBotId));
    if (!this.hosts && !this.joining && target) {
      this.joining = true;
      this.send({ type: "table:join", tableId: target.id });
    }
  }

  private onMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case "welcome":
        this.id = msg.playerId;
        if (this.index === 0) hostBotId = this.id;
        console.log(`[${this.name}] welcome as ${this.id.slice(0, 8)}`);
        if (this.hosts) this.send({ type: "table:create" });
        return;
      case "lobby:state":
        if (!this.seated || this.hosts) this.onLobby(msg.tables);
        return;
      case "match:started":
        this.started = true;
        console.log(`[${this.name}] match ${msg.matchId.slice(0, 8)} with ${msg.view.players.filter((p) => p.id !== this.id).map((p) => p.name).join(", ")}`);
        this.view = msg.view;
        this.pickColor();
        return;
      case "match:update":
        this.view = msg.view;
        if (THINK_MS) setTimeout(() => this.maybePlay(), THINK_MS);
        else this.maybePlay();
        return;
      case "match:ended": {
        const r = msg.result;
        const mine = r.winnerIds.includes(this.id);
        const outcome = mine ? (r.winnerIds.length > 1 ? "tie" : "WIN") : "loss";
        console.log(
          `[${this.name}] ended: ${outcome} (rank ${r.ranks[this.id]}) ${JSON.stringify(r.scores)} rating ${r.ratingDelta >= 0 ? "+" : ""}${r.ratingDelta}` +
            (msg.unlocked.length ? ` unlocked: ${msg.unlocked.map((a) => a.id).join(", ")}` : ""),
        );
        this.send({ type: "match:leave" });
        this.ws.close();
        this.resolve();
        return;
      }
      case "error":
        if (msg.code === "COLOR_TAKEN") {
          this.colorIdx++;
          return this.pickColor();
        }
        // lost a race for the table; try again on the next lobby update
        if (msg.code === "NO_TABLE" || msg.code === "TABLE_FULL") {
          this.joining = false;
          return;
        }
        console.error(`[${this.name}] error ${msg.code}: ${msg.message}`);
        process.exit(1);
    }
  }

  private maybePlay(): void {
    const v = this.view;
    if (!v || v.phase !== "playing" || v.turn !== this.id) return;
    for (const card of v.me.hand) {
      const spot = getLegalPlacements(v.board, card)[0];
      if (spot) {
        console.log(`[${this.name}] turn ${v.turnNumber}: place ${card.id} at (${spot.x},${spot.y})  hand=${v.me.hand.length} deck=${v.deckCount}`);
        this.send({ type: "match:action", action: { type: "placeCard", cardId: card.id, ...spot } });
        return;
      }
    }
    throw new Error(`[${this.name}] server gave me the turn without a legal move`);
  }
}

let hostBotId = "";
const bots = Array.from({ length: BOTS }, (_, i) => new Bot(`Bot-${i + 1}`, i));
const timeout = setTimeout(() => {
  console.error("smoke test timed out");
  process.exit(1);
}, Number(process.env.TIMEOUT_MS ?? 30_000));
await Promise.all(bots.map((b) => b.done));
clearTimeout(timeout);
console.log("smoke test OK");
