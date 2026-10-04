import { describe, expect, it } from "vitest";

import type { Evidence } from "../domain/evidence";
import { evaluateRisk } from "./fusion";

const now = new Date("2026-10-04T17:00:30.000Z");

function evidence(input: Partial<Evidence> & Pick<Evidence, "id" | "source" | "signal" | "score" | "observedAt">): Evidence {
  return {
    incidentId: "incident-1",
    receivedAt: input.observedAt,
    provenance: {
      kind: input.source === "device" ? "device" : "classifier",
      provider: "guardian-test",
    },
    ...input,
  };
}

describe("evaluateRisk", () => {
  it("returns LOW when no evidence has arrived", () => {
    const decision = evaluateRisk({ evidence: [], now });

    expect(decision.band).toBe("LOW");
    expect(decision.recommendedState).toBe("MONITORING");
    expect(decision.reasons).toContain("No evidence has been received yet.");
  });

  it("keeps a single weak signal in WATCH instead of escalating immediately", () => {
    const decision = evaluateRisk({
      now,
      evidence: [
        evidence({
          id: "audio-1",
          source: "audio",
          signal: "aggression",
          score: 0.45,
          observedAt: now,
        }),
      ],
    });

    expect(decision.band).toBe("WATCH");
    expect(decision.recommendedState).toBe("MONITORING");
  });

  it("escalates when independent sources corroborate each other", () => {
    const decision = evaluateRisk({
      now,
      evidence: [
        evidence({
          id: "audio-1",
          source: "audio",
          signal: "aggression",
          score: 0.78,
          observedAt: now,
        }),
        evidence({
          id: "vision-1",
          source: "vision",
          signal: "possible_physical_altercation",
          score: 0.73,
          observedAt: now,
        }),
      ],
    });

    expect(decision.band).toBe("HIGH");
    expect(decision.recommendedState).toBe("HIGH_RISK");
    expect(decision.reasons).toContain(
      "Independent evidence sources corroborated each other.",
    );
  });

  it("decays stale evidence instead of treating it as equally current", () => {
    const fresh = evaluateRisk({
      now,
      evidence: [
        evidence({
          id: "audio-fresh",
          source: "audio",
          signal: "aggression",
          score: 0.9,
          observedAt: now,
        }),
      ],
    });

    const stale = evaluateRisk({
      now,
      evidence: [
        evidence({
          id: "audio-stale",
          source: "audio",
          signal: "aggression",
          score: 0.9,
          observedAt: new Date("2026-10-04T16:59:30.000Z"),
        }),
      ],
    });

    expect(stale.score).toBeLessThan(fresh.score);
  });

  it("uses hysteresis to avoid flapping out of HIGH_RISK too easily", () => {
    const borderlineEvidence = [
      evidence({
        id: "audio-1",
        source: "audio",
        signal: "aggression",
        score: 0.8,
        observedAt: now,
      }),
    ];

    const fromMonitoring = evaluateRisk({
      now,
      evidence: borderlineEvidence,
      currentState: "MONITORING",
    });
    const fromHighRisk = evaluateRisk({
      now,
      evidence: borderlineEvidence,
      currentState: "HIGH_RISK",
    });

    expect(fromMonitoring.recommendedState).toBe("MONITORING");
    expect(fromHighRisk.recommendedState).toBe("HIGH_RISK");
    expect(fromHighRisk.reasons).toContain(
      "Hysteresis applied: existing HIGH_RISK incidents need stronger evidence to de-escalate.",
    );
  });
});
