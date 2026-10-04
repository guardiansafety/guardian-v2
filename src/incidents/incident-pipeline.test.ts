import { describe, expect, it } from "vitest";

import type { Evidence } from "../domain/evidence";
import { createIncident, transitionIncident } from "../domain/incident";
import type { AnalyzerTask } from "../inference/inference-service";
import { evaluateIncidentFromAnalyzers } from "./incident-pipeline";

const createdAt = new Date("2026-10-04T17:00:00.000Z");
const now = new Date("2026-10-04T17:00:03.000Z");

function evidence(input: {
  id: string;
  source: Evidence["source"];
  signal: string;
  score: number;
  observedAt?: Date;
  receivedAt?: Date;
}): Evidence {
  const observedAt =
    input.observedAt ?? new Date("2026-10-04T17:00:01.000Z");

  return {
    id: input.id,
    incidentId: "incident-1",
    source: input.source,
    signal: input.signal,
    score: input.score,
    observedAt,
    receivedAt: input.receivedAt ?? observedAt,
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

describe("evaluateIncidentFromAnalyzers", () => {
  it("runs a full evidence-to-state cycle and escalates on independent corroboration", async () => {
    const result = await evaluateIncidentFromAnalyzers({
      incident: createIncident({ id: "incident-1", at: createdAt }),
      evidenceHistory: [],
      now,
      tasks: [
        {
          name: "audio-v1",
          source: "audio",
          run: async () => [
            evidence({
              id: "audio-1",
              source: "audio",
              signal: "aggression",
              score: 0.78,
            }),
          ],
        },
        {
          name: "vision-v1",
          source: "vision",
          run: async () => [
            evidence({
              id: "vision-1",
              source: "vision",
              signal: "possible_physical_altercation",
              score: 0.73,
              receivedAt: new Date("2026-10-04T17:00:01.400Z"),
            }),
          ],
        },
      ],
    });

    expect(result.incident.state).toBe("HIGH_RISK");
    expect(result.incident.transitions.map((item) => item.to)).toEqual([
      "MONITORING",
      "HIGH_RISK",
    ]);
    expect(result.evidence).toHaveLength(2);
    expect(result.latestDecision?.band).toBe("HIGH");
    expect(result.inference.degraded).toBe(false);
  });

  it("continues with available evidence when one analyzer fails", async () => {
    const result = await evaluateIncidentFromAnalyzers({
      incident: createIncident({ id: "incident-1", at: createdAt }),
      evidenceHistory: [],
      now,
      tasks: [
        {
          name: "audio-v1",
          source: "audio",
          run: async () => [
            evidence({
              id: "audio-1",
              source: "audio",
              signal: "aggression",
              score: 0.4,
            }),
          ],
        },
        {
          name: "vision-v1",
          source: "vision",
          run: async () => {
            throw new Error("vision provider unavailable");
          },
        },
      ],
    });

    expect(result.incident.state).toBe("MONITORING");
    expect(result.evidence).toHaveLength(1);
    expect(result.inference.degraded).toBe(true);
    expect(result.inference.allFailed).toBe(false);
    expect(result.inference.failures[0]?.source).toBe("vision");
  });

  it("does not change product state when every analyzer fails", async () => {
    const incident = createIncident({ id: "incident-1", at: createdAt });

    const result = await evaluateIncidentFromAnalyzers({
      incident,
      evidenceHistory: [],
      now,
      tasks: [
        {
          name: "audio-v1",
          source: "audio",
          run: async () => {
            throw new Error("audio unavailable");
          },
        },
        {
          name: "vision-v1",
          source: "vision",
          run: async () => {
            throw new Error("vision unavailable");
          },
        },
      ],
    });

    expect(result.incident).toBe(incident);
    expect(result.incident.state).toBe("CREATED");
    expect(result.inference.allFailed).toBe(true);
    expect(result.assessments).toEqual([]);
    expect(result.latestDecision).toBeNull();
  });

  it("uses received-time ordering instead of analyzer list order", async () => {
    const result = await evaluateIncidentFromAnalyzers({
      incident: createIncident({ id: "incident-1", at: createdAt }),
      evidenceHistory: [],
      now,
      tasks: [
        {
          // Intentionally listed first even though its evidence arrived later.
          name: "vision-v1",
          source: "vision",
          run: async () => [
            evidence({
              id: "vision-later",
              source: "vision",
              signal: "possible_physical_altercation",
              score: 0.73,
              receivedAt: new Date("2026-10-04T17:00:02.000Z"),
            }),
          ],
        },
        {
          name: "audio-v1",
          source: "audio",
          run: async () => [
            evidence({
              id: "audio-earlier",
              source: "audio",
              signal: "aggression",
              score: 0.78,
              receivedAt: new Date("2026-10-04T17:00:01.000Z"),
            }),
          ],
        },
      ],
    });

    expect(result.processedEvidenceIds).toEqual([
      "audio-earlier",
      "vision-later",
    ]);
    expect(result.incident.state).toBe("HIGH_RISK");
  });

  it("preserves safe retry behavior when an analyzer replays known evidence", async () => {
    const known = evidence({
      id: "audio-1",
      source: "audio",
      signal: "aggression",
      score: 0.5,
    });

    const monitoringIncident = transitionIncident(
      createIncident({ id: "incident-1", at: createdAt }),
      {
        to: "MONITORING",
        at: new Date("2026-10-04T17:00:01.000Z"),
        actor: { type: "system", id: "risk-engine" },
        reason: "Known evidence had already started review.",
      },
    );

    const result = await evaluateIncidentFromAnalyzers({
      incident: monitoringIncident,
      evidenceHistory: [known],
      now,
      tasks: [
        {
          name: "audio-v1",
          source: "audio",
          run: async () => [known],
        },
      ],
    });

    expect(result.evidence).toHaveLength(1);
    expect(result.assessments[0]?.duplicate).toBe(true);
  });
});
