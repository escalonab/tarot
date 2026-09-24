/** Colours a player can choose and score with. */
export const COLORS = ["green", "red", "blue", "yellow"] as const;
export type Color = (typeof COLORS)[number];

/** Colours that can appear on a card edge: player colours plus the two wildcards. */
export const EDGE_COLORS = [...COLORS, "white", "black"] as const;
export type EdgeColor = (typeof EDGE_COLORS)[number];

export function isPlayerColor(c: EdgeColor): c is Color {
  return (COLORS as readonly string[]).includes(c);
}

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

export type Edges = readonly [EdgeColor, EdgeColor, EdgeColor, EdgeColor];

/** Cards with a star score 3 per semicircle, a crown 5; plain cards score 1. */
export type Mark = "star" | "crown";

export interface Card {
  id: string;
  name: string;
  /** [top, right, bottom, left] */
  edges: Edges;
  mark: Mark | null;
}

export function markValue(card: Card): number {
  return card.mark === "crown" ? 5 : card.mark === "star" ? 3 : 1;
}

export interface GameConfig {
  colors: readonly Color[];
  handSize: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  colors: COLORS,
  handSize: 5,
};

const LETTER: Record<string, EdgeColor> = { G: "green", R: "red", B: "blue", Y: "yellow", W: "white", K: "black" };

/**
 * The physical deck (see resources/cards.md). Edge string is North South East West;
 * the table number is the row index + 1.
 */
const CARD_TABLE: readonly (readonly [name: string, nsew: string, mark?: Mark])[] = [
  ["Millionaire", "BBBB"],
  ["Knight", "YYYY"],
  ["Bride", "RRRR"],
  ["Neanderthal", "GGGG"],
  ["War", "KKKW"],
  ["Death", "KKWK"],
  ["Famine", "KWKK"],
  ["Pestilence", "WKKK"],
  ["Medusa", "GBKW"],
  ["Cyclops", "GRWK"],
  ["Fairy", "WKYB"],
  ["Minotaur", "GYWK"],
  ["Demon", "WBKR"],
  ["Gnome", "WGBK"],
  ["Sphinx", "YKRW"],
  ["Mermaid", "KWBY"],
  ["Pegasus", "YWGK"],
  ["Dragon", "KWRB"],
  ["Angel", "RGKW"],
  ["Centaur", "WKRY"],
  ["Apache", "YYRY"],
  ["Ranger", "RBRR"],
  ["Slave", "BBBG"],
  ["Twins", "GRRR"],
  ["King", "GGBG"],
  ["Assassin", "YYYR"],
  ["Jester", "BYBB"],
  ["Hermit", "YGGG"],
  ["Grapes", "RRYG"],
  ["Petunias", "GYBG"],
  ["Water Lily", "YGRY"],
  ["Radish", "YBBG"],
  ["Dandelion", "YYGB"],
  ["Rose", "GRBB"],
  ["Pansies", "RYRB"],
  ["Corn", "GRBR"],
  ["Mangoes", "BYRB"],
  ["Avocados", "BBRG"],
  ["Eggplant", "BYRR"],
  ["Cherries", "YGBG"],
  ["Peach", "YBYR"],
  ["Lime", "RGGY"],
  ["Pineapple", "GYYR"],
  ["Mushroom", "RBGG"],
  ["Flamingo", "GBRY", "crown"],
  ["Buzzard", "GYBR", "star"],
  ["Monkey", "RYGB", "star"],
  ["Dog", "YBGR", "star"],
  ["Bird", "RGYB", "star"],
  ["Shark", "YBRG", "star"],
  ["Lizard", "BRGY", "star"],
  ["Hare", "BGYR"],
  ["Snake", "BGRY"],
  ["Elephant", "GRBY"],
  ["Octopus", "BRYG"],
  ["Peacock", "BYRG"],
  ["Angelfish", "GRYB"],
  ["Platypus", "YRGB"],
  ["Red Snapper", "RYBG"],
  ["Hippo", "YGRB"],
  ["Fox", "RBGY"],
  ["Elk", "BYGR"],
  ["Alpaca", "RBYG"],
  ["Hoatzin", "GYRB"],
  ["Lobster", "YRBG"],
  ["Parrot", "RGBY"],
  ["Seal", "YGBR"],
  ["Salamander", "GBYR"],
];

export const DECK_SIZE = CARD_TABLE.length;

export function edgesKey(edges: Edges): string {
  return edges.join("|");
}

/** The full card set in table order. Deterministic; shuffle it per game. */
export function buildDeck(): Card[] {
  return CARD_TABLE.map(([name, nsew, mark], i) => {
    const [n, s, e, w] = nsew.split("").map((ch) => {
      const color = LETTER[ch];
      if (!color) throw new Error(`Bad edge letter "${ch}" on ${name}`);
      return color;
    }) as [EdgeColor, EdgeColor, EdgeColor, EdgeColor];
    return { id: `c${i + 1}`, name, edges: [n, e, s, w], mark: mark ?? null };
  });
}

export function findCard(cards: readonly Card[], id: string): Card | undefined {
  return cards.find((c) => c.id === id);
}
