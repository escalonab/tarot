import { z } from "zod";
import { COLORS, EDGE_COLORS } from "./game/cards.js";
import type { GameEvent, PlayerView } from "./game/state.js";

export const ColorSchema = z.enum(COLORS);
export const EdgeColorSchema = z.enum(EDGE_COLORS);

export const CardSchema = z.object({
  id: z.string(),
  name: z.string(),
  edges: z.tuple([EdgeColorSchema, EdgeColorSchema, EdgeColorSchema, EdgeColorSchema]),
  mark: z.enum(["star", "crown"]).nullable(),
});

export const GameActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("chooseColor"), color: ColorSchema }),
  z.object({
    type: z.literal("placeCard"),
    cardId: z.string().min(1).max(16),
    x: z.number().int().min(-1000).max(1000),
    y: z.number().int().min(-1000).max(1000),
  }),
]);

export const PlayerNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .regex(/^[\p{L}\p{N} _\-.]+$/u, "Letters, numbers, spaces, _ - . only");

/** Messages the browser sends to the server. */
export const ClientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("hello"), name: PlayerNameSchema, token: z.string().uuid().optional() }),
  z.object({ type: z.literal("queue:join") }),
  z.object({ type: z.literal("queue:leave") }),
  z.object({ type: z.literal("match:action"), action: GameActionSchema }),
  z.object({ type: z.literal("match:leave") }),
  z.object({ type: z.literal("leaderboard:get") }),
  z.object({ type: z.literal("ping") }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export interface LobbyPlayer {
  id: string;
  name: string;
  status: "idle" | "queued" | "playing";
}

export interface LeaderboardEntry {
  playerId: string;
  name: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
}

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
}

export interface UnlockedAchievement extends AchievementDef {
  unlockedAt: number;
}

export interface MatchResult {
  winnerId: string | null;
  scores: Record<string, number>;
  /** Rating change for the receiving player. */
  ratingDelta: number;
  reason: "completed" | "forfeit";
}

/** Messages the server sends to the browser. Clients trust the server, so no runtime schema needed. */
export type ServerMessage =
  | { type: "welcome"; playerId: string; token: string; name: string; protocolVersion: number }
  | { type: "lobby:state"; players: LobbyPlayer[]; queueSize: number; activeMatches: number }
  | { type: "queue:status"; inQueue: boolean }
  | { type: "match:started"; matchId: string; view: PlayerView }
  | { type: "match:update"; matchId: string; view: PlayerView; events: GameEvent[] }
  | {
      type: "match:ended";
      matchId: string;
      view: PlayerView;
      result: MatchResult;
      unlocked: UnlockedAchievement[];
    }
  | { type: "leaderboard"; entries: LeaderboardEntry[] }
  | { type: "achievements"; unlocked: UnlockedAchievement[] }
  | { type: "error"; code: string; message: string }
  | { type: "pong" };

export const PROTOCOL_VERSION = 1;
