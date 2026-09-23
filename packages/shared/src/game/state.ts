import { type Card, type Color, type GameConfig, DEFAULT_CONFIG, buildDeck } from "./cards.js";
import {
  type Board,
  type PlacedCard,
  countExposedByColor,
  hasAnyLegalPlacement,
  isLegalPlacement,
  placeCard,
  scoreForColor,
} from "./board.js";
import { createRng, shuffle } from "../rng.js";

export type Phase = "choosing" | "playing" | "finished";

export interface PlayerState {
  id: string;
  name: string;
  color: Color | null;
  hand: Card[];
}

/** Full authoritative state. Only ever lives on the server; clients get a PlayerView. */
export interface GameState {
  config: GameConfig;
  seed: number;
  phase: Phase;
  players: [PlayerState, PlayerState];
  board: Board;
  deck: Card[];
  /** playerId whose turn it is (null before the round starts / after it ends) */
  turn: string | null;
  turnNumber: number;
  scores: Record<string, number>;
  winnerId: string | null;
}

export type GameAction =
  | { type: "chooseColor"; color: Color }
  | { type: "placeCard"; cardId: string; x: number; y: number };

export type GameEvent =
  | { type: "colorChosen"; playerId: string; color: Color }
  | { type: "roundStarted"; firstPlayerId: string; starter: PlacedCard }
  | { type: "cardPlaced"; playerId: string; card: Card; x: number; y: number }
  | { type: "cardDrawn"; playerId: string }
  | { type: "turnSkipped"; playerId: string }
  | { type: "turnChanged"; playerId: string }
  | { type: "roundEnded"; scores: Record<string, number>; winnerId: string | null };

export type GameErrorCode =
  | "NOT_YOUR_TURN"
  | "WRONG_PHASE"
  | "UNKNOWN_PLAYER"
  | "INVALID_COLOR"
  | "COLOR_TAKEN"
  | "CARD_NOT_IN_HAND"
  | "ILLEGAL_PLACEMENT";

export class GameError extends Error {
  constructor(
    public readonly code: GameErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "GameError";
  }
}

export interface ApplyResult {
  state: GameState;
  events: GameEvent[];
}

export function createGame(
  players: [{ id: string; name: string }, { id: string; name: string }],
  seed: number,
  config: GameConfig = DEFAULT_CONFIG,
): GameState {
  const deck = shuffle(buildDeck(config), createRng(seed));
  return {
    config,
    seed,
    phase: "choosing",
    players: [
      { id: players[0].id, name: players[0].name, color: null, hand: [] },
      { id: players[1].id, name: players[1].name, color: null, hand: [] },
    ],
    board: {},
    deck,
    turn: null,
    turnNumber: 0,
    scores: { [players[0].id]: 0, [players[1].id]: 0 },
    winnerId: null,
  };
}

function getPlayer(state: GameState, playerId: string): PlayerState {
  const p = state.players.find((pl) => pl.id === playerId);
  if (!p) throw new GameError("UNKNOWN_PLAYER");
  return p;
}

function getOpponent(state: GameState, playerId: string): PlayerState {
  const p = state.players.find((pl) => pl.id !== playerId);
  if (!p) throw new GameError("UNKNOWN_PLAYER");
  return p;
}

function drawCard(state: GameState, player: PlayerState, events: GameEvent[]): void {
  const card = state.deck.shift();
  if (!card) return;
  player.hand.push(card);
  events.push({ type: "cardDrawn", playerId: player.id });
}

function finishRound(state: GameState, events: GameEvent[]): void {
  state.phase = "finished";
  state.turn = null;
  const [a, b] = state.players;
  state.scores = {
    [a.id]: a.color ? scoreForColor(state.board, a.color) : 0,
    [b.id]: b.color ? scoreForColor(state.board, b.color) : 0,
  };
  const sa = state.scores[a.id]!;
  const sb = state.scores[b.id]!;
  state.winnerId = sa === sb ? null : sa > sb ? a.id : b.id;
  events.push({ type: "roundEnded", scores: { ...state.scores }, winnerId: state.winnerId });
}

function allCardsPlayed(state: GameState): boolean {
  return state.deck.length === 0 && state.players.every((p) => p.hand.length === 0);
}

function nobodyCanMove(state: GameState): boolean {
  return state.players.every((p) => !hasAnyLegalPlacement(state.board, p.hand));
}

