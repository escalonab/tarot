import {
  type Card,
  type Color,
  type EdgeColor,
  type Side,
  SIDES,
  SIDE_DELTA,
  isPlayerColor,
  markValue,
  oppositeSide,
} from "./cards.js";

export interface Position {
  x: number;
  y: number;
}

export interface PlacedCard extends Position {
  card: Card;
  playerId: string;
}

/** Sparse grid keyed by "x,y". Plain object so it serialises as JSON. */
export type Board = Record<string, PlacedCard>;

export function posKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function getAt(board: Board, x: number, y: number): PlacedCard | undefined {
  return board[posKey(x, y)];
}

export function boardCards(board: Board): PlacedCard[] {
  return Object.values(board);
}

export function isEmptyBoard(board: Board): boolean {
  for (const _ in board) return false;
  return true;
}

/** Two facing edges may touch when neither is black and they are equal or one is white. */
export function edgesFit(a: EdgeColor, b: EdgeColor): boolean {
  if (a === "black" || b === "black") return false;
  return a === "white" || b === "white" || a === b;
}

/** True when `card` can be put at (x,y): cell empty, touches ≥1 card, and every touching edge fits. */
export function isLegalPlacement(board: Board, card: Card, x: number, y: number): boolean {
  if (isEmptyBoard(board)) return x === 0 && y === 0;
  if (getAt(board, x, y)) return false;
  let touches = 0;
  for (const side of SIDES) {
    const { dx, dy } = SIDE_DELTA[side];
    const neighbour = getAt(board, x + dx, y + dy);
    if (!neighbour) continue;
    touches++;
    if (!edgesFit(neighbour.card.edges[oppositeSide(side)], card.edges[side])) return false;
  }
  return touches > 0;
}

/** All positions where `card` may legally be placed, sorted for determinism. */
export function getLegalPlacements(board: Board, card: Card): Position[] {
  if (isEmptyBoard(board)) return [{ x: 0, y: 0 }];
  const candidates = new Map<string, Position>();
  for (const placed of boardCards(board)) {
    for (const side of SIDES) {
      const { dx, dy } = SIDE_DELTA[side];
      const x = placed.x + dx;
      const y = placed.y + dy;
      const key = posKey(x, y);
      if (!board[key] && !candidates.has(key)) candidates.set(key, { x, y });
    }
  }
  const result: Position[] = [];
  for (const pos of candidates.values()) {
    if (isLegalPlacement(board, card, pos.x, pos.y)) result.push(pos);
  }
  return result.sort((a, b) => a.y - b.y || a.x - b.x);
}

export function hasAnyLegalPlacement(board: Board, hand: readonly Card[]): boolean {
  return hand.some((card) => getLegalPlacements(board, card).length > 0);
}

export function placeCard(board: Board, card: Card, x: number, y: number, playerId: string): Board {
  return { ...board, [posKey(x, y)]: { card, x, y, playerId } };
}

export interface ExposedEdge extends Position {
  side: Side;
  color: EdgeColor;
}

/** Every card edge that has no neighbour — these are what score. */
export function getExposedEdges(board: Board): ExposedEdge[] {
  const out: ExposedEdge[] = [];
  for (const placed of boardCards(board)) {
    for (const side of SIDES) {
      const { dx, dy } = SIDE_DELTA[side];
      if (!getAt(board, placed.x + dx, placed.y + dy)) {
        out.push({ x: placed.x, y: placed.y, side, color: placed.card.edges[side] });
      }
    }
  }
  return out;
}

export interface EdgeScore {
  color: Color;
  points: number;
}

/**
 * Who an exposed edge scores for and how much. White scores for nobody. Black scores for the
 * colour opposite it on the same card; if that is white (or black, on the Horsemen) it takes the
 * colour and value of the edge touching this card's white side, if any.
 */
export function resolveEdgeScore(board: Board, placed: PlacedCard, side: Side): EdgeScore | null {
  const { card } = placed;
  const edge = card.edges[side];
  if (edge === "white") return null;
  if (isPlayerColor(edge)) return { color: edge, points: markValue(card) };

  const opposite = card.edges[oppositeSide(side)];
  if (isPlayerColor(opposite)) return { color: opposite, points: markValue(card) };

  const whiteSide = SIDES.find((s) => card.edges[s] === "white");
  if (whiteSide === undefined) return null;
  const { dx, dy } = SIDE_DELTA[whiteSide];
  const neighbour = getAt(board, placed.x + dx, placed.y + dy);
  if (!neighbour) return null;
  const facing = neighbour.card.edges[oppositeSide(whiteSide)];
  if (!isPlayerColor(facing)) return null;
  return { color: facing, points: markValue(neighbour.card) };
}

export function scoresByColor(board: Board, colors: readonly Color[]): Record<Color, number> {
  const scores = Object.fromEntries(colors.map((c) => [c, 0])) as Record<Color, number>;
  for (const edge of getExposedEdges(board)) {
    const hit = resolveEdgeScore(board, board[posKey(edge.x, edge.y)]!, edge.side);
    if (hit && hit.color in scores) scores[hit.color] += hit.points;
  }
  return scores;
}

export interface ScoringEdge extends ExposedEdge {
  points: number;
}

/** The exposed edges currently scoring for `color`, with their point values. */
export function getScoringEdges(board: Board, color: Color): ScoringEdge[] {
  const out: ScoringEdge[] = [];
  for (const edge of getExposedEdges(board)) {
    const hit = resolveEdgeScore(board, board[posKey(edge.x, edge.y)]!, edge.side);
    if (hit?.color === color) out.push({ ...edge, points: hit.points });
  }
  return out;
}

export function scoreForColor(board: Board, color: Color): number {
  return scoresByColor(board, [color])[color];
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function boardBounds(board: Board): Bounds {
  let minX = 0,
    minY = 0,
    maxX = 0,
    maxY = 0;
  for (const p of boardCards(board)) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}
