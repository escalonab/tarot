/**
 * End-to-end smoke test: bots connect, queue, pick colours and play greedily until the round ends.
 * Run against a live server:  pnpm --filter @tarot/server smoke
 * Spawn a single bot as an opponent for manual play:  BOTS=1 pnpm --filter @tarot/server smoke
 */
import WebSocket from "ws";
import { COLORS, getLegalPlacements, type ClientMessage, type Color, type PlayerView, type ServerMessage } from "@tarot/shared";

const URL = process.env.WS_URL ?? "ws://localhost:8080/ws";
const BOTS = Number(process.env.BOTS ?? 2);
const THINK_MS = Number(process.env.THINK_MS ?? 0);

class Bot {
  ws: WebSocket;
  id = "";
  view: PlayerView | null = null;
  done: Promise<void>;
  private resolve!: () => void;
  private colorIdx = 0;

  constructor(readonly name: string) {
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

  private pickColor(): void {
    const taken = this.view?.opponent.color;
    let color: Color = COLORS[this.colorIdx % COLORS.length]!;
    while (color === taken) color = COLORS[++this.colorIdx % COLORS.length]!;
    this.send({ type: "match:action", action: { type: "chooseColor", color } });
  }

  private onMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case "welcome":
        this.id = msg.playerId;
        console.log(`[${this.name}] welcome as ${this.id.slice(0, 8)}`);
        this.send({ type: "queue:join" });
        return;
      case "match:started":
        console.log(`[${this.name}] match ${msg.matchId.slice(0, 8)} vs ${msg.view.opponent.name}`);
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
        const outcome = r.winnerId === null ? "draw" : r.winnerId === this.id ? "WIN" : "loss";
        console.log(
          `[${this.name}] ended: ${outcome} ${JSON.stringify(r.scores)} rating ${r.ratingDelta >= 0 ? "+" : ""}${r.ratingDelta}` +
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

const bots = Array.from({ length: BOTS }, (_, i) => new Bot(`Bot-${i + 1}`));
const timeout = setTimeout(() => {
  console.error("smoke test timed out");
  process.exit(1);
}, Number(process.env.TIMEOUT_MS ?? 30_000));
await Promise.all(bots.map((b) => b.done));
clearTimeout(timeout);
console.log("smoke test OK");
