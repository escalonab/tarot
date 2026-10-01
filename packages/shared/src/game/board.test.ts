import { describe, expect, it } from "vitest";
import { DECK_SIZE, EDGE_COLORS, buildDeck, edgesKey, findCard, type Card, type EdgeColor, type Mark } from "./cards.js";
import {
  edgesFit,
  getExposedEdges,
  getLegalPlacements,
  getScoringEdges,
  isLegalPlacement,
  placeCard,
  scoreForColor,
  scoresByColor,
  type Board,
} from "./board.js";

type E4 = [EdgeColor, EdgeColor, EdgeColor, EdgeColor];
const card = (id: string, ...edges: E4): Card => ({ id, name: id, edges, mark: null });
const marked = (id: string, mark: Mark, ...edges: E4): Card => ({ id, name: id, edges, mark });

describe("buildDeck", () => {
  const deck = buildDeck();

  it("contains exactly the 68 cards from the table, numbered from 1", () => {
    expect(deck).toHaveLength(68);
    expect(DECK_SIZE).toBe(68);
    expect(deck.map((c) => c.id)).toEqual(deck.map((_, i) => `c${i + 1}`));
    expect(new Set(deck.map((c) => edgesKey(c.edges))).size).toBe(deck.length);
    expect(findCard(deck, "c1")).toMatchObject({ name: "Millionaire", edges: ["blue", "blue", "blue", "blue"] });
    expect(findCard(deck, "c68")?.name).toBe("Salamander");
  });

  it("maps North/South/East/West onto top/right/bottom/left", () => {
    // Medusa: N Green, S Blue, E Black, W White
    expect(findCard(deck, "c9")).toMatchObject({ name: "Medusa", edges: ["green", "black", "blue", "white"] });
  });

  it("marks the crown and star cards", () => {
    expect(deck.filter((c) => c.mark === "crown").map((c) => c.name)).toEqual(["Flamingo"]);
    expect(deck.filter((c) => c.mark === "star").map((c) => c.name)).toEqual([
      "Buzzard",
      "Monkey",
      "Dog",
      "Bird",
      "Shark",
      "Lizard",
    ]);
    for (const c of deck) for (const e of c.edges) expect(EDGE_COLORS).toContain(e);
  });

  it("is deterministic", () => {
    expect(buildDeck()).toEqual(buildDeck());
  });
});

