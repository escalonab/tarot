import { create } from "zustand";
import type {
  GameAction,
  GameEvent,
  LeaderboardEntry,
  LobbyPlayer,
  MatchResult,
  PlayerView,
  ServerMessage,
  TableInfo,
  UnlockedAchievement,
} from "@tarot/shared";
import { sfx } from "./audio";

export type ConnectionStatus = "idle" | "connecting" | "online" | "offline";

export interface Toast {
  id: number;
  text: string;
  kind: "info" | "success" | "error" | "achievement";
}

export interface MatchState {
  id: string;
  view: PlayerView;
  /** Most recent batch of events, used to trigger animations. */
  lastEvents: GameEvent[];
  result: MatchResult | null;
}

interface Store {
  status: ConnectionStatus;
  me: { id: string; name: string } | null;
  lobby: { players: LobbyPlayer[]; tables: TableInfo[]; activeMatches: number };
  match: MatchState | null;
  leaderboard: LeaderboardEntry[];
  achievements: UnlockedAchievement[];
  toasts: Toast[];
  selectedCardId: string | null;
  /** Wired up by the socket module. */
  sendAction: (action: GameAction) => void;

  setStatus: (status: ConnectionStatus) => void;
  handleServer: (msg: ServerMessage) => void;
  selectCard: (cardId: string | null) => void;
  toast: (text: string, kind?: Toast["kind"]) => void;
  dismissToast: (id: number) => void;
  leaveMatchLocally: () => void;
}

let toastSeq = 0;

export const useStore = create<Store>((set, get) => ({
  status: "idle",
  me: null,
  lobby: { players: [], tables: [], activeMatches: 0 },
  match: null,
  leaderboard: [],
  achievements: [],
  toasts: [],
  selectedCardId: null,
  sendAction: () => {},

  setStatus: (status) => set({ status }),

  toast: (text, kind = "info") => {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts, { id, text, kind }] }));
    setTimeout(() => get().dismissToast(id), kind === "achievement" ? 6000 : 3500);
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  selectCard: (cardId) => {
    if (cardId && cardId !== get().selectedCardId) sfx.select();
    set({ selectedCardId: cardId });
  },

  leaveMatchLocally: () => set({ match: null, selectedCardId: null }),

  handleServer: (msg) => {
    const { toast } = get();
    switch (msg.type) {
      case "welcome": {
        localStorage.setItem("tarot.token", msg.token);
        // a new identity (e.g. server restarted and forgot us) means any match we were showing is gone
        const prev = get();
        const stale = prev.me !== null && prev.me.id !== msg.playerId;
        set({ me: { id: msg.playerId, name: msg.name }, status: "online", ...(stale ? { match: null, selectedCardId: null } : {}) });
        if (stale && prev.match) toast("Server restarted — your match was lost", "error");
        return;
      }
      case "lobby:state":
        set({ lobby: { players: msg.players, tables: msg.tables, activeMatches: msg.activeMatches } });
        return;
      case "leaderboard":
        set({ leaderboard: msg.entries });
        return;
      case "achievements":
        set({ achievements: msg.unlocked });
        return;
      case "match:started": {
        const resumed = get().match?.id === msg.matchId;
        if (!resumed) sfx.matchFound();
        set({
          match: { id: msg.matchId, view: msg.view, lastEvents: [], result: null },
          selectedCardId: null,
        });
        if (!resumed) {
          const others = msg.view.players.filter((p) => p.id !== msg.view.me.id).map((p) => p.name);
          toast(`Match started — you play ${others.join(", ")}`, "success");
        }
        return;
      }
      case "match:update": {
        const me = get().me;
        const nameOf = (id: string) => msg.view.players.find((p) => p.id === id)?.name ?? "A player";
        set({ match: { id: msg.matchId, view: msg.view, lastEvents: msg.events, result: null } });
        for (const ev of msg.events) {
          switch (ev.type) {
            case "cardPlaced":
              ev.playerId === me?.id ? sfx.place() : sfx.opponentPlace();
              break;
            case "cardDrawn":
              if (ev.playerId === me?.id) setTimeout(() => sfx.draw(), 180);
              break;
            case "turnChanged":
              if (ev.playerId === me?.id) setTimeout(() => sfx.yourTurn(), 250);
              break;
            case "turnSkipped":
              sfx.skipped();
              toast(ev.playerId === me?.id ? "No legal move — your turn was skipped" : `${nameOf(ev.playerId)} had no legal move`);
              break;
            case "roundStarted":
              toast(ev.firstPlayerId === me?.id ? "You go first" : `${nameOf(ev.firstPlayerId)} goes first`);
              break;
            case "colorChosen":
              if (ev.playerId !== me?.id) toast(`${nameOf(ev.playerId)} picked ${ev.color}`);
              break;
            case "playerLeft":
              if (ev.playerId !== me?.id) toast(`${nameOf(ev.playerId)} left the match`);
              break;
          }
        }
        // a selected card may have just been played
        if (!msg.view.me.hand.some((c) => c.id === get().selectedCardId)) set({ selectedCardId: null });
        return;
      }
      case "match:ended": {
        const me = get().me;
        set({ match: { id: msg.matchId, view: msg.view, lastEvents: [], result: msg.result }, selectedCardId: null });
        const { winnerIds } = msg.result;
        if (!me || !winnerIds.includes(me.id)) sfx.lose();
        else if (winnerIds.length > 1) sfx.tie();
        else sfx.win();
        if (msg.unlocked.length) {
          set((s) => ({ achievements: [...s.achievements, ...msg.unlocked] }));
          setTimeout(() => {
            sfx.achievement();
            for (const a of msg.unlocked) toast(`Achievement unlocked: ${a.name}`, "achievement");
          }, 900);
        }
        return;
      }
      case "error":
        sfx.error();
        toast(msg.message, "error");
        return;
      case "pong":
        return;
    }
  },
}));
