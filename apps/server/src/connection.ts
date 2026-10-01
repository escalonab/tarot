import type { WebSocket } from "ws";
import { ClientMessageSchema, PROTOCOL_VERSION, type ServerMessage } from "@tarot/shared";
import type { Lobby } from "./lobby.js";
import { send, type Player, type PlayerRegistry } from "./players.js";

interface Deps {
  players: PlayerRegistry;
  lobby: Lobby;
}

function reply(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === 1) socket.send(JSON.stringify(message));
}

/** Wires one WebSocket to the lobby/match layer. The first message must be `hello`. */
export function handleConnection(socket: WebSocket, { players, lobby }: Deps): void {
  let player: Player | null = null;

  socket.on("message", (raw, isBinary) => {
    if (isBinary) return reply(socket, { type: "error", code: "BAD_MESSAGE", message: "Text frames only." });

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.toString());
    } catch {
      return reply(socket, { type: "error", code: "BAD_JSON", message: "Malformed JSON." });
    }
    const result = ClientMessageSchema.safeParse(parsed);
    if (!result.success) {
      return reply(socket, { type: "error", code: "BAD_MESSAGE", message: result.error.issues[0]?.message ?? "Invalid" });
    }
    const msg = result.data;

    if (msg.type === "ping") return reply(socket, { type: "pong" });

    if (msg.type === "hello") {
      if (player) return reply(socket, { type: "error", code: "ALREADY_HELLO", message: "Already identified." });
      const existing = msg.token ? players.getByToken(msg.token) : undefined;
      player = existing ?? players.create(msg.name);
      player.name = msg.name;
      player.lastSeen = Date.now();
      if (player.socket && player.socket !== socket) player.socket.close(4000, "Replaced by a new connection");
      player.socket = socket;

      send(player, { type: "welcome", playerId: player.id, token: player.token, name: player.name, protocolVersion: PROTOCOL_VERSION });
      send(player, { type: "achievements", unlocked: player.achievements });
      send(player, { type: "leaderboard", entries: players.leaderboard() });
      lobby.onReconnect(player);
      return;
    }

    if (!player) return reply(socket, { type: "error", code: "NO_HELLO", message: "Send hello first." });
    player.lastSeen = Date.now();

    switch (msg.type) {
      case "table:create":
        return lobby.createTable(player);
      case "table:join":
        return lobby.joinTable(player, msg.tableId);
      case "table:leave":
        return lobby.leaveTable(player);
      case "table:start":
        return lobby.startTable(player);
      case "match:action": {
        const match = lobby.getMatch(player.matchId);
        if (!match) return send(player, { type: "error", code: "NO_MATCH", message: "You are not in a match." });
        return match.handleAction(player, msg.action);
      }
      case "match:leave":
        return lobby.leaveMatch(player);
      case "leaderboard:get":
        return send(player, { type: "leaderboard", entries: players.leaderboard() });
    }
  });

  socket.on("close", () => {
    if (!player || player.socket !== socket) return;
    player.socket = null;
    lobby.onDisconnect(player);
  });

  socket.on("error", () => socket.terminate());
}