describe("placement", () => {
  const starter = card("s", "red", "blue", "green", "yellow");
  const board: Board = placeCard({}, starter, 0, 0, "p1");

  it("only allows origin on an empty board", () => {
    expect(getLegalPlacements({}, starter)).toEqual([{ x: 0, y: 0 }]);
    expect(isLegalPlacement({}, starter, 1, 0)).toBe(false);
  });

  it("matches the facing edge of a single neighbour", () => {
    // placing to the RIGHT of starter: my LEFT edge must equal starter's RIGHT (blue)
    const fits = card("a", "green", "green", "green", "blue");
    const misfit = card("b", "green", "green", "green", "red");
    expect(isLegalPlacement(board, fits, 1, 0)).toBe(true);
    expect(isLegalPlacement(board, misfit, 1, 0)).toBe(false);
    // BELOW starter: my TOP edge must equal starter's BOTTOM (green)
    expect(isLegalPlacement(board, card("c", "green", "red", "red", "red"), 0, 1)).toBe(true);
    // ABOVE starter: my BOTTOM must equal starter's TOP (red)
    expect(isLegalPlacement(board, card("d", "blue", "blue", "red", "blue"), 0, -1)).toBe(true);
    // LEFT of starter: my RIGHT must equal starter's LEFT (yellow)
    expect(isLegalPlacement(board, card("e", "blue", "yellow", "blue", "blue"), -1, 0)).toBe(true);
  });

  it("lets white touch any colour, in either direction", () => {
    expect(edgesFit("white", "red")).toBe(true);
    expect(edgesFit("red", "white")).toBe(true);
    expect(edgesFit("white", "white")).toBe(true);
    expect(isLegalPlacement(board, card("w", "red", "red", "red", "white"), 1, 0)).toBe(true);
    const whiteRight = placeCard({}, card("ws", "red", "white", "red", "red"), 0, 0, "p1");
    for (const c of ["green", "red", "blue", "yellow", "white"] as const) {
      expect(isLegalPlacement(whiteRight, card("x", c, c, c, c), 1, 0)).toBe(true);
    }
  });

  it("never lets anything touch a black edge", () => {
    expect(edgesFit("black", "black")).toBe(false);
    expect(edgesFit("black", "white")).toBe(false);
    expect(edgesFit("white", "black")).toBe(false);
    // my LEFT edge is black, facing starter's blue
    expect(isLegalPlacement(board, card("k", "red", "red", "red", "black"), 1, 0)).toBe(false);
    // starter's RIGHT edge is black: nothing fits there, not even white
    const blackRight = placeCard({}, card("ks", "red", "black", "red", "red"), 0, 0, "p1");
    expect(isLegalPlacement(blackRight, card("x", "white", "white", "white", "white"), 1, 0)).toBe(false);
    expect(getLegalPlacements(blackRight, card("y", "red", "red", "red", "red"))).toEqual([
      { x: 0, y: -1 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
    ]);
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
    const b = placeCard({}, card("s2", "red", "red", "red", "red"), 0, 0, "p1");
    expect(getLegalPlacements(b, mono)).toEqual([
      { x: 0, y: -1 },
      { x: -1, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ]);
  });
});

describe("scoring", () => {
  it("counts only exposed edges, one point each", () => {
    const a = card("a", "red", "blue", "red", "red");
    const b = card("b", "green", "green", "green", "blue");
    let board: Board = placeCard({}, a, 0, 0, "p1");
    board = placeCard(board, b, 1, 0, "p1");
    expect(getExposedEdges(board)).toHaveLength(6);
    expect(scoreForColor(board, "red")).toBe(3);
    expect(scoreForColor(board, "blue")).toBe(0); // the shared edge is hidden
    expect(scoreForColor(board, "green")).toBe(3);
  });

  it("stars are worth 3 per semicircle and crowns 5", () => {
    const star = marked("st", "star", "red", "blue", "red", "blue");
    const crown = marked("cr", "crown", "green", "green", "yellow", "blue");
    let board: Board = placeCard({}, star, 0, 0, "p1");
    expect(scoresByColor(board, ["red", "blue"])).toEqual({ red: 6, blue: 6 });
    board = placeCard(board, crown, 1, 0, "p2"); // covers star's right (blue) with crown's left (blue)
    expect(scoresByColor(board, ["green", "red", "blue", "yellow"])).toEqual({ green: 10, red: 6, blue: 3, yellow: 5 });
  });

  it("white scores for nobody", () => {
    const board = placeCard({}, card("w", "white", "white", "red", "white"), 0, 0, "p1");
    expect(scoresByColor(board, ["green", "red", "blue", "yellow"])).toEqual({ green: 0, red: 1, blue: 0, yellow: 0 });
  });

  it("black scores for the colour opposite it on the same card", () => {
    // Demon-like: top white, right black, bottom blue, left red
    const board = placeCard({}, card("d", "white", "black", "blue", "red"), 0, 0, "p1");
    expect(scoresByColor(board, ["green", "red", "blue", "yellow"])).toEqual({ green: 0, red: 2, blue: 1, yellow: 0 });
  });

  it("black opposite white takes the colour and value touching the white side", () => {
    // Medusa: top green, right black, bottom blue, left white
    const medusa = card("m", "green", "black", "blue", "white");
    let board: Board = placeCard({}, medusa, 0, 0, "p1");
    // nothing touches the white side yet: black is worth nothing
    expect(scoresByColor(board, ["green", "red", "blue", "yellow"])).toEqual({ green: 1, red: 0, blue: 1, yellow: 0 });
    // a star card on the left whose right edge is yellow
    board = placeCard(board, marked("s", "star", "red", "yellow", "red", "red"), -1, 0, "p2");
    // star's own exposed edges: 3 red * 3 = 9; medusa's black now counts 3 for yellow
    expect(scoresByColor(board, ["green", "red", "blue", "yellow"])).toEqual({ green: 1, red: 9, blue: 1, yellow: 3 });
  });

  it("each Horseman black semicircle is worth the colour touching its white side", () => {
    // War: N Black, S Black, E Black, W White -> top black, right black, bottom black, left white
    const war = card("war", "black", "black", "black", "white");
    let board: Board = placeCard({}, war, 0, 0, "p1");
    expect(scoresByColor(board, ["green", "red", "blue", "yellow"])).toEqual({ green: 0, red: 0, blue: 0, yellow: 0 });
    board = placeCard(board, card("n", "blue", "red", "blue", "blue"), -1, 0, "p2");
    expect(scoreForColor(board, "red")).toBe(3);
    expect(scoreForColor(board, "blue")).toBe(3);
    // nothing can ever be placed against the black sides
    expect(getLegalPlacements(board, card("x", "white", "white", "white", "white")).map((p) => `${p.x},${p.y}`)).not.toContain("1,0");
  });

  it("lists the edges behind a colour's score, including black ones scoring by proxy", () => {
    // Cyclops-like: top green, right white, bottom red, left black; Bride (all red) on its right
    let board: Board = placeCard({}, card("cy", "green", "white", "red", "black"), 0, 0, "p1");
    board = placeCard(board, marked("br", "star", "red", "red", "red", "red"), 1, 0, "p2");
    const red = getScoringEdges(board, "red");
    expect(red).toEqual(
      expect.arrayContaining([
        { x: 0, y: 0, side: 2, color: "red", points: 1 },
        { x: 0, y: 0, side: 3, color: "black", points: 3 }, // opposite is white → takes the star's value
        { x: 1, y: 0, side: 0, color: "red", points: 3 },
        { x: 1, y: 0, side: 1, color: "red", points: 3 },
        { x: 1, y: 0, side: 2, color: "red", points: 3 },
      ]),
    );
    expect(red).toHaveLength(5);
    expect(red.reduce((n, e) => n + e.points, 0)).toBe(scoreForColor(board, "red"));
    expect(getScoringEdges(board, "green")).toEqual([{ x: 0, y: 0, side: 0, color: "green", points: 1 }]);
    expect(getScoringEdges(board, "blue")).toEqual([]);
  });
});
