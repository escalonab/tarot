# Tarot — colour domino

Two- to four-player, browser-based, turn-based card game. Every card has a colour on each of its four
sides; place cards anywhere on a growing board as long as every touching edge matches. When all
cards are played, the player whose chosen colour has the most exposed edges wins.

## Layout

```
packages/shared   Rules engine, types, zod protocol schemas, achievements (used by both sides)
apps/server       Fastify + ws: lobby (tables), authoritative match state, ratings
apps/client       Vite + React + Framer Motion: board, hand, animations, procedural SFX
```

The engine in `packages/shared/src/game` is pure and deterministic. The server is the only place
that holds full state (deck, every hand); clients receive a `PlayerView` with their own hand and
the other players' card counts.

## Rules (current)

Full text in `resources/rules.md`; the deck is listed in `resources/cards.md`.

- 4 player colours (green, red, blue, yellow); card edges may also be white or black.
- Fixed deck of 68 named cards, fixed orientation (no rotation). Each player gets 5 cards.
- 2–4 players per match. Each picks a distinct colour before the round starts; with fewer than
  four players some colours stay unclaimed (their edges still count for nobody).
- The first player (random) opens by placing any card at the origin; afterwards a card must touch at
  least one card and every touching edge must match. White matches anything; nothing may
  ever touch a black edge. Turns pass around the table in seating order.
- After placing, draw one. No legal move → you pass **without** drawing. Playing is mandatory.
- Round ends when all cards are played, or when nobody can move.
- Score = exposed edges of your colour: 1 point each, 3 on star cards, 5 on the crown.
  White scores nothing. Black scores for the colour opposite it on the same card; if that is
  white (or black, on the four Horsemen) it takes the colour and value of the edge touching
  the card's white side, if any.
- Highest score wins; players with equal scores share their rank (a tie for first is a draw for
  those players). Ratings are Elo computed pairwise from the final ranking.
- A player who forfeits or stays disconnected is skipped for the rest of the round and ranks last;
  their placed cards stay on the board. The round ends early only when one player is left, who wins.

## Lobby

Players create a **table** (up to 4 seats). Others join from the open-tables list; the host starts
the match once at least two players are seated, and a table that fills up starts automatically. If
the host leaves, the next seated player becomes host.

## Getting started

Requires Node 20+ and pnpm 9.

```sh
pnpm install
pnpm test                 # rules-engine unit tests
pnpm dev                  # server on :8080, Vite dev client on :5173 (proxies /ws)
```

Open two to four browser windows at http://localhost:5173, enter different names, create a table in
one and join it from the others, then press **Start** (or fill all four seats).

To play against bots instead:

```sh
pnpm dev:server
BOTS=1 SEATS=2 THINK_MS=1500 TIMEOUT_MS=900000 pnpm --filter @tarot/server smoke   # a slow bot opens a table; join it and it starts
BOTS=2 SEATS=3 THINK_MS=1500 TIMEOUT_MS=900000 pnpm --filter @tarot/server smoke   # two bots, starts when you join (3 seated)
```

`pnpm --filter @tarot/server smoke` with no env runs two bots against each other as an end-to-end
check; `BOTS=3` or `BOTS=4` does the same with a bigger table. Set `JOIN=1` to make the bots join
a table you created instead of hosting one.

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
