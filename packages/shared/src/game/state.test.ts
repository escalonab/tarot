import { describe, expect, it } from "vitest";
import { GameError, applyAction, createGame, toPlayerView, type GameState } from "./state.js";
import { getLegalPlacements } from "./board.js";
import { DECK_SIZE, buildDeck, findCard } from "./cards.js";

const P1 = { id: "p1", name: "Alice" };
const P2 = { id: "p2", name: "Bob" };
const DECK = buildDeck();
const pick = (id: string) => findCard(DECK, id)!;

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
  it("starts in the choosing phase with the full physical deck and empty hands", () => {
    const s = createGame([P1, P2], 42);
    expect(s.phase).toBe("choosing");
    expect(s.deck).toHaveLength(DECK_SIZE);
    expect(new Set(s.deck.map((c) => c.id))).toEqual(new Set(DECK.map((c) => c.id)));
    expect(s.players.every((p) => p.hand.length === 0)).toBe(true);
  });

  it("rejects duplicate colours", () => {
    const s = applyAction(createGame([P1, P2], 1), "p1", { type: "chooseColor", color: "red" }).state;
    expect(() => applyAction(s, "p2", { type: "chooseColor", color: "red" })).toThrow(GameError);
  });

  it("deals five cards each onto an empty table once both players have chosen", () => {
    const s = startedGame();
    expect(s.phase).toBe("playing");
    expect(Object.keys(s.board)).toEqual([]);
    expect(s.players[0].hand).toHaveLength(5);
    expect(s.players[1].hand).toHaveLength(5);
    expect(s.deck).toHaveLength(DECK_SIZE - 10);
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
    expect(() => applyAction(s, s.turn!, { type: "placeCard", cardId: "nope", x: 0, y: 0 })).toThrow(
      /CARD_NOT_IN_HAND/,
    );
    const me = s.players.find((p) => p.id === s.turn)!;
    expect(() => applyAction(s, me.id, { type: "placeCard", cardId: me.hand[0]!.id, x: 1, y: 0 })).toThrow(
      /ILLEGAL_PLACEMENT/,
    );
  });

  it("the first card may be any card, only at the origin", () => {
    const s = startedGame();
    const me = s.players.find((p) => p.id === s.turn)!;
    for (const c of me.hand) expect(getLegalPlacements(s.board, c)).toEqual([{ x: 0, y: 0 }]);
    const { state } = applyAction(s, me.id, { type: "placeCard", cardId: me.hand[0]!.id, x: 0, y: 0 });
    expect(state.board["0,0"]).toMatchObject({ card: me.hand[0], playerId: me.id });
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

describe("passing", () => {
  /** Turn player holds Millionaire (all blue) + Slave (blue with one green); opponent holds Knight (all yellow). */
  function rigged(deckIds: string[]): { s: GameState; me: string; opp: string } {
    const s = startedGame();
    const me = s.players.find((p) => p.id === s.turn)!;
    const opp = s.players.find((p) => p.id !== s.turn)!;
    me.hand = [pick("c1"), pick("c23")];
    opp.hand = [pick("c2")];
    s.deck = deckIds.map(pick);
    return { s, me: me.id, opp: opp.id };
  }

  it("a player without a legal move passes without drawing", () => {
    const { s, me, opp } = rigged(["c4", "c5"]);
    const { state, events } = applyAction(s, me, { type: "placeCard", cardId: "c1", x: 0, y: 0 });
    expect(events.map((e) => e.type)).toEqual(["cardPlaced", "cardDrawn", "turnSkipped", "turnChanged"]);
    expect(state.turn).toBe(me);
    expect(state.players.find((p) => p.id === opp)!.hand.map((c) => c.id)).toEqual(["c2"]);
    expect(state.deck.map((c) => c.id)).toEqual(["c5"]);
  });

  it("ends the round when nobody can move, even with cards left in the deck", () => {
    const { s, me } = rigged(["c3", "c4"]);
    const st = s.players.find((p) => p.id === me)!;
    st.hand = [pick("c1")];
    const { state, events } = applyAction(s, me, { type: "placeCard", cardId: "c1", x: 0, y: 0 });
    expect(events.map((e) => e.type)).toEqual(["cardPlaced", "cardDrawn", "roundEnded"]);
    expect(state.phase).toBe("finished");
    expect(state.deck).toHaveLength(1);
    const blue = state.players.find((p) => p.color === "blue")!;
    expect(state.scores[blue.id]).toBe(4);
    expect(state.winnerId).toBe(blue.id);
  });
});

describe("full rounds", () => {
  it.each([1, 2, 3, 5, 8, 13, 21, 34])("seed %i plays to completion with consistent bookkeeping", (seed) => {
    const { state } = playToEnd(startedGame(seed));
    expect(state.phase).toBe("finished");
    expect(state.turn).toBeNull();
    const onBoard = Object.keys(state.board).length;
    const inHands = state.players.reduce((n, p) => n + p.hand.length, 0);
    expect(onBoard + inHands + state.deck.length).toBe(DECK_SIZE);
    const [a, b] = state.players;
    const sa = state.scores[a.id]!;
    const sb = state.scores[b.id]!;
    expect(state.winnerId).toBe(sa === sb ? null : sa > sb ? a.id : b.id);
    // if cards are left over, nobody could have played them
    for (const p of state.players) for (const c of p.hand) expect(getLegalPlacements(state.board, c)).toEqual([]);
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
