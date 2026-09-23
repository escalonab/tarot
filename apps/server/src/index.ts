import { existsSync } from "node:fs";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { WebSocketServer } from "ws";
import { config } from "./config.js";
import { handleConnection } from "./connection.js";
import { Lobby } from "./lobby.js";
import { PlayerRegistry } from "./players.js";

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });

app.get("/health", async () => ({ ok: true }));

if (existsSync(config.clientDist)) {
  // wildcard routing resolves files at request time, so a client rebuild doesn't require a server restart
  await app.register(fastifyStatic, { root: config.clientDist });
  // SPA fallback so deep links load the client
  app.setNotFoundHandler((_req, reply) => reply.sendFile("index.html"));
  app.log.info(`Serving client from ${config.clientDist}`);
}

const players = new PlayerRegistry();
const lobby = new Lobby(players);

const wss = new WebSocketServer({ noServer: true, maxPayload: config.maxPayloadBytes });
wss.on("connection", (socket) => handleConnection(socket, { players, lobby }));

app.server.on("upgrade", (req, socket, head) => {
  if (req.url !== "/ws") {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
});

// Heartbeat: drop sockets that stop answering pings.
const HEARTBEAT_MS = 30_000;
const alive = new WeakSet<import("ws").WebSocket>();
wss.on("connection", (ws) => {
  alive.add(ws);
  ws.on("pong", () => alive.add(ws));
});
setInterval(() => {
  for (const ws of wss.clients) {
    if (!alive.has(ws)) {
      ws.terminate();
      continue;
    }
    alive.delete(ws);
    ws.ping();
  }
}, HEARTBEAT_MS).unref();

await app.listen({ port: config.port, host: config.host });
app.log.info(`WebSocket endpoint ws://localhost:${config.port}/ws`);
