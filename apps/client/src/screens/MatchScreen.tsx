import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Card, Color, GameAction } from "@tarot/shared";
import { useStore } from "../store";
import { sendMessage } from "../net/socket";
import { Board } from "../components/Board";
import { Hand } from "../components/Hand";
import { ColorPicker } from "../components/ColorPicker";
import { CardTooltip, useCardHover } from "../components/CardTooltip";
import { COLOR_HEX, COLOR_LABEL } from "../theme";

export function MatchScreen() {
  const match = useStore((s) => s.match);
  const me = useStore((s) => s.me);
  const selectedId = useStore((s) => s.selectedCardId);
  const selectCard = useStore((s) => s.selectCard);
  const sendAction = useStore((s) => s.sendAction);
  const leaveMatchLocally = useStore((s) => s.leaveMatchLocally);
  const hover = useCardHover();
  const lastEvents = match?.lastEvents;
  const lastPlaced = useMemo(() => {
    const ev = lastEvents ? [...lastEvents].reverse().find((e) => e.type === "cardPlaced") : undefined;
    return ev && ev.type === "cardPlaced" ? { x: ev.x, y: ev.y } : null;
  }, [lastEvents]);

  if (!match || !me) return null;
  const { view, result } = match;
  const myTurn = view.phase === "playing" && view.turn === me.id;
  const selectedCard: Card | null = view.me.hand.find((c) => c.id === selectedId) ?? null;

  const act = (action: GameAction) => sendAction(action);
  const place = (x: number, y: number) => selectedCard && act({ type: "placeCard", cardId: selectedCard.id, x, y });
  const leave = () => {
    sendMessage({ type: "match:leave" });
    leaveMatchLocally();
  };

  const status =
    view.phase === "choosing"
      ? "Choosing colours"
      : view.phase === "finished"
        ? "Round over"
        : myTurn
          ? selectedCard
            ? "Pick a highlighted spot"
            : "Your turn — pick a card"
          : `${view.opponent.name} is thinking…`;

  return (
    <div className="match">
      <header className="match-bar">
        <PlayerChip name="You" color={view.me.color} score={view.scores[me.id] ?? 0} cards={view.me.hand.length} active={myTurn} />
        <div className="match-center">
          <motion.div key={status} className="status" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
            {status}
          </motion.div>
          <div className="muted small">
            Deck {view.deckCount} · Turn {view.turnNumber}
          </div>
        </div>
        <PlayerChip
          name={view.opponent.name}
          color={view.opponent.color}
          score={view.scores[view.opponent.id] ?? 0}
          cards={view.opponent.handCount}
          active={view.phase === "playing" && view.turn === view.opponent.id}
          right
        />
        <button className="ghost danger" onClick={leave} title={view.phase === "finished" ? "Back to lobby" : "Forfeit and leave"}>
          {view.phase === "finished" ? "Lobby" : "Forfeit"}
        </button>
      </header>

      <Board view={view} selectedCard={selectedCard} canPlay={myTurn} onPlace={place} hover={hover.handlers} lastPlaced={lastPlaced} />

      <Hand hand={view.me.hand} board={view.board} selectedId={selectedId} canPlay={myTurn} onSelect={selectCard} hover={hover.handlers} />

      <CardTooltip state={hover.state} />

      <AnimatePresence>
        {view.phase === "choosing" && (
          <ColorPicker
            colors={view.config.colors}
            mine={view.me.color}
            taken={view.opponent.color}
            opponentName={view.opponent.name}
            onPick={(color) => act({ type: "chooseColor", color })}
          />
        )}
        {result && (
          <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="panel result" initial={{ y: 40, scale: 0.9 }} animate={{ y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 24 }}>
              <h2>{result.winnerId === null ? "Draw" : result.winnerId === me.id ? "You win!" : "You lose"}</h2>
              {result.reason === "forfeit" && <p className="muted">{result.winnerId === me.id ? "Your opponent forfeited." : "You forfeited."}</p>}
              <div className="result-scores">
                <ScoreLine name="You" color={view.me.color} score={result.scores[me.id] ?? 0} />
                <ScoreLine name={view.opponent.name} color={view.opponent.color} score={result.scores[view.opponent.id] ?? 0} />
              </div>
              <p className="muted">
                Rating {result.ratingDelta >= 0 ? "+" : ""}
                {result.ratingDelta}
              </p>
              <button className="primary" onClick={leave}>
                Back to lobby
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PlayerChip({ name, color, score, cards, active, right }: { name: string; color: Color | null; score: number; cards: number; active: boolean; right?: boolean }) {
  return (
    <div className={`chip ${active ? "is-active" : ""} ${right ? "is-right" : ""}`}>
      <span className="swatch lg" style={{ background: color ? COLOR_HEX[color] : "transparent" }} />
      <div>
        <div className="chip-name">{name}</div>
        <div className="muted small">
          {color ? COLOR_LABEL[color] : "—"} · {cards} cards
        </div>
      </div>
      <motion.div key={score} className="chip-score" initial={{ scale: 1.4 }} animate={{ scale: 1 }}>
        {score}
      </motion.div>
    </div>
  );
}

function ScoreLine({ name, color, score }: { name: string; color: Color | null; score: number }) {
  return (
    <div className="score-line">
      <span className="swatch" style={{ background: color ? COLOR_HEX[color] : "transparent" }} />
      <span>{name}</span>
      <strong>{score}</strong>
    </div>
  );
}
