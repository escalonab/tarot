import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { getScoringEdges, type Card, type Color, type GameAction, type MatchResult, type PublicPlayer } from "@tarot/shared";
import { useStore } from "../store";
import { sendMessage } from "../net/socket";
import { Board } from "../components/Board";
import { Hand } from "../components/Hand";
import { OpponentHand, type SeatSide } from "../components/OpponentHand";
import { ColorPicker } from "../components/ColorPicker";
import { CardTooltip, useCardHover } from "../components/CardTooltip";
import { COLOR_HEX, COLOR_LABEL } from "../theme";

/** Sides for the opponents in turn order after you (clockwise from your seat at the bottom). */
const OPPONENT_SIDES: Record<number, SeatSide[]> = {
  1: ["top"],
  2: ["left", "right"],
  3: ["left", "top", "right"],
};

export function MatchScreen() {
  const match = useStore((s) => s.match);
  const me = useStore((s) => s.me);
  const selectedId = useStore((s) => s.selectedCardId);
  const selectCard = useStore((s) => s.selectCard);
  const sendAction = useStore((s) => s.sendAction);
  const leaveMatchLocally = useStore((s) => s.leaveMatchLocally);
  const hover = useCardHover();
  const [breakdownColor, setBreakdownColor] = useState<Color | null>(null);
  const lastEvents = match?.lastEvents;
  const lastPlaced = useMemo(() => {
    const ev = lastEvents ? [...lastEvents].reverse().find((e) => e.type === "cardPlaced") : undefined;
    return ev && ev.type === "cardPlaced" ? { x: ev.x, y: ev.y } : null;
  }, [lastEvents]);
  const board = match?.view.board;
  const breakdown = useMemo(
    () => (board && breakdownColor ? { color: breakdownColor, edges: getScoringEdges(board, breakdownColor) } : null),
    [board, breakdownColor],
  );

  if (!match || !me) return null;
  const { view, result } = match;
  const myTurn = view.phase === "playing" && view.turn === me.id;
  const selectedCard: Card | null = view.me.hand.find((c) => c.id === selectedId) ?? null;
  const seat = view.players.findIndex((p) => p.id === me.id);
  const opponents = view.players.slice(seat + 1).concat(view.players.slice(0, seat));

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
          : `${view.players.find((p) => p.id === view.turn)?.name ?? "Someone"} is thinking…`;

  return (
    <div className="match">
      <header className="match-bar">
        <div className="match-players">
          {view.players.map((p) => (
            <PlayerChip
              key={p.id}
              name={p.id === me.id ? "You" : p.name}
              player={p}
              score={view.scores[p.id] ?? 0}
              active={view.phase === "playing" && view.turn === p.id}
              onHoverScore={setBreakdownColor}
            />
          ))}
        </div>
        <div className="match-center">
          <motion.div key={status} className="status" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
            {status}
          </motion.div>
          <div className="muted small">
            Deck {view.deckCount} · Turn {view.turnNumber}
          </div>
        </div>
        <button className="ghost danger" onClick={leave} title={view.phase === "finished" ? "Back to lobby" : "Forfeit and leave"}>
          {view.phase === "finished" ? "Lobby" : "Forfeit"}
        </button>
      </header>

      <div className="match-table">
        {opponents.map((p, i) => (
          <OpponentHand
            key={p.id}
            player={p}
            side={OPPONENT_SIDES[opponents.length]?.[i] ?? "top"}
            board={view.board}
            active={view.phase === "playing" && view.turn === p.id}
            hover={hover.handlers}
          />
        ))}
        <Board
          view={view}
          selectedCard={selectedCard}
          canPlay={myTurn}
          onPlace={place}
          hover={hover.handlers}
          lastPlaced={lastPlaced}
          breakdown={breakdown}
        />
      </div>

      <Hand hand={view.me.hand} board={view.board} selectedId={selectedId} canPlay={myTurn} onSelect={selectCard} hover={hover.handlers} />

      <CardTooltip state={hover.state} />

      <AnimatePresence>
        {view.phase === "choosing" && (
          <ColorPicker colors={view.config.colors} players={view.players} meId={me.id} onPick={(color) => act({ type: "chooseColor", color })} />
        )}
        {result && (
          <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="panel result" initial={{ y: 40, scale: 0.9 }} animate={{ y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 24 }}>
              <h2>{resultTitle(result, me.id, view.players.length)}</h2>
              {result.reason === "forfeit" && <p className="muted">Everyone else left the match.</p>}
              <div className="result-scores">
                {[...view.players]
                  .sort((a, b) => (result.ranks[a.id] ?? 0) - (result.ranks[b.id] ?? 0))
                  .map((p) => (
                    <ScoreLine key={p.id} rank={result.ranks[p.id] ?? 0} name={p.id === me.id ? "You" : p.name} color={p.color} score={result.scores[p.id] ?? 0} left={!p.active} />
                  ))}
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

function resultTitle(result: MatchResult, meId: string, playerCount: number): string {
  const rank = result.ranks[meId] ?? playerCount;
  if (result.winnerIds.includes(meId)) return result.winnerIds.length > 1 ? "Tie for the win" : "You win!";
  return playerCount === 2 ? "You lose" : `You placed ${ORDINAL[rank] ?? `${rank}th`}`;
}

const ORDINAL: Record<number, string> = { 2: "2nd", 3: "3rd", 4: "4th" };

function PlayerChip({
  name,
  player,
  score,
  active,
  onHoverScore,
}: {
  name: string;
  player: PublicPlayer;
  score: number;
  active: boolean;
  onHoverScore: (color: Color | null) => void;
}) {
  const { color } = player;
  const show = () => color && onHoverScore(color);
  const hide = () => onHoverScore(null);
  return (
    <div className={`chip ${active ? "is-active" : ""} ${player.active ? "" : "is-out"}`}>
      <span className="swatch lg" style={{ background: color ? COLOR_HEX[color] : "transparent" }} />
      <div>
        <div className="chip-name">{name}</div>
        <div className="muted small">{player.active ? `${color ? COLOR_LABEL[color] : "—"} · ${player.hand.length} cards` : "left the match"}</div>
      </div>
      {/* hover handlers live on a stable wrapper: the keyed number remounts on every score change */}
      <span
        className={`chip-score ${color ? "is-hoverable" : ""}`}
        tabIndex={color ? 0 : -1}
        title={color ? "Hover to see which edges score" : undefined}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        <motion.span key={score} initial={{ scale: 1.4 }} animate={{ scale: 1 }} style={{ display: "inline-block" }}>
          {score}
        </motion.span>
      </span>
    </div>
  );
}

function ScoreLine({ rank, name, color, score, left }: { rank: number; name: string; color: Color | null; score: number; left: boolean }) {
  return (
    <div className={`score-line ${left ? "is-out" : ""}`}>
      <span className="muted small rank">{rank}</span>
      <span className="swatch" style={{ background: color ? COLOR_HEX[color] : "transparent" }} />
      <span>{name}</span>
      {left && <span className="muted small">left</span>}
      <strong>{score}</strong>
    </div>
  );
}
