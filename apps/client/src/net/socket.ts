import type { ClientMessage, GameAction, ServerMessage } from "@tarot/shared";
import { useStore } from "../store";

let socket: WebSocket | null = null;
let name: string | null = null;
let attempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let intentionallyClosed = false;

function url(): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/ws`;
}

export function sendMessage(msg: ClientMessage): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
}

export function sendAction(action: GameAction): void {
  sendMessage({ type: "match:action", action });
}

export function connect(playerName: string): void {
  name = playerName;
  localStorage.setItem("tarot.name", playerName);
  intentionallyClosed = false;
  open();
}

export function disconnect(): void {
  intentionallyClosed = true;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  socket?.close();
  socket = null;
  useStore.getState().setStatus("idle");
}

function open(): void {
  const store = useStore.getState();
  store.setStatus("connecting");
  store.sendAction = sendAction;
  useStore.setState({ sendAction });

  const ws = new WebSocket(url());
  socket = ws;

  ws.onopen = () => {
    attempts = 0;
    const token = localStorage.getItem("tarot.token") ?? undefined;
    sendMessage({ type: "hello", name: name ?? "Player", token });
  };

  ws.onmessage = (ev) => {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(String(ev.data)) as ServerMessage;
    } catch {
      return;
    }
    useStore.getState().handleServer(msg);
  };

  ws.onclose = () => {
    if (socket !== ws) return;
    socket = null;
    if (intentionallyClosed) return;
    useStore.getState().setStatus("offline");
    const delay = Math.min(10_000, 1000 * 2 ** attempts++);
    reconnectTimer = setTimeout(open, delay);
  };

  ws.onerror = () => ws.close();
}
