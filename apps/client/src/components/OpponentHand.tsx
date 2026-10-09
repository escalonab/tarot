import { useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { getLegalPlacements, type Board, type Card, type PublicPlayer } from "@tarot/shared";
import { CardFace } from "./CardFace";
import type { HoverHandlers } from "./CardTooltip";
import { COLOR_HEX } from "../theme";

export type SeatSide = "top" | "left" | "right";

interface Props {
  player: PublicPlayer;
  side: SeatSide;
  board: Board;
  /** It is this player's turn. */
  active: boolean;
  hover: HoverHandlers;
}

const OPP_CARD_W = 64;

/** Another player's open hand on one side of the board. Look-only: hovering shows details, nothing is clickable. */
export function OpponentHand({ player, side, board, active, hover }: Props) {
  const spots = useMemo(() => new Map(player.hand.map((c) => [c.id, getLegalPlacements(board, c).length])), [player.hand, board]);
  return (
    <div className={`opp-seat is-${side} ${active ? "is-active" : ""} ${player.active ? "" : "is-out"}`}>
      <div className="opp-name">
        <span className="swatch" style={{ background: player.color ? COLOR_HEX[player.color] : "transparent" }} />
        {player.name}
        {!player.active && <span className="muted small">left</span>}
      </div>
      <div className="opp-hand">
        <AnimatePresence initial={false}>
          {player.active &&
            player.hand.map((card) => (
              <OpponentCard key={card.id} card={card} owner={player.name} spots={spots.get(card.id) ?? 0} hover={hover} />
            ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function OpponentCard({ card, owner, spots, hover }: { card: Card; owner: string; spots: number; hover: HoverHandlers }) {
  const hovered = useRef(false);
  const latest = useRef(hover);
  latest.current = hover;
  // the card can leave the hand while the pointer is on it, which never fires mouseleave
  useEffect(
    () => () => {
      if (hovered.current) latest.current.onLeave();
    },
    [],
  );
  const meta = `${owner} \u00b7 ${spots === 0 ? "No legal placement" : `${spots} legal placement${spots === 1 ? "" : "s"}`}`;
  return (
    <motion.div
      layout
      className="opp-card"
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.6, transition: { duration: 0.2 } }}
      whileHover={{ scale: 1.12, zIndex: 5 }}
      transition={{ type: "spring", stiffness: 380, damping: 26 }}
      onMouseEnter={(e) => {
        hovered.current = true;
        hover.onEnter(card, meta, e);
      }}
      onMouseMove={hover.onMove}
      onMouseLeave={() => {
        hovered.current = false;
        hover.onLeave();
      }}
    >
      <CardFace card={card} width={OPP_CARD_W} />
    </motion.div>
  );
}
