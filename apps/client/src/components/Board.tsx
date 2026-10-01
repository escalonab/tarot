import { useCallback, useMemo, useRef } from "react";
import { AnimatePresence, animate, motion, useMotionTemplate, useMotionValue, useTransform } from "framer-motion";
import {
  SIDE_DELTA,
  boardBounds,
  getLegalPlacements,
  posKey,
  type Card,
  type Color,
  type PlacedCard,
  type PlayerView,
  type ScoringEdge,
} from "@tarot/shared";
import { CardFace } from "./CardFace";
import { CARD, CELL, COLOR_HEX } from "../theme";
import type { HoverHandlers } from "./CardTooltip";

export interface ScoreBreakdown {
  color: Color;
  edges: ScoringEdge[];
}

interface Props {
  view: PlayerView;
  selectedCard: Card | null;
  canPlay: boolean;
  onPlace: (x: number, y: number) => void;
  hover: HoverHandlers;
  /** Position of the most recently placed card, for a highlight pulse. */
  lastPlaced: { x: number; y: number } | null;
  /** When set, only the edges scoring for this colour are highlighted. */
  breakdown: ScoreBreakdown | null;
}

interface Camera {
  x: number;
  y: number;
  scale: number;
}

const MIN_SCALE = 0.35;
const MAX_SCALE = 2.2;
const MARKER = 26;
const CAMERA_SPRING = { type: "spring", stiffness: 260, damping: 32, mass: 0.6 } as const;

export function Board({ view, selectedCard, canPlay, onPlace, hover, lastPlaced, breakdown }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Motion values bypass React re-renders so the world tracks the pointer 1:1 while dragging.
  const camX = useMotionValue(0);
  const camY = useMotionValue(0);
  const camScale = useMotionValue(1);
  const gridPosition = useMotionTemplate`${camX}px ${camY}px`;
  const gridSize = useTransform(camScale, (s) => `${CELL * s}px ${CELL * s}px`);
  const drag = useRef<{ startX: number; startY: number; camX: number; camY: number; moved: boolean } | null>(null);

  const cards = useMemo(() => Object.values(view.board), [view.board]);
  const spots = useMemo(
    () => (selectedCard && canPlay ? getLegalPlacements(view.board, selectedCard) : []),
    [view.board, selectedCard, canPlay],
  );
  // per card: which of its four sides score for the highlighted colour
  const scoringSides = useMemo(() => {
    if (!breakdown) return null;
    const map = new Map<string, boolean[]>();
    for (const e of breakdown.edges) {
      const key = posKey(e.x, e.y);
      const sides = map.get(key) ?? [false, false, false, false];
      sides[e.side] = true;
      map.set(key, sides);
    }
    return map;
  }, [breakdown]);
  const ownerColor = useCallback(
    (playerId: string): Color | null => {
      if (playerId === view.me.id) return view.me.color;
      if (playerId === view.opponent.id) return view.opponent.color;
      return null;
    },
    [view.me, view.opponent],
  );

  const moveCamera = (to: Camera) => {
    animate(camX, to.x, CAMERA_SPRING);
    animate(camY, to.y, CAMERA_SPRING);
    animate(camScale, to.scale, CAMERA_SPRING);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    camX.stop();
    camY.stop();
    drag.current = { startX: e.clientX, startY: e.clientY, camX: camX.get(), camY: camY.get(), moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved) {
      if (Math.hypot(dx, dy) < 4) return;
      d.moved = true;
      // capturing only now keeps plain clicks on spots/cards working
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    camX.set(d.camX + dx);
    camY.set(d.camY + dy);
  };
  const onPointerUp = () => {
    // keep `moved` around for the click that follows, then clear
    setTimeout(() => (drag.current = null), 0);
  };
  const onWheel = (e: React.WheelEvent) => {
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, camScale.get() * factor));
    animate(camScale, next, { type: "spring", stiffness: 400, damping: 40 });
  };

  const fitToBoard = () => {
    const el = containerRef.current;
    if (!el) return;
    const b = boardBounds(view.board);
    const w = (b.maxX - b.minX + 1) * CELL + CELL;
    const h = (b.maxY - b.minY + 1) * CELL + CELL;
    const scale = Math.min(1.4, Math.max(MIN_SCALE, Math.min(el.clientWidth / w, el.clientHeight / h)));
    const cx = ((b.minX + b.maxX) / 2) * CELL;
    const cy = ((b.minY + b.maxY) / 2) * CELL;
    moveCamera({ x: -cx * scale, y: -cy * scale, scale });
  };

  const guardClick = (fn: () => void) => () => {
    if (drag.current?.moved) return;
    fn();
  };

  return (
    <div
      ref={containerRef}
      className="board"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
    >
      <motion.div className="board-grid" style={{ backgroundPosition: gridPosition, backgroundSize: gridSize }} />
      <motion.div className="board-world" style={{ x: camX, y: camY, scale: camScale }}>
        <AnimatePresence>
          {cards.map((placed) => (
            <BoardCard
              key={placed.card.id}
              placed={placed}
              ownerColor={ownerColor(placed.playerId)}
              isLast={!!lastPlaced && lastPlaced.x === placed.x && lastPlaced.y === placed.y}
              hover={hover}
              ownerName={placed.playerId === view.me.id ? "You" : view.opponent.name}
              scoringSides={scoringSides ? scoringSides.get(posKey(placed.x, placed.y)) ?? [false, false, false, false] : undefined}
            />
          ))}
        </AnimatePresence>
        <AnimatePresence>
          {breakdown?.edges.map((e) => {
            const { dx, dy } = SIDE_DELTA[e.side];
            const tint = COLOR_HEX[breakdown.color];
            return (
              <motion.div
                key={`score-${e.x},${e.y},${e.side}`}
                className="score-marker"
                style={{
                  left: e.x * CELL + (dx * CARD) / 2 - MARKER / 2,
                  top: e.y * CELL + (dy * CARD) / 2 - MARKER / 2,
                  width: MARKER,
                  height: MARKER,
                  borderColor: tint,
                  boxShadow: `0 0 12px ${tint}`,
                }}
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.4 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              >
                {e.points}
              </motion.div>
            );
          })}
        </AnimatePresence>
        <AnimatePresence>
          {spots.map((s) => (
            <motion.button
              key={`spot-${s.x},${s.y}`}
              className="board-spot"
              style={{ left: s.x * CELL - CARD / 2, top: s.y * CELL - CARD / 2, width: CARD, height: CARD }}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              whileHover={{ scale: 1.04 }}
              transition={{ type: "spring", stiffness: 400, damping: 28 }}
              onClick={guardClick(() => onPlace(s.x, s.y))}
              aria-label={`Place at ${s.x}, ${s.y}`}
            >
              {selectedCard && <CardFace card={selectedCard} size={CARD} className="spot-preview" />}
            </motion.button>
          ))}
        </AnimatePresence>
      </motion.div>
      <div className="board-controls">
        <button className="ghost" onClick={fitToBoard} title="Fit board to screen">
          ⤢ Fit
        </button>
        <button className="ghost" onClick={() => moveCamera({ x: 0, y: 0, scale: 1 })} title="Reset view">
          ◎ Reset
        </button>
      </div>
    </div>
  );
}

