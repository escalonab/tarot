import { useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Card } from "@tarot/shared";
import { CardFace } from "./CardFace";
import { COLOR_HEX, COLOR_LABEL } from "../theme";

export interface HoverHandlers {
  onEnter: (card: Card, meta: string, e: React.MouseEvent) => void;
  onMove: (e: React.MouseEvent) => void;
  onLeave: () => void;
}

interface HoverState {
  card: Card;
  meta: string;
  x: number;
  y: number;
}

/** Tracks which card the pointer is over; render <CardTooltip> with the returned state. */
export function useCardHover(): { state: HoverState | null; handlers: HoverHandlers } {
  const [state, setState] = useState<HoverState | null>(null);
  const onEnter = useCallback((card: Card, meta: string, e: React.MouseEvent) => {
    setState({ card, meta, x: e.clientX, y: e.clientY });
  }, []);
  const onMove = useCallback((e: React.MouseEvent) => {
    setState((s) => (s ? { ...s, x: e.clientX, y: e.clientY } : s));
  }, []);
  const onLeave = useCallback(() => setState(null), []);
  return { state, handlers: { onEnter, onMove, onLeave } };
}

const SIDE_NAMES = ["Top", "Right", "Bottom", "Left"];
const MARK_INFO = { star: "Star \u2014 3 points per edge", crown: "Crown \u2014 5 points per edge" } as const;

export function CardTooltip({ state }: { state: HoverState | null }) {
  const flipY = state ? state.y > window.innerHeight * 0.6 : false;
  const flipX = state ? state.x > window.innerWidth - 280 : false;
  return (
    <AnimatePresence>
      {state && (
        <div
          className="tooltip-anchor"
          style={{
            left: flipX ? state.x - 18 : state.x + 18,
            top: flipY ? state.y - 18 : state.y + 18,
            transform: `translate(${flipX ? "-100%" : "0"}, ${flipY ? "-100%" : "0"})`,
          }}
        >
          <motion.div
            className="tooltip"
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.12 }}
          >
            <CardFace card={state.card} size={72} />
            <div className="tooltip-body">
              <div className="tooltip-title">{state.card.name}</div>
              <div className="tooltip-meta">{state.meta}</div>
              {state.card.mark && <div className="tooltip-meta">{MARK_INFO[state.card.mark]}</div>}
              <ul>
                {state.card.edges.map((c, i) => (
                  <li key={i}>
                    <span className="swatch" style={{ background: COLOR_HEX[c] }} />
                    {SIDE_NAMES[i]}: {COLOR_LABEL[c]}
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