/**
 * Hands the turn to `next`. If they cannot move, they still draw and the turn passes on.
 * Terminates because every skip consumes a deck card or ends the round.
 */
function advanceTurn(state: GameState, next: PlayerState, events: GameEvent[]): void {
  let current = next;
  for (;;) {
    if (allCardsPlayed(state) || (state.deck.length === 0 && nobodyCanMove(state))) {
      finishRound(state, events);
      return;
    }
    if (hasAnyLegalPlacement(state.board, current.hand)) {
      state.turn = current.id;
      state.turnNumber++;
      events.push({ type: "turnChanged", playerId: current.id });
      return;
    }
    events.push({ type: "turnSkipped", playerId: current.id });
    drawCard(state, current, events);
    current = getOpponent(state, current.id);
  }
}

function startRound(state: GameState, events: GameEvent[]): void {
  const starter = state.deck.shift()!;
  state.board = placeCard(state.board, starter, 0, 0, null);
  for (let i = 0; i < state.config.handSize; i++) {
    for (const p of state.players) {
      const card = state.deck.shift();
      if (card) p.hand.push(card);
    }
  }
  const firstIndex = createRng(state.seed ^ 0x5eed)() < 0.5 ? 0 : 1;
  const first = state.players[firstIndex]!;
  state.phase = "playing";
  events.push({ type: "roundStarted", firstPlayerId: first.id, starter: state.board["0,0"]! });
  advanceTurn(state, first, events);
}

/** Pure reducer: validates and applies one action, returning the new state and emitted events. */
export function applyAction(prev: GameState, playerId: string, action: GameAction): ApplyResult {
  const state: GameState = structuredClone(prev);
  const events: GameEvent[] = [];
  const player = getPlayer(state, playerId);

  switch (action.type) {
    case "chooseColor": {
      if (state.phase !== "choosing") throw new GameError("WRONG_PHASE");
      if (!state.config.colors.includes(action.color)) throw new GameError("INVALID_COLOR");
      const opponent = getOpponent(state, playerId);
      if (opponent.color === action.color) throw new GameError("COLOR_TAKEN");
      player.color = action.color;
      events.push({ type: "colorChosen", playerId, color: action.color });
      if (opponent.color) startRound(state, events);
      return { state, events };
    }
    case "placeCard": {
      if (state.phase !== "playing") throw new GameError("WRONG_PHASE");
      if (state.turn !== playerId) throw new GameError("NOT_YOUR_TURN");
      const idx = player.hand.findIndex((c) => c.id === action.cardId);
      if (idx < 0) throw new GameError("CARD_NOT_IN_HAND");
      const card = player.hand[idx]!;
      if (!isLegalPlacement(state.board, card, action.x, action.y)) throw new GameError("ILLEGAL_PLACEMENT");
      player.hand.splice(idx, 1);
      state.board = placeCard(state.board, card, action.x, action.y, playerId);
      events.push({ type: "cardPlaced", playerId, card, x: action.x, y: action.y });
      drawCard(state, player, events);
      advanceTurn(state, getOpponent(state, playerId), events);
      return { state, events };
    }
  }
}

/** What a single player is allowed to see. */
export interface PlayerView {
  phase: Phase;
  config: GameConfig;
  board: Board;
  turn: string | null;
  turnNumber: number;
  deckCount: number;
  scores: Record<string, number>;
  winnerId: string | null;
  exposed: Record<Color, number>;
  me: { id: string; name: string; color: Color | null; hand: Card[] };
  opponent: { id: string; name: string; color: Color | null; handCount: number };
}

export function toPlayerView(state: GameState, playerId: string): PlayerView {
  const me = getPlayer(state, playerId);
  const opp = getOpponent(state, playerId);
  const live: Record<string, number> =
    state.phase === "finished"
      ? state.scores
      : {
          [me.id]: me.color ? scoreForColor(state.board, me.color) : 0,
          [opp.id]: opp.color ? scoreForColor(state.board, opp.color) : 0,
        };
  return {
    phase: state.phase,
    config: state.config,
    board: state.board,
    turn: state.turn,
    turnNumber: state.turnNumber,
    deckCount: state.deck.length,
    scores: live,
    winnerId: state.winnerId,
    exposed: countExposedByColor(state.board, state.config.colors),
    me: { id: me.id, name: me.name, color: me.color, hand: me.hand },
    opponent: { id: opp.id, name: opp.name, color: opp.color, handCount: opp.hand.length },
  };
}