function BoardCard({
  placed,
  ownerColor,
  ownerName,
  isLast,
  hover,
  scoringSides,
}: {
  placed: PlacedCard;
  ownerColor: Color | null;
  ownerName: string;
  isLast: boolean;
  hover: HoverHandlers;
  /** Defined while a score breakdown is shown; all-false means this card contributes nothing. */
  scoringSides?: readonly boolean[];
}) {
  const dimmed = scoringSides !== undefined && !scoringSides.some(Boolean);
  return (
    <motion.div
      className={`board-card ${isLast ? "is-last" : ""}`}
      style={{
        left: placed.x * CELL - CARD / 2,
        top: placed.y * CELL - CARD / 2,
        width: CARD,
        height: CARD,
        boxShadow: ownerColor ? `0 0 0 2px ${COLOR_HEX[ownerColor]}` : undefined,
      }}
      initial={{ scale: 0.3, opacity: 0, rotate: -14, y: -40 }}
      animate={{ scale: 1, opacity: dimmed ? 0.3 : 1, rotate: 0, y: 0 }}
      transition={{ type: "spring", stiffness: 420, damping: 24, opacity: { duration: 0.2 } }}
      onMouseEnter={(e) => hover.onEnter(placed.card, `${ownerName} · (${placed.x}, ${placed.y})`, e)}
      onMouseMove={hover.onMove}
      onMouseLeave={hover.onLeave}
    >
      <CardFace card={placed.card} size={CARD} exposedSides={scoringSides} />
      {isLast && <motion.span className="pulse" initial={{ opacity: 0.9, scale: 1 }} animate={{ opacity: 0, scale: 1.6 }} transition={{ duration: 1.2 }} />}
    </motion.div>
  );
}
