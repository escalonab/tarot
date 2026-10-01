import { describe, expect, it } from "vitest";
import { GameError, applyAction, createGame, forfeitPlayer, standings, toPlayerView, type GameState } from "./state.js";
import { getLegalPlacements } from "./board.js";
import { DECK_SIZE, buildDeck, findCard, type Color } from "./cards.js";

const P1 = { id: "p1", name: "Alice" };
const P2 = { id: "p2", name: "Bob" };
const P3 = { id: "p3", name: "Cleo" };
const P4 = { id: "p4", name: "Dan" };
const DECK = buildDeck();
const pick = (id: string) => findCard(DECK, id)!;

function startedGame(seed = 1): GameState {
  let s = createGame([P1, P2], seed);
  s = applyAction(s, "p1", { type: "chooseColor", color: "red" }).state;
  s = applyAction(s, "p2", { type: "chooseColor", color: "blue" }).state;
  return s;
}

const COLOR_ORDER: Color[] = ["red", "blue", "green", "yellow"];

function startedTable(n: 2 | 3 | 4, seed = 1): GameState {
  const seated = [P1, P2, P3, P4].slice(0, n);
  let s = createGame(seated, seed);
  seated.forEach((p, i) => {
    s = applyAction(s, p.id, { type: "chooseColor", color: COLOR_ORDER[i]! }).state;
  });
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
    expect(s.players[0]!.hand).toHaveLength(5);
    expect(s.players[1]!.hand).toHaveLength(5);
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
    expect(state.winnerIds).toEqual([blue.id]);
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
    const top = Math.max(...state.players.map((p) => state.scores[p.id]!));
    expect(state.winnerIds).toEqual(state.players.filter((p) => state.scores[p.id] === top).map((p) => p.id));
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
  it("hides the other players' hands and the deck", () => {
    const s = startedGame();
    const view = toPlayerView(s, "p1");
    expect(view.me.id).toBe("p1");
    expect(view.me.hand).toHaveLength(5);
    expect(view.players.map((p) => p.id)).toEqual(["p1", "p2"]);
    const other = view.players.find((p) => p.id === "p2")!;
    expect(other).not.toHaveProperty("hand");
    expect(other.handCount).toBe(5);
    expect(view.deckCount).toBe(s.deck.length);
    expect(view).not.toHaveProperty("deck");
  });
});

describe.each([3, 4] as const)("%i players", (n) => {
  it("waits for everyone to choose a colour, then deals five cards each", () => {
    const seated = [P1, P2, P3, P4].slice(0, n);
    let s = createGame(seated, 5);
    seated.slice(0, -1).forEach((p, i) => {
      s = applyAction(s, p.id, { type: "chooseColor", color: COLOR_ORDER[i]! }).state;
      expect(s.phase).toBe("choosing");
    });
    s = applyAction(s, seated[n - 1]!.id, { type: "chooseColor", color: COLOR_ORDER[n - 1]! }).state;
    expect(s.phase).toBe("playing");
    expect(s.players.every((p) => p.hand.length === 5)).toBe(true);
    expect(s.deck).toHaveLength(DECK_SIZE - 5 * n);
  });

  it("rejects a colour any other player already holds", () => {
    const s = applyAction(createGame([P1, P2, P3], 1), "p1", { type: "chooseColor", color: "red" }).state;
    expect(() => applyAction(s, "p3", { type: "chooseColor", color: "red" })).toThrow(/COLOR_TAKEN/);
  });

  it("hands the turn to the next seat, with skipped seats exactly the ones in between", () => {
    let s = startedTable(n, 11);
    const ids = s.players.map((p) => p.id);
    let moves = 0;
    while (s.phase === "playing" && moves < 40) {
      const me = s.players.find((p) => p.id === s.turn)!;
      const card = me.hand.find((c) => getLegalPlacements(s.board, c).length > 0)!;
      const r = applyAction(s, me.id, { type: "placeCard", cardId: card.id, ...getLegalPlacements(s.board, card)[0]! });
      const skipped = r.events.flatMap((e) => (e.type === "turnSkipped" ? [e.playerId] : []));
      if (r.state.turn) {
        const from = ids.indexOf(me.id);
        const to = ids.indexOf(r.state.turn);
        const between = Array.from({ length: (to - from - 1 + 2 * n) % n }, (_, k) => ids[(from + 1 + k) % n]);
        expect(skipped).toEqual(between);
      }
      s = r.state;
      moves++;
    }
    expect(moves).toBeGreaterThan(0);
  });

  it.each([1, 2, 3, 5, 8, 13])("seed %i plays to completion with consistent bookkeeping", (seed) => {
    const { state } = playToEnd(startedTable(n, seed));
    expect(state.phase).toBe("finished");
    const inHands = state.players.reduce((total, p) => total + p.hand.length, 0);
    expect(Object.keys(state.board).length + inHands + state.deck.length).toBe(DECK_SIZE);
    const top = Math.max(...state.players.map((p) => state.scores[p.id]!));
    expect(state.winnerIds).toEqual(state.players.filter((p) => state.scores[p.id] === top).map((p) => p.id));
    for (const p of state.players) for (const c of p.hand) expect(getLegalPlacements(state.board, c)).toEqual([]);
  });
});

