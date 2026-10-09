import { type Card, type Color, type GameConfig, DEFAULT_CONFIG, buildDeck } from "./cards.js";
import {
  type Board,
  hasAnyLegalPlacement,
  isLegalPlacement,
  placeCard,
  scoreForColor,
  scoresByColor,
} from "./board.js";
import { createRng, shuffle } from "../rng.js";

export type Phase = "choosing" | "playing" | "finished";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

export interface PlayerState {
  id: string;
  name: string;
  color: Color | null;
  hand: Card[];
  /** False once the player has forfeited: they are skipped for the rest of the round and rank last. */
  active: boolean;
}

/** Full authoritative state. Only ever lives on the server; clients get a PlayerView. */
export interface GameState {
  config: GameConfig;
  seed: number;
  phase: Phase;
  /** Seating order; turns pass through it in order. */
  players: PlayerState[];
  board: Board;
  deck: Card[];
  /** playerId whose turn it is (null before the round starts / after it ends) */
  turn: string | null;
  turnNumber: number;
  scores: Record<string, number>;
  /** Everyone sharing first place once the round is over; more than one id means a tie. */
  winnerIds: string[];
}

export type GameAction =
  | { type: "chooseColor"; color: Color }
  | { type: "placeCard"; cardId: string; x: number; y: number };

export type GameEvent =
  | { type: "colorChosen"; playerId: string; color: Color }
  | { type: "roundStarted"; firstPlayerId: string }
  | { type: "cardPlaced"; playerId: string; card: Card; x: number; y: number }
  | { type: "cardDrawn"; playerId: string }
  | { type: "turnSkipped"; playerId: string }
  | { type: "turnChanged"; playerId: string }
  | { type: "playerLeft"; playerId: string }
  | { type: "roundEnded"; scores: Record<string, number>; winnerIds: string[] };

export type GameErrorCode =
  | "NOT_YOUR_TURN"
  | "WRONG_PHASE"
  | "UNKNOWN_PLAYER"
  | "PLAYER_LEFT"
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
  players: readonly { id: string; name: string }[],
  seed: number,
  config: GameConfig = DEFAULT_CONFIG,
): GameState {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS || new Set(players.map((p) => p.id)).size !== players.length) {
    throw new Error(`A game needs ${MIN_PLAYERS}-${MAX_PLAYERS} distinct players`);
  }
  const deck = shuffle(buildDeck(), createRng(seed));
  return {
    config,
    seed,
    phase: "choosing",
    players: players.map((p) => ({ id: p.id, name: p.name, color: null, hand: [], active: true })),
    board: {},
    deck,
    turn: null,
    turnNumber: 0,
    scores: Object.fromEntries(players.map((p) => [p.id, 0])),
    winnerIds: [],
  };
}

function getPlayer(state: GameState, playerId: string): PlayerState {
  const p = state.players.find((pl) => pl.id === playerId);
  if (!p) throw new GameError("UNKNOWN_PLAYER");
  return p;
}

function activePlayers(state: GameState): PlayerState[] {
  return state.players.filter((p) => p.active);
}

/** Exposed-edge score of every player's colour right now (0 for players who have not picked one). */
export function liveScores(state: GameState): Record<string, number> {
  return Object.fromEntries(state.players.map((p) => [p.id, p.color ? scoreForColor(state.board, p.color) : 0]));
}

export interface Standing {
  playerId: string;
  score: number;
  /** 1-based; equal scores share a rank. */
  rank: number;
}

/** Placings, best first: players still in the game by score, then forfeited players by score. */
export function standings(state: GameState): Standing[] {
  const scores = liveScores(state);
  // Array.sort is stable, so exact ties keep seating order
  const sorted = [...state.players].sort((a, b) => Number(b.active) - Number(a.active) || scores[b.id]! - scores[a.id]!);
  let rank = 0;
  return sorted.map((p, i) => {
    const prev = sorted[i - 1];
    if (!prev || prev.active !== p.active || scores[prev.id] !== scores[p.id]) rank = i + 1;
    return { playerId: p.id, score: scores[p.id]!, rank };
  });
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
  state.scores = liveScores(state);
  state.winnerIds = standings(state)
    .filter((s) => s.rank === 1)
    .map((s) => s.playerId);
  events.push({ type: "roundEnded", scores: { ...state.scores }, winnerIds: [...state.winnerIds] });
}

function allCardsPlayed(state: GameState): boolean {
  return state.deck.length === 0 && activePlayers(state).every((p) => p.hand.length === 0);
}

function nobodyCanMove(state: GameState): boolean {
  return activePlayers(state).every((p) => !hasAnyLegalPlacement(state.board, p.hand));
}

/**
 * Passes the turn to the next seat after `fromIndex` that can move. Players with no legal move pass
 * without drawing; if nobody can move the round is over, since nothing could ever change.
 */
