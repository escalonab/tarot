import { createRng, shuffle } from "../rng.js";

export const COLORS = ["red", "blue", "green", "yellow", "purple"] as const;
export type Color = (typeof COLORS)[number];

/** Side indices in clockwise order. Opposite side is (side + 2) % 4. */
export const SIDE = { TOP: 0, RIGHT: 1, BOTTOM: 2, LEFT: 3 } as const;
export type Side = (typeof SIDE)[keyof typeof SIDE];
export const SIDES: readonly Side[] = [SIDE.TOP, SIDE.RIGHT, SIDE.BOTTOM, SIDE.LEFT];

/** Grid delta for each side; y grows downward (screen coordinates). */
export const SIDE_DELTA: Readonly<Record<Side, { dx: number; dy: number }>> = {
  [SIDE.TOP]: { dx: 0, dy: -1 },
  [SIDE.RIGHT]: { dx: 1, dy: 0 },
  [SIDE.BOTTOM]: { dx: 0, dy: 1 },
  [SIDE.LEFT]: { dx: -1, dy: 0 },
};

export function oppositeSide(side: Side): Side {
  return ((side + 2) % 4) as Side;
}

export type Edges = readonly [Color, Color, Color, Color];

export interface Card {
  id: string;
  /** [top, right, bottom, left] */
  edges: Edges;
}

export interface GameConfig {
  colors: readonly Color[];
  deckSize: number;
  handSize: number;
  /** Seed that defines the card set. Fixed so every game uses the same 50 cards. */
  deckSeed: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  colors: COLORS,
  deckSize: 50,
  handSize: 5,
  deckSeed: 0x7a207,
};

export function edgesKey(edges: Edges): string {
  return edges.join("|");
}

/**
 * Builds the canonical card set: every colour appears (near-)equally often across all edges,
 * and no two cards share the same edge combination. Deterministic for a given config.
 */
export function buildDeck(config: GameConfig = DEFAULT_CONFIG): Card[] {
  const { colors, deckSize, deckSeed } = config;
  if (colors.length < 2) throw new Error("Need at least two colours");
  if (Math.pow(colors.length, 4) < deckSize) throw new Error("Not enough unique combinations");

  const totalEdges = deckSize * 4;
  const pool: Color[] = [];
  for (let i = 0; i < totalEdges; i++) pool.push(colors[i % colors.length]!);

  for (let attempt = 0; attempt < 1000; attempt++) {
    const rng = createRng(deckSeed + attempt);
    const mixed = shuffle(pool, rng);
    const seen = new Set<string>();
    const cards: Card[] = [];
    let ok = true;
    for (let i = 0; i < deckSize; i++) {
      const edges: Edges = [mixed[i * 4]!, mixed[i * 4 + 1]!, mixed[i * 4 + 2]!, mixed[i * 4 + 3]!];
      const key = edgesKey(edges);
      if (seen.has(key)) {
        ok = false;
        break;
      }
      seen.add(key);
      cards.push({ id: `c${i}`, edges });
    }
    if (ok) return cards;
  }
  throw new Error("Failed to build a unique deck");
}

export function findCard(cards: readonly Card[], id: string): Card | undefined {
  return cards.find((c) => c.id === id);
}
