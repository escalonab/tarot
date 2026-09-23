import { describe, expect, it } from "vitest";
import { GameError, applyAction, createGame, toPlayerView, type GameState } from "./state.js";
import { getLegalPlacements } from "./board.js";
import { DEFAULT_CONFIG } from "./cards.js";

const P1 = { id: "p1", name: "Alice" };
const P2 = { id: "p2", name: "Bob" };

function startedGame(seed = 1): GameState {
  let s = createGame([P1, P2], seed);
  s = applyAction(s, "p1", { type: "chooseColor", color: "red" }).state;
  s = applyAction(s, "p2", { type: "chooseColor", color: "blue" }).state;
  return s;
}

/** Plays greedily (first legal card / position) until the round is over. */
function playToEnd(s: GameState): { state: GameState; turns: number } {
  let turns = 0;
  while (s.phase === "playing") {
    const me = s.players.find((p) => p.id === s.turn)!;
    let placed = false;
    for (const card of me.hand) {
      const spots = getLegalPlacements(s.board, card);
      const spot = spots[0];
      if (spot) {
        s = applyAction(s, me.id, { type: "placeCard", cardId: card.id, ...spot }).state;
        placed = true;
        turns++;
        break;
      }
    }
    if (!placed) throw new Error("engine gave the turn to a player without a legal move");
    if (turns > 500) throw new Error("runaway game");
  }
  return { state: s, turns };
}

describe("colour selection", () => {
  it("starts in the choosing phase with a full deck and empty hands", () => {
    const s = createGame([P1, P2], 42);
    expect(s.phase).toBe("choosing");
    expect(s.deck).toHaveLength(DEFAULT_CONFIG.deckSize);
    expect(s.players.every((p) => p.hand.length === 0)).toBe(true);
  });

  it("rejects duplicate colours", () => {
    const s = applyAction(createGame([P1, P2], 1), "p1", { type: "chooseColor", color: "red" }).state;
    expect(() => applyAction(s, "p2", { type: "chooseColor", color: "red" })).toThrow(GameError);
  });

  it("starts the round once both players have chosen", () => {
    const s = startedGame();
    expect(s.phase).toBe("playing");
    expect(Object.keys(s.board)).toEqual(["0,0"]);
    expect(s.board["0,0"]!.playerId).toBeNull();
    expect(s.players[0].hand).toHaveLength(5);
    expect(s.players[1].hand).toHaveLength(5);
    expect(s.deck).toHaveLength(DEFAULT_CONFIG.deckSize - 1 - 10);
    expect(s.turn).not.toBeNull();
  });

  it("is deterministic for the same seed", () => {
    expect(startedGame(7)).toEqual(startedGame(7));
    expect(startedGame(7).deck).not.toEqual(startedGame(8).deck);
  });
});

describe("placing cards", () => {
  it("enforces turn order", () => {
    const s = startedGame();
    const other = s.players.find((p) => p.id !== s.turn)!;
    const card = other.hand[0]!;
    expect(() => applyAction(s, other.id, { type: "placeCard", cardId: card.id, x: 0, y: 1 })).toThrow(
      /NOT_YOUR_TURN/,
    );
  });

  it("rejects cards not in hand and illegal spots", () => {
    const s = startedGame();
    expect(() => applyAction(s, s.turn!, { type: "placeCard", cardId: "nope", x: 1, y: 0 })).toThrow(
      /CARD_NOT_IN_HAND/,
    );
    const me = s.players.find((p) => p.id === s.turn)!;
    expect(() => applyAction(s, me.id, { type: "placeCard", cardId: me.hand[0]!.id, x: 9, y: 9 })).toThrow(
      /ILLEGAL_PLACEMENT/,
    );
  });

  it("moves the card to the board, draws a replacement and passes the turn", () => {
    const s = startedGame();
    const me = s.players.find((p) => p.id === s.turn)!;
    const card = me.hand.find((c) => getLegalPlacements(s.board, c).length > 0)!;
    const spot = getLegalPlacements(s.board, card)[0]!;
    const { state, events } = applyAction(s, me.id, { type: "placeCard", cardId: card.id, ...spot });
    const meAfter = state.players.find((p) => p.id === me.id)!;
    expect(meAfter.hand).toHaveLength(5);
    expect(meAfter.hand.some((c) => c.id === card.id)).toBe(false);
    expect(state.board[`${spot.x},${spot.y}`]?.card.id).toBe(card.id);
    expect(state.deck).toHaveLength(s.deck.length - 1);
    expect(state.turn).not.toBe(me.id);
    expect(events.map((e) => e.type)).toEqual(["cardPlaced", "cardDrawn", "turnChanged"]);
  });

  it("does not mutate the previous state", () => {
    const s = startedGame();
    const snapshot = structuredClone(s);
    const me = s.players.find((p) => p.id === s.turn)!;
    const card = me.hand.find((c) => getLegalPlacements(s.board, c).length > 0)!;
    applyAction(s, me.id, { type: "placeCard", cardId: card.id, ...getLegalPlacements(s.board, card)[0]! });
    expect(s).toEqual(snapshot);
  });
});

describe("full rounds", () => {
  it.each([1, 2, 3, 5, 8, 13, 21, 34])("seed %i plays to completion with consistent bookkeeping", (seed) => {
    const { state } = playToEnd(startedGame(seed));
    expect(state.phase).toBe("finished");
    expect(state.turn).toBeNull();
    const onBoard = Object.keys(state.board).length;
    const inHands = state.players.reduce((n, p) => n + p.hand.length, 0);
    expect(onBoard + inHands + state.deck.length).toBe(DEFAULT_CONFIG.deckSize);
    const [a, b] = state.players;
    const sa = state.scores[a.id]!;
    const sb = state.scores[b.id]!;
    expect(state.winnerId).toBe(sa === sb ? null : sa > sb ? a.id : b.id);
    // if cards are left over, nobody could have played them
    if (inHands > 0) {
      expect(state.deck).toHaveLength(0);
      for (const p of state.players) for (const c of p.hand) expect(getLegalPlacements(state.board, c)).toEqual([]);
    }
  });

  it("emits roundEnded exactly once", () => {
    let s = startedGame(3);
    let ended = 0;
    while (s.phase === "playing") {
      const me = s.players.find((p) => p.id === s.turn)!;
      const card = me.hand.find((c) => getLegalPlacements(s.board, c).length > 0)!;
      const r = applyAction(s, me.id, { type: "placeCard", cardId: card.id, ...getLegalPlacements(s.board, card)[0]! });
      ended += r.events.filter((e) => e.type === "roundEnded").length;
      s = r.state;
    }
    expect(ended).toBe(1);
  });
});

describe("player view", () => {
  it("hides the opponent's hand and the deck", () => {
    const s = startedGame();
    const view = toPlayerView(s, "p1");
    expect(view.me.id).toBe("p1");
    expect(view.me.hand).toHaveLength(5);
    expect(view.opponent.id).toBe("p2");
    expect(view.opponent).not.toHaveProperty("hand");
    expect(view.opponent.handCount).toBe(5);
    expect(view.deckCount).toBe(s.deck.length);
    expect(view).not.toHaveProperty("deck");
  });
});
