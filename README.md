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

Full text in `resources/rules.md`; the deck is listed in `resources/cards.md`.

- 4 player colours (green, red, blue, yellow); card edges may also be white or black.
- Fixed deck of 68 named cards, fixed orientation (no rotation). Each player gets 5 cards.
- Each player picks a distinct colour before the round starts.
- The first player opens by placing any card at the origin; afterwards a card must touch at
  least one card and every touching edge must match. White matches anything; nothing may
  ever touch a black edge.
- After placing, draw one. No legal move → you pass **without** drawing. Playing is mandatory.
- Round ends when all cards are played, or when neither player can move.
- Score = exposed edges of your colour: 1 point each, 3 on star cards, 5 on the crown.
  White scores nothing. Black scores for the colour opposite it on the same card; if that is
  white (or black, on the four Horsemen) it takes the colour and value of the edge touching
  the card's white side, if any.

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
