import { type Card, type Color, type Side, SIDES, SIDE_DELTA, oppositeSide } from "./cards.js";

export interface Position {
  x: number;
  y: number;
}

export interface PlacedCard extends Position {
  card: Card;
  /** null for the neutral starter card */
  playerId: string | null;
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

/** True when `card` can be put at (x,y): cell empty, touches ≥1 card, and every touching edge matches. */
export function isLegalPlacement(board: Board, card: Card, x: number, y: number): boolean {
  if (isEmptyBoard(board)) return x === 0 && y === 0;
  if (getAt(board, x, y)) return false;
  let touches = 0;
  for (const side of SIDES) {
    const { dx, dy } = SIDE_DELTA[side];
    const neighbour = getAt(board, x + dx, y + dy);
    if (!neighbour) continue;
    touches++;
    if (neighbour.card.edges[oppositeSide(side)] !== card.edges[side]) return false;
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

export function placeCard(board: Board, card: Card, x: number, y: number, playerId: string | null): Board {
  return { ...board, [posKey(x, y)]: { card, x, y, playerId } };
}

export interface ExposedEdge extends Position {
  side: Side;
  color: Color;
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

export function countExposedByColor(board: Board, colors: readonly Color[]): Record<Color, number> {
  const counts = Object.fromEntries(colors.map((c) => [c, 0])) as Record<Color, number>;
  for (const edge of getExposedEdges(board)) counts[edge.color] = (counts[edge.color] ?? 0) + 1;
  return counts;
}

export function scoreForColor(board: Board, color: Color): number {
  let n = 0;
  for (const edge of getExposedEdges(board)) if (edge.color === color) n++;
  return n;
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
