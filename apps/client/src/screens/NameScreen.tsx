import { useState } from "react";
import { motion } from "framer-motion";
import { PlayerNameSchema } from "@tarot/shared";
import { unlockAudio } from "../audio";
import { connect } from "../net/socket";

export function NameScreen() {
  const [name, setName] = useState(localStorage.getItem("tarot.name") ?? "");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = PlayerNameSchema.safeParse(name);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Invalid name");
    unlockAudio();
    connect(parsed.data);
  };

  return (
    <div className="centered">
      <motion.form className="panel" onSubmit={submit} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1>Tarot</h1>
        <p className="muted">Pick a display name to enter the lobby.</p>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" maxLength={20} />
        {error && <p className="error">{error}</p>}
        <button className="primary" type="submit">
          Enter lobby
        </button>
      </motion.form>
    </div>
  );
}
