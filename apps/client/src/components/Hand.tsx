import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { getLegalPlacements, type Board, type Card } from "@tarot/shared";
import { CardFace } from "./CardFace";
import type { HoverHandlers } from "./CardTooltip";

interface Props {
  hand: Card[];
  board: Board;
  selectedId: string | null;
  canPlay: boolean;
  onSelect: (id: string | null) => void;
  hover: HoverHandlers;
}

const HAND_CARD = 104;

export function Hand({ hand, board, selectedId, canPlay, onSelect, hover }: Props) {
  const playable = useMemo(() => new Map(hand.map((c) => [c.id, getLegalPlacements(board, c).length])), [hand, board]);
  const mid = (hand.length - 1) / 2;

  return (
    <div className="hand">
      <AnimatePresence initial={false}>
        {hand.map((card, i) => {
          const spots = playable.get(card.id) ?? 0;
          const selected = card.id === selectedId;
          const disabled = !canPlay || spots === 0;
          const angle = (i - mid) * 4;
          return (
            <motion.button
              key={card.id}
              layout
              className={`hand-card ${selected ? "is-selected" : ""} ${disabled ? "is-disabled" : ""}`}
              initial={{ x: 240, y: 40, opacity: 0, rotate: 25 }}
              animate={{ x: 0, y: selected ? -28 : Math.abs(i - mid) * 5, opacity: 1, rotate: selected ? 0 : angle }}
              exit={{ y: -160, opacity: 0, scale: 0.6, transition: { duration: 0.25 } }}
              whileHover={disabled ? undefined : { y: -22, scale: 1.06, rotate: 0, zIndex: 5 }}
              whileTap={disabled ? undefined : { scale: 0.98 }}
              transition={{ type: "spring", stiffness: 380, damping: 26 }}
              onClick={() => !disabled && onSelect(selected ? null : card.id)}
              onMouseEnter={(e) => hover.onEnter(card, spots === 0 ? "No legal placement" : `${spots} legal placement${spots === 1 ? "" : "s"}`, e)}
              onMouseMove={hover.onMove}
              onMouseLeave={hover.onLeave}
              aria-pressed={selected}
              aria-label={card.name}
            >
              <CardFace card={card} size={HAND_CARD} />
              {canPlay && spots > 0 && <span className="hand-badge">{spots}</span>}
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
