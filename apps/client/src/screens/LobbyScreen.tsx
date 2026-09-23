import { motion } from "framer-motion";
import { ACHIEVEMENTS } from "@tarot/shared";
import { useStore } from "../store";
import { sendMessage } from "../net/socket";

export function LobbyScreen() {
  const me = useStore((s) => s.me);
  const lobby = useStore((s) => s.lobby);
  const inQueue = useStore((s) => s.inQueue);
  const leaderboard = useStore((s) => s.leaderboard);
  const achievements = useStore((s) => s.achievements);
  const unlocked = new Set(achievements.map((a) => a.id));

  const toggleQueue = () => sendMessage({ type: inQueue ? "queue:leave" : "queue:join" });

  return (
    <div className="lobby">
      <section className="panel hero">
        <h1>Tarot</h1>
        <p className="muted">Place cards where the colours match. Most exposed edges of your colour wins.</p>
        <motion.button className={`primary big ${inQueue ? "is-waiting" : ""}`} onClick={toggleQueue} whileTap={{ scale: 0.97 }}>
          {inQueue ? (
            <>
              <span className="spinner" /> Looking for an opponent… (cancel)
            </>
          ) : (
            "Find a match"
          )}
        </motion.button>
        <p className="muted small">
          {lobby.players.length} online · {lobby.queueSize} in queue · {lobby.activeMatches} matches in progress
        </p>
      </section>

      <div className="lobby-grid">
        <section className="panel">
          <h3>Online</h3>
          <ul className="list">
            {lobby.players.map((p) => (
              <li key={p.id} className={p.id === me?.id ? "is-me" : ""}>
                <span className={`dot ${p.status}`} />
                {p.name}
                <span className="muted small">{p.status}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h3>Leaderboard</h3>
          {leaderboard.length === 0 ? (
            <p className="muted small">No games played yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player</th>
                  <th>Rating</th>
                  <th>W</th>
                  <th>L</th>
                  <th>D</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((e, i) => (
                  <tr key={e.playerId} className={e.playerId === me?.id ? "is-me" : ""}>
                    <td>{i + 1}</td>
                    <td>{e.name}</td>
                    <td>{e.rating}</td>
                    <td>{e.wins}</td>
                    <td>{e.losses}</td>
                    <td>{e.draws}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="panel">
          <h3>
            Achievements <span className="muted small">{unlocked.size}/{ACHIEVEMENTS.length}</span>
          </h3>
          <ul className="list achievements">
            {ACHIEVEMENTS.map((a) => (
              <li key={a.id} className={unlocked.has(a.id) ? "is-unlocked" : "is-locked"}>
                <span className="trophy">{unlocked.has(a.id) ? "★" : "☆"}</span>
                <div>
                  <div>{a.name}</div>
                  <div className="muted small">{a.description}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
