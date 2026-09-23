# Tarot — colour domino

Two-player, browser-based, turn-based card game. Every card has a colour on each of its four
sides; place cards anywhere on a growing board as long as every touching edge matches. When all
cards are played, the player whose chosen colour has the most exposed edges wins.

## Layout

```
packages/shared   Rules engine, types, zod protocol schemas, achievements (used by both sides)
apps/server       Fastify + ws: lobby, matchmaking, authoritative match state, ratings
apps/client       Vite + React + Framer Motion: board, hand, animations, procedural SFX
```

The engine in `packages/shared/src/game` is pure and deterministic. The server is the only place
that holds full state (deck, both hands); clients receive a `PlayerView` with their own hand and
the opponent's card count.

## Rules (current)

- 5 colours, 50 unique cards, fixed orientation (no rotation).
- Round starts with a neutral starter card at the origin; each player gets 5 cards.
- Each player picks a distinct colour before the round starts.
- On your turn place one card where **all** touching edges match, then draw one.
- No legal move → turn is skipped, you still draw.
- Round ends when deck and hands are empty, or nobody can move and the deck is empty.
- Score = exposed edges of your colour.

## Getting started

Requires Node 20+ and pnpm 9.

```sh
pnpm install
pnpm test                 # rules-engine unit tests
pnpm dev                  # server on :8080, Vite dev client on :5173 (proxies /ws)
```

Open two browser windows at http://localhost:5173, enter different names, click **Find a match**.

To play against a bot instead:

```sh
pnpm dev:server
BOTS=1 THINK_MS=1500 TIMEOUT_MS=900000 pnpm --filter @tarot/server smoke   # one slow bot in the queue
```

`pnpm --filter @tarot/server smoke` with no env runs two bots against each other as an end-to-end check.

## Production build

```sh
pnpm build                # type-checks packages, builds the client into apps/client/dist
pnpm start                # server also serves apps/client/dist on :8080
```

Any host that supports long-lived WebSockets on a Node process works (Fly.io, Railway, Render, a VPS).

## Next steps

- Persist players, ratings and achievements (SQLite via Drizzle; the `PlayerRegistry` class is the seam).
- Turn timers, rematch, spectating, chat.
- Real sound samples (swap the synth functions in `apps/client/src/audio.ts`).
- Drag-and-drop placement in addition to click-to-place.
- Accounts / login (currently guest identity via a session token in localStorage).
