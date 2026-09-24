import { useCallback, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { boardBounds, getLegalPlacements, type Card, type Color, type PlacedCard, type PlayerView } from "@tarot/shared";
import { CardFace } from "./CardFace";
import { CARD, CELL, COLOR_HEX } from "../theme";
import type { HoverHandlers } from "./CardTooltip";

interface Props {
  view: PlayerView;
  selectedCard: Card | null;
  canPlay: boolean;
  onPlace: (x: number, y: number) => void;
  hover: HoverHandlers;
  /** Position of the most recently placed card, for a highlight pulse. */
  lastPlaced: { x: number; y: number } | null;
}

interface Camera {
  x: number;
  y: number;
  scale: number;
}

export function Board({ view, selectedCard, canPlay, onPlace, hover, lastPlaced }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, scale: 1 });
  const drag = useRef<{ startX: number; startY: number; camX: number; camY: number; moved: boolean } | null>(null);

  const cards = useMemo(() => Object.values(view.board), [view.board]);
  const spots = useMemo(
    () => (selectedCard && canPlay ? getLegalPlacements(view.board, selectedCard) : []),
    [view.board, selectedCard, canPlay],
  );
  const ownerColor = useCallback(
    (playerId: string): Color | null => {
      if (playerId === view.me.id) return view.me.color;
      if (playerId === view.opponent.id) return view.opponent.color;
      return null;
    },
    [view.me, view.opponent],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    drag.current = { startX: e.clientX, startY: e.clientY, camX: camera.x, camY: camera.y, moved: false };
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
    setCamera((c) => ({ ...c, x: d.camX + dx, y: d.camY + dy }));
  };
  const onPointerUp = () => {
    // keep `moved` around for the click that follows, then clear
    setTimeout(() => (drag.current = null), 0);
  };
  const onWheel = (e: React.WheelEvent) => {
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setCamera((c) => ({ ...c, scale: Math.min(2.2, Math.max(0.35, c.scale * factor)) }));
  };

  const fitToBoard = () => {
    const el = containerRef.current;
    if (!el) return;
    const b = boardBounds(view.board);
    const w = (b.maxX - b.minX + 1) * CELL + CELL;
    const h = (b.maxY - b.minY + 1) * CELL + CELL;
    const scale = Math.min(1.4, Math.max(0.35, Math.min(el.clientWidth / w, el.clientHeight / h)));
    const cx = ((b.minX + b.maxX) / 2) * CELL;
    const cy = ((b.minY + b.maxY) / 2) * CELL;
    setCamera({ x: -cx * scale, y: -cy * scale, scale });
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
      <div className="board-grid" style={{ backgroundPosition: `${camera.x}px ${camera.y}px`, backgroundSize: `${CELL * camera.scale}px ${CELL * camera.scale}px` }} />
      <motion.div
        className="board-world"
        animate={{ x: camera.x, y: camera.y, scale: camera.scale }}
        transition={{ type: "spring", stiffness: 260, damping: 32, mass: 0.6 }}
      >
        <AnimatePresence>
          {cards.map((placed) => (
            <BoardCard
              key={placed.card.id}
              placed={placed}
              ownerColor={ownerColor(placed.playerId)}
              isLast={!!lastPlaced && lastPlaced.x === placed.x && lastPlaced.y === placed.y}
              hover={hover}
              ownerName={placed.playerId === view.me.id ? "You" : view.opponent.name}
            />
          ))}
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
        <button className="ghost" onClick={() => setCamera({ x: 0, y: 0, scale: 1 })} title="Reset view">
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
}: {
  placed: PlacedCard;
  ownerColor: Color | null;
  ownerName: string;
  isLast: boolean;
  hover: HoverHandlers;
}) {
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
      animate={{ scale: 1, opacity: 1, rotate: 0, y: 0 }}
      transition={{ type: "spring", stiffness: 420, damping: 24 }}
      onMouseEnter={(e) => hover.onEnter(placed.card, `${ownerName} · (${placed.x}, ${placed.y})`, e)}
      onMouseMove={hover.onMove}
      onMouseLeave={hover.onLeave}
    >
      <CardFace card={placed.card} size={CARD} />
      {isLast && <motion.span className="pulse" initial={{ opacity: 0.9, scale: 1 }} animate={{ opacity: 0, scale: 1.6 }} transition={{ duration: 1.2 }} />}
    </motion.div>
  );
}
