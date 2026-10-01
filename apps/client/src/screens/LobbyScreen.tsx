import { motion } from "framer-motion";
import { ACHIEVEMENTS, MIN_PLAYERS, type TableInfo } from "@tarot/shared";
import { useStore } from "../store";
import { sendMessage } from "../net/socket";

export function LobbyScreen() {
  const me = useStore((s) => s.me);
  const lobby = useStore((s) => s.lobby);
  const leaderboard = useStore((s) => s.leaderboard);
  const achievements = useStore((s) => s.achievements);
  const unlocked = new Set(achievements.map((a) => a.id));
  const seated = lobby.tables.some((t) => t.players.some((p) => p.id === me?.id));

  return (
    <div className="lobby">
      <section className="panel hero">
        <h1>Tarot</h1>
        <p className="muted">Place cards where the colours match. Most exposed edges of your colour wins. 2–4 players.</p>
        <motion.button
          className="primary big"
          disabled={seated}
          onClick={() => sendMessage({ type: "table:create" })}
          whileTap={{ scale: 0.97 }}
        >
          Create a table
        </motion.button>
        <p className="muted small">
          {lobby.players.length} online · {lobby.tables.length} open {lobby.tables.length === 1 ? "table" : "tables"} · {lobby.activeMatches} matches in progress
        </p>
      </section>

      <section className="panel">
        <h3>Open tables</h3>
        {lobby.tables.length === 0 ? (
          <p className="muted small">No open tables. Create one and wait for others to join.</p>
        ) : (
          <ul className="list tables">
            {lobby.tables.map((t) => (
              <TableRow key={t.id} table={t} meId={me?.id ?? null} seated={seated} />
            ))}
          </ul>
        )}
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

function TableRow({ table, meId, seated }: { table: TableInfo; meId: string | null; seated: boolean }) {
  const host = table.players[0]!;
  const mine = table.players.some((p) => p.id === meId);
  const isHost = host.id === meId;
  const full = table.players.length >= table.maxPlayers;
  return (
    <li className={`table-row ${mine ? "is-mine" : ""}`}>
      <div>
        <div>{host.name}&rsquo;s table</div>
        <div className="seats">
          {Array.from({ length: table.maxPlayers }, (_, i) => {
            const p = table.players[i];
            return (
              <span key={i} className={`seat ${p ? "is-filled" : ""} ${p?.id === meId ? "is-me" : ""}`}>
                {p ? p.name : "open"}
              </span>
            );
          })}
        </div>
      </div>
      <div className="table-actions">
        {mine ? (
          <>
            {isHost ? (
              <button
                className="primary"
                disabled={table.players.length < MIN_PLAYERS}
                onClick={() => sendMessage({ type: "table:start" })}
                title={table.players.length < MIN_PLAYERS ? `Need at least ${MIN_PLAYERS} players` : undefined}
              >
                Start ({table.players.length}/{table.maxPlayers})
              </button>
            ) : (
              <span className="muted small">
                <span className="spinner" />
                Waiting for {host.name}…
              </span>
            )}
            <button className="ghost" onClick={() => sendMessage({ type: "table:leave" })}>
              Leave
            </button>
          </>
        ) : (
          <button className="primary" disabled={seated || full} onClick={() => sendMessage({ type: "table:join", tableId: table.id })}>
            {full ? "Full" : "Join"}
          </button>
        )}
      </div>
    </li>
  );
}
