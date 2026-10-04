import { describe, expect, it } from "vitest";

import { REPLAY_SCENARIOS } from "./scenarios";
import { runReplaySuite } from "./runner";

describe("replay evaluation suite", () => {
  it("passes the current high-signal scenario set", async () => {
    const suite = await runReplaySuite(REPLAY_SCENARIOS);

    expect(suite.total).toBeGreaterThanOrEqual(6);
    expect(suite.failed).toBe(0);
    expect(suite.passRate).toBe(1);
  });
});
