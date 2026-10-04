import { describe, expect, it } from "vitest";

import { parseEvidence } from "./evidence";

describe("Evidence", () => {
  it("accepts normalized model evidence with provenance", () => {
    const evidence = parseEvidence({
      id: "evidence-1",
      incidentId: "incident-1",
      source: "vision",
      signal: "possible_physical_altercation",
      score: 0.82,
      observedAt: "2026-10-04T17:00:00.000Z",
      receivedAt: "2026-10-04T17:00:00.400Z",
      provenance: {
        kind: "llm",
        provider: "google",
        model: "gemini",
        promptVersion: "vision-v1",
      },
    });

    expect(evidence.score).toBe(0.82);
    expect(evidence.observedAt).toBeInstanceOf(Date);
    expect(evidence.provenance.promptVersion).toBe("vision-v1");
  });

  it("rejects scores outside the normalized 0..1 range", () => {
    expect(() =>
      parseEvidence({
        id: "evidence-1",
        incidentId: "incident-1",
        source: "audio",
        signal: "aggression",
        score: 1.4,
        observedAt: new Date(),
        receivedAt: new Date(),
        provenance: {
          kind: "classifier",
          provider: "guardian",
          model: "audio-cnn",
        },
      }),
    ).toThrow();
  });
});
