import { motion } from "framer-motion";
import type { Color, PublicPlayer } from "@tarot/shared";
import { COLOR_HEX, COLOR_LABEL } from "../theme";

interface Props {
  colors: readonly Color[];
  players: PublicPlayer[];
  meId: string;
  onPick: (color: Color) => void;
}

export function ColorPicker({ colors, players, meId, onPick }: Props) {
  const mine = players.find((p) => p.id === meId)?.color ?? null;
  const waitingOn = players.filter((p) => p.active && !p.color).map((p) => p.name);
  return (
    <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="panel" initial={{ y: 30, scale: 0.96 }} animate={{ y: 0, scale: 1 }}>
        <h2>Pick your colour</h2>
        <p className="muted">
          Exposed edges of your colour score when the round ends: 1 point each, 3 on star cards, 5 on the crown. Black edges
          score for the colour opposite them; white never scores.
        </p>
        <div className="color-grid">
          {colors.map((c) => {
            const owner = players.find((p) => p.color === c);
            const isMine = owner?.id === meId;
            const isTaken = owner !== undefined && !isMine;
            return (
              <motion.button
                key={c}
                className={`color-option ${isMine ? "is-mine" : ""}`}
                style={{ background: COLOR_HEX[c] }}
                disabled={isTaken || mine !== null}
                whileHover={isTaken || mine ? undefined : { scale: 1.08 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => onPick(c)}
              >
                <span>{COLOR_LABEL[c]}</span>
                {isTaken && <small>{owner.name}</small>}
                {isMine && <small>You</small>}
              </motion.button>
            );
          })}
        </div>
        {mine && waitingOn.length > 0 && <p className="muted">Waiting for {waitingOn.join(", ")} to choose…</p>}
      </motion.div>
    </motion.div>
  );
}
