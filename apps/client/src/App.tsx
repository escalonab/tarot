import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useStore } from "./store";
import { connect, disconnect } from "./net/socket";
import { isMuted, setMuted, unlockAudio } from "./audio";
import { NameScreen } from "./screens/NameScreen";
import { LobbyScreen } from "./screens/LobbyScreen";
import { MatchScreen } from "./screens/MatchScreen";

export function App() {
  const status = useStore((s) => s.status);
  const me = useStore((s) => s.me);
  const match = useStore((s) => s.match);
  const toasts = useStore((s) => s.toasts);
  const [muted, setMutedState] = useState(isMuted());

  useEffect(() => {
    const saved = localStorage.getItem("tarot.name");
    if (saved) connect(saved);
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  const toggleMute = () => {
    setMuted(!muted);
    setMutedState(!muted);
  };

  const signOut = () => {
    disconnect();
    localStorage.removeItem("tarot.name");
    useStore.setState({ me: null, match: null });
  };

  const screen = status === "idle" && !me ? <NameScreen /> : match ? <MatchScreen /> : <LobbyScreen />;

  return (
    <div className="app">
      <nav className="topnav">
        <span className="brand">◆ Tarot</span>
        <span className={`conn ${status}`}>{status === "online" ? "Connected" : status === "connecting" ? "Connecting…" : status === "offline" ? "Reconnecting…" : ""}</span>
        <span className="spacer" />
        {me && <span className="muted">{me.name}</span>}
        <button className="ghost" onClick={toggleMute} title={muted ? "Unmute" : "Mute"}>
          {muted ? "🔇" : "🔊"}
        </button>
        {me && (
          <button className="ghost" onClick={signOut}>
            Change name
          </button>
        )}
      </nav>

      {screen}

      <div className="toasts">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              className={`toast ${t.kind}`}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40 }}
              layout
            >
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
