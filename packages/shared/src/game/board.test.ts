import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, buildDeck, edgesKey, type Card, type Color } from "./cards.js";
import {
  getExposedEdges,
  getLegalPlacements,
  isLegalPlacement,
  placeCard,
  scoreForColor,
  type Board,
} from "./board.js";

const card = (id: string, ...edges: [Color, Color, Color, Color]): Card => ({ id, edges });

describe("buildDeck", () => {
  it("produces the configured number of unique cards", () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(DEFAULT_CONFIG.deckSize);
    expect(new Set(deck.map((c) => edgesKey(c.edges))).size).toBe(deck.length);
    expect(new Set(deck.map((c) => c.id)).size).toBe(deck.length);
  });

  it("is deterministic", () => {
    expect(buildDeck()).toEqual(buildDeck());
  });

  it("distributes colours evenly across edges", () => {
    const deck = buildDeck();
    const counts: Record<string, number> = {};
    for (const c of deck) for (const e of c.edges) counts[e] = (counts[e] ?? 0) + 1;
    const values = Object.values(counts);
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
  });
});

describe("placement", () => {
  const starter = card("s", "red", "blue", "green", "yellow");
  const board: Board = placeCard({}, starter, 0, 0, null);

  it("only allows origin on an empty board", () => {
    expect(getLegalPlacements({}, starter)).toEqual([{ x: 0, y: 0 }]);
    expect(isLegalPlacement({}, starter, 1, 0)).toBe(false);
  });

  it("matches the facing edge of a single neighbour", () => {
    // placing to the RIGHT of starter: my LEFT edge must equal starter's RIGHT (blue)
    const fits = card("a", "purple", "purple", "purple", "blue");
    const misfit = card("b", "purple", "purple", "purple", "red");
    expect(isLegalPlacement(board, fits, 1, 0)).toBe(true);
    expect(isLegalPlacement(board, misfit, 1, 0)).toBe(false);
    // BELOW starter: my TOP edge must equal starter's BOTTOM (green)
    expect(isLegalPlacement(board, card("c", "green", "red", "red", "red"), 0, 1)).toBe(true);
    // ABOVE starter: my BOTTOM must equal starter's TOP (red)
    expect(isLegalPlacement(board, card("d", "blue", "blue", "red", "blue"), 0, -1)).toBe(true);
    // LEFT of starter: my RIGHT must equal starter's LEFT (yellow)
    expect(isLegalPlacement(board, card("e", "blue", "yellow", "blue", "blue"), -1, 0)).toBe(true);
  });

  it("requires all touching edges to match", () => {
    // starter at (0,0), second at (1,0). Candidate at (1,1) touches (1,0) above only.
    // Put a third at (0,1) so (1,1) touches two cards.
    const right = card("r", "red", "red", "green", "blue");
    const below = card("b", "green", "yellow", "red", "red");
    let b = placeCard(board, right, 1, 0, "p1");
    b = placeCard(b, below, 0, 1, "p1");
    // (1,1): TOP must match right.BOTTOM (green), LEFT must match below.RIGHT (yellow)
    expect(isLegalPlacement(b, card("ok", "green", "red", "red", "yellow"), 1, 1)).toBe(true);
    expect(isLegalPlacement(b, card("no", "green", "red", "red", "red"), 1, 1)).toBe(false);
  });

  it("rejects occupied and detached cells", () => {
    const any = card("x", "red", "red", "red", "red");
    expect(isLegalPlacement(board, any, 0, 0)).toBe(false);
    expect(isLegalPlacement(board, any, 5, 5)).toBe(false);
  });

  it("lists every legal position, sorted", () => {
    const mono = card("m", "red", "red", "red", "red");
    const b = placeCard({}, card("s2", "red", "red", "red", "red"), 0, 0, null);
    expect(getLegalPlacements(b, mono)).toEqual([
      { x: 0, y: -1 },
      { x: -1, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ]);
  });
});

describe("scoring", () => {
  it("counts only exposed edges", () => {
    const a = card("a", "red", "blue", "red", "red");
    const b = card("b", "green", "green", "green", "blue");
    let board: Board = placeCard({}, a, 0, 0, null);
    board = placeCard(board, b, 1, 0, "p1");
    expect(getExposedEdges(board)).toHaveLength(6);
    expect(scoreForColor(board, "red")).toBe(3);
    expect(scoreForColor(board, "blue")).toBe(0); // the shared edge is hidden
    expect(scoreForColor(board, "green")).toBe(3);
  });
});