describe("skipping in a multi-player round", () => {
  it("passes over a player with no legal move to the next one who has one", () => {
    const s = startedTable(3);
    const t = s.players.findIndex((p) => p.id === s.turn);
    const at = (k: number) => s.players[(t + k) % 3]!;
    const mover = at(0);
    const blocked = at(1);
    const free = at(2);
    mover.hand = [pick("c1"), pick("c4")]; // c1 is all blue
    blocked.hand = [pick("c2")]; // all yellow: nothing blue to touch
    free.hand = [pick("c23")]; // blue on three sides
    s.deck = [pick("c5")];
    const { state, events } = applyAction(s, mover.id, { type: "placeCard", cardId: "c1", x: 0, y: 0 });
    expect(events.map((e) => e.type)).toEqual(["cardPlaced", "cardDrawn", "turnSkipped", "turnChanged"]);
    expect(events.find((e) => e.type === "turnSkipped")).toMatchObject({ playerId: blocked.id });
    expect(state.turn).toBe(free.id);
  });
});

describe("forfeiting", () => {
  it("drops a player who is not on turn without disturbing the turn", () => {
    const s = startedTable(3);
    const leaver = s.players.find((p) => p.id !== s.turn)!;
    const { state, events } = forfeitPlayer(s, leaver.id);
    expect(events.map((e) => e.type)).toEqual(["playerLeft"]);
    expect(state.phase).toBe("playing");
    expect(state.turn).toBe(s.turn);
    expect(state.players.find((p) => p.id === leaver.id)!.active).toBe(false);
  });

  it("passes the turn on when the player on turn leaves", () => {
    const s = startedTable(4);
    const i = s.players.findIndex((p) => p.id === s.turn);
    const { state } = forfeitPlayer(s, s.turn!);
    expect(state.turn).toBe(s.players[(i + 1) % 4]!.id);
  });

  it("never gives a forfeited player the turn again, and ranks them last", () => {
    let s = startedTable(3, 4);
    const leaver = s.players.find((p) => p.id !== s.turn)!;
    s = forfeitPlayer(s, leaver.id).state;
    const { state } = playToEnd(s);
    expect(state.phase).toBe("finished");
    expect(state.players.find((p) => p.id === leaver.id)!.hand).toHaveLength(5);
    expect(standings(state).at(-1)).toMatchObject({ playerId: leaver.id, rank: 3 });
    expect(state.winnerIds).not.toContain(leaver.id);
  });

  it("ends the round when only one player is left, and that player wins", () => {
    let s = startedTable(3);
    s = forfeitPlayer(s, "p1").state;
    expect(s.phase).toBe("playing");
    const { state, events } = forfeitPlayer(s, "p2");
    expect(events.map((e) => e.type)).toEqual(["playerLeft", "roundEnded"]);
    expect(state.phase).toBe("finished");
    expect(state.winnerIds).toEqual(["p3"]);
  });

  it("in the choosing phase frees the colour and starts once the rest have chosen", () => {
    let s = createGame([P1, P2, P3], 2);
    s = applyAction(s, "p1", { type: "chooseColor", color: "red" }).state;
    s = applyAction(s, "p3", { type: "chooseColor", color: "blue" }).state;
    const { state } = forfeitPlayer(s, "p2");
    expect(state.phase).toBe("playing");
    expect(state.players.find((p) => p.id === "p2")!.hand).toHaveLength(0);
    expect(state.players.filter((p) => p.active).every((p) => p.hand.length === 5)).toBe(true);
  });

  it("stops a forfeited player from acting and is a no-op the second time", () => {
    const s = forfeitPlayer(startedTable(3), "p2").state;
    expect(() => applyAction(s, "p2", { type: "chooseColor", color: "green" })).toThrow(/PLAYER_LEFT/);
    expect(forfeitPlayer(s, "p2")).toEqual({ state: s, events: [] });
  });
});

describe("standings", () => {
  it("shares ranks between equal scores and puts forfeited players last", () => {
    const s = forfeitPlayer(startedTable(4), "p2").state; // nothing on the board: everyone has 0
    expect(standings(s)).toEqual([
      { playerId: "p1", score: 0, rank: 1 },
      { playerId: "p3", score: 0, rank: 1 },
      { playerId: "p4", score: 0, rank: 1 },
      { playerId: "p2", score: 0, rank: 4 },
    ]);
  });
});
