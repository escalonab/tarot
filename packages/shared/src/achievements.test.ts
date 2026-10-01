import { describe, expect, it } from "vitest";
import { multiEloDeltas } from "./achievements.js";

describe("multiEloDeltas", () => {
  it("is plain Elo for two players", () => {
    expect(multiEloDeltas([{ rating: 1000, rank: 1 }, { rating: 1000, rank: 2 }])).toEqual([16, -16]);
  });

  it("scores every pair for three equally rated players", () => {
    const deltas = multiEloDeltas([1, 2, 3].map((rank) => ({ rating: 1000, rank })));
    expect(deltas).toEqual([16, 0, -16]);
  });

  it("treats equal ranks as a draw and rewards upsets", () => {
    expect(multiEloDeltas([{ rating: 1000, rank: 1 }, { rating: 1000, rank: 1 }])).toEqual([0, 0]);
    const [underdog, favourite] = multiEloDeltas([{ rating: 800, rank: 1 }, { rating: 1200, rank: 2 }]);
    expect(underdog!).toBeGreaterThan(16);
    expect(favourite!).toBeLessThan(-16);
  });

  it("leaves a lone player alone", () => {
    expect(multiEloDeltas([{ rating: 1000, rank: 1 }])).toEqual([0]);
  });
});