function advanceTurn(state: GameState, fromIndex: number, events: GameEvent[]): void {
  if (allCardsPlayed(state) || nobodyCanMove(state)) {
    finishRound(state, events);
    return;
  }
  const n = state.players.length;
  for (let step = 1; step <= n; step++) {
    const candidate = state.players[(fromIndex + step) % n]!;
    if (!candidate.active) continue;
    if (hasAnyLegalPlacement(state.board, candidate.hand)) {
      state.turn = candidate.id;
      state.turnNumber++;
      events.push({ type: "turnChanged", playerId: candidate.id });
      return;
    }
    events.push({ type: "turnSkipped", playerId: candidate.id });
  }
}

function startRound(state: GameState, events: GameEvent[]): void {
  const seated = activePlayers(state);
  for (let i = 0; i < state.config.handSize; i++) {
    for (const p of seated) {
      const card = state.deck.shift();
      if (card) p.hand.push(card);
    }
  }
  const first = seated[Math.floor(createRng(state.seed ^ 0x5eed)() * seated.length)]!;
  state.phase = "playing";
  events.push({ type: "roundStarted", firstPlayerId: first.id });
  // start just before the first player so the rotation lands on them
  const n = state.players.length;
  advanceTurn(state, (state.players.indexOf(first) + n - 1) % n, events);
}

/** Pure reducer: validates and applies one action, returning the new state and emitted events. */
export function applyAction(prev: GameState, playerId: string, action: GameAction): ApplyResult {
  const state: GameState = structuredClone(prev);
  const events: GameEvent[] = [];
  const player = getPlayer(state, playerId);
  if (!player.active) throw new GameError("PLAYER_LEFT");

  switch (action.type) {
    case "chooseColor": {
      if (state.phase !== "choosing") throw new GameError("WRONG_PHASE");
      if (!state.config.colors.includes(action.color)) throw new GameError("INVALID_COLOR");
      if (state.players.some((p) => p.id !== playerId && p.color === action.color)) throw new GameError("COLOR_TAKEN");
      player.color = action.color;
      events.push({ type: "colorChosen", playerId, color: action.color });
      if (activePlayers(state).every((p) => p.color)) startRound(state, events);
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
      advanceTurn(state, state.players.indexOf(player), events);
      return { state, events };
    }
  }
}

/**
 * A player leaves mid-game. They are skipped from now on and rank last; the round ends once fewer
 * than two players remain. Their placed cards stay on the board.
 */
export function forfeitPlayer(prev: GameState, playerId: string): ApplyResult {
  const state: GameState = structuredClone(prev);
  const events: GameEvent[] = [];
  const player = getPlayer(state, playerId);
  if (!player.active || state.phase === "finished") return { state, events };

  player.active = false;
  events.push({ type: "playerLeft", playerId });
  if (state.phase === "choosing") player.color = null; // frees the colour for others

  if (activePlayers(state).length < MIN_PLAYERS) {
    finishRound(state, events);
  } else if (state.phase === "choosing") {
    if (activePlayers(state).every((p) => p.color)) startRound(state, events);
  } else if (state.turn === playerId) {
    advanceTurn(state, state.players.indexOf(player), events);
  } else if (allCardsPlayed(state) || nobodyCanMove(state)) {
    finishRound(state, events);
  }
  return { state, events };
}

/** What a player may know about everyone at the table. Hands are played face up, so they are public. */
export interface PublicPlayer {
  id: string;
  name: string;
  color: Color | null;
  hand: Card[];
  active: boolean;
}

/** What a single player is allowed to see. */
export interface PlayerView {
  phase: Phase;
  config: GameConfig;
  board: Board;
  turn: string | null;
  turnNumber: number;
  deckCount: number;
  /** Live exposed-edge score per player. */
  scores: Record<string, number>;
  winnerIds: string[];
  /** Live score per colour, including colours nobody picked. */
  exposed: Record<Color, number>;
  /** Everyone at the table in seating order, including you. */
  players: PublicPlayer[];
  me: { id: string; name: string; color: Color | null; hand: Card[] };
}

export function toPlayerView(state: GameState, playerId: string): PlayerView {
  const me = getPlayer(state, playerId);
  return {
    phase: state.phase,
    config: state.config,
    board: state.board,
    turn: state.turn,
    turnNumber: state.turnNumber,
    deckCount: state.deck.length,
    scores: liveScores(state),
    winnerIds: state.winnerIds,
    exposed: scoresByColor(state.board, state.config.colors),
    players: state.players.map((p) => ({ id: p.id, name: p.name, color: p.color, hand: p.hand, active: p.active })),
    me: { id: me.id, name: me.name, color: me.color, hand: me.hand },
  };
}
