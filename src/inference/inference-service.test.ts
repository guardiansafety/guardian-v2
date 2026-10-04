import { describe, expect, it } from "vitest";

import type { Evidence } from "../domain/evidence";
import {
  runInferenceBatch,
  type AnalyzerTask,
} from "./inference-service";

const now = new Date("2026-10-04T17:00:00.000Z");

function validEvidence(input: {
  id: string;
  source: Evidence["source"];
  incidentId?: string;
  score?: number;
}): Evidence {
  return {
    id: input.id,
    incidentId: input.incidentId ?? "incident-1",
    source: input.source,
    signal:
      input.source === "vision"
        ? "possible_physical_altercation"
        : input.source === "device"
          ? "emergency_button_pressed"
          : "aggression",
    score: input.score ?? 0.8,
    observedAt: now,
    receivedAt: now,
    provenance: {
      kind:
        input.source === "vision"
          ? "llm"
          : input.source === "device"
            ? "device"
            : "classifier",
      provider: "guardian-test",
    },
  };
}

describe("runInferenceBatch", () => {
  it("combines valid evidence from independent analyzers", async () => {
    const tasks: AnalyzerTask[] = [
      {
        name: "audio-v1",
        source: "audio",
        run: async () => [validEvidence({ id: "audio-1", source: "audio" })],
      },
      {
        name: "vision-v1",
        source: "vision",
        run: async () => [validEvidence({ id: "vision-1", source: "vision" })],
      },
    ];

    const result = await runInferenceBatch({
      incidentId: "incident-1",
      tasks,
    });

    expect(result.evidence).toHaveLength(2);
    expect(result.failures).toEqual([]);
    expect(result.degraded).toBe(false);
    expect(result.allFailed).toBe(false);
  });

  it("keeps successful evidence when one analyzer throws", async () => {
    const result = await runInferenceBatch({
      incidentId: "incident-1",
      tasks: [
        {
          name: "audio-v1",
          source: "audio",
          run: async () => [validEvidence({ id: "audio-1", source: "audio" })],
        },
        {
          name: "vision-v1",
          source: "vision",
          run: async () => {
            throw new Error("provider unavailable");
          },
        },
      ],
    });

    expect(result.evidence).toHaveLength(1);
    expect(result.failures).toEqual([
      {
        name: "vision-v1",
        source: "vision",
        kind: "error",
        message: "provider unavailable",
      },
    ]);
    expect(result.degraded).toBe(true);
    expect(result.allFailed).toBe(false);
  });

  it("turns a slow analyzer into a timeout failure without rejecting the batch", async () => {
    const result = await runInferenceBatch({
      incidentId: "incident-1",
      defaultTimeoutMs: 5,
      tasks: [
        {
          name: "vision-slow",
          source: "vision",
          run: async () =>
            new Promise((resolve) => {
              setTimeout(
                () =>
                  resolve([
                    validEvidence({
                      id: "vision-1",
                      source: "vision",
                    }),
                  ]),
                50,
              );
            }),
        },
      ],
    });

    expect(result.evidence).toEqual([]);
    expect(result.failures[0]?.kind).toBe("timeout");
    expect(result.allFailed).toBe(true);
  });

  it("rejects malformed analyzer output at the runtime boundary", async () => {
    const result = await runInferenceBatch({
      incidentId: "incident-1",
      tasks: [
        {
          name: "vision-v1",
          source: "vision",
          run: async () => [
            {
              id: "vision-1",
              incidentId: "incident-1",
              source: "vision",
              signal: "possible_physical_altercation",
              score: 4.2,
            },
          ],
        },
      ],
    });

    expect(result.evidence).toEqual([]);
    expect(result.failures[0]?.kind).toBe("contract");
    expect(result.allFailed).toBe(true);
  });

  it("rejects evidence for the wrong incident", async () => {
    const result = await runInferenceBatch({
      incidentId: "incident-1",
      tasks: [
        {
          name: "audio-v1",
          source: "audio",
          run: async () => [
            validEvidence({
              id: "audio-1",
              source: "audio",
              incidentId: "incident-2",
            }),
          ],
        },
      ],
    });

    expect(result.evidence).toEqual([]);
    expect(result.failures[0]?.kind).toBe("contract");
  });

  it("rejects an analyzer that returns a different modality than it owns", async () => {
    const result = await runInferenceBatch({
      incidentId: "incident-1",
      tasks: [
        {
          name: "vision-v1",
          source: "vision",
          run: async () => [validEvidence({ id: "audio-1", source: "audio" })],
        },
      ],
    });

    expect(result.evidence).toEqual([]);
    expect(result.failures[0]?.kind).toBe("contract");
  });
});
