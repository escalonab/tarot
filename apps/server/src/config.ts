import { fileURLToPath } from "node:url";

export const config = {
  port: Number(process.env.PORT ?? 8080),
  host: process.env.HOST ?? "0.0.0.0",
  /** How long a disconnected player may reconnect before forfeiting. */
  reconnectGraceMs: Number(process.env.RECONNECT_GRACE_MS ?? 45_000),
  /** Directory with the built client (served statically when present). */
  clientDist: process.env.CLIENT_DIST ?? fileURLToPath(new URL("../../client/dist/", import.meta.url)),
  maxPayloadBytes: 16 * 1024,
};
