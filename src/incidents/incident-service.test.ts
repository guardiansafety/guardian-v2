import { describe, expect, it } from "vitest";

import type { Evidence } from "../domain/evidence";
import {
  createIncident,
  transitionIncident,
} from "../domain/incident";
import {
  assessIncidentWithEvidence,
  EvidenceIdConflictError,
  EvidenceIncidentMismatchError,
} from "./incident-service";

const t0 = new Date("2026-10-04T17:00:00.000Z");
const t1 = new Date("2026-10-04T17:00:01.000Z");

function evidence(input: {
  id: string;
  source: Evidence["source"];
  signal: string;
  score: number;
  incidentId?: string;
  observedAt?: Date;
}): Evidence {
  const observedAt = input.observedAt ?? t1;

  return {
    id: input.id,
    incidentId: input.incidentId ?? "incident-1",
    source: input.source,
    signal: input.signal,
    score: input.score,
    observedAt,
    receivedAt: observedAt,
    provenance: {
      kind: input.source === "device" ? "device" : "classifier",
      provider: "guardian-test",
    },
  };
}

describe("assessIncidentWithEvidence", () => {
  it("moves a new incident into MONITORING when its first weak signal arrives", () => {
    const incident = createIncident({ id: "incident-1", at: t0 });

    const result = assessIncidentWithEvidence({
      incident,
      evidenceHistory: [],
      newEvidence: evidence({
        id: "audio-1",
        source: "audio",
        signal: "aggression",
        score: 0.35,
      }),
      now: t1,
    });

    expect(result.incident.state).toBe("MONITORING");
    expect(result.incident.transitions).toHaveLength(1);
    expect(result.decision.band).toBe("WATCH");
    expect(result.stateChanged).toBe(true);
  });

  it("escalates after a second independent source corroborates the first", () => {
    const incident = transitionIncident(
      createIncident({ id: "incident-1", at: t0 }),
      {
        to: "MONITORING",
        at: t1,
        actor: { type: "system", id: "risk-engine" },
        reason: "First evidence accepted for review.",
      },
    );
    const audio = evidence({
      id: "audio-1",
      source: "audio",
      signal: "aggression",
      score: 0.78,
    });

    const result = assessIncidentWithEvidence({
      incident,
      evidenceHistory: [audio],
      newEvidence: evidence({
        id: "vision-1",
        source: "vision",
        signal: "possible_physical_altercation",
        score: 0.73,
      }),
      now: new Date("2026-10-04T17:00:02.000Z"),
    });

    expect(result.incident.state).toBe("HIGH_RISK");
    expect(result.decision.reasons).toContain(
      "Independent evidence sources corroborated each other.",
    );
  });

  it("treats an exact replay as idempotent instead of double-counting it", () => {
    const incident = transitionIncident(
      createIncident({ id: "incident-1", at: t0 }),
      {
        to: "MONITORING",
        at: t1,
        actor: { type: "system", id: "risk-engine" },
        reason: "First evidence accepted for review.",
      },
    );
    const audio = evidence({
      id: "audio-1",
      source: "audio",
      signal: "aggression",
      score: 0.7,
    });

    const result = assessIncidentWithEvidence({
      incident,
      evidenceHistory: [audio],
      newEvidence: audio,
      now: new Date("2026-10-04T17:00:02.000Z"),
    });

    expect(result.duplicate).toBe(true);
    expect(result.evidence).toHaveLength(1);
    expect(result.incident.transitions).toHaveLength(1);
    expect(result.stateChanged).toBe(false);
  });

  it("rejects reuse of an evidence ID with a different payload", () => {
    const incident = transitionIncident(
      createIncident({ id: "incident-1", at: t0 }),
      {
        to: "MONITORING",
        at: t1,
        actor: { type: "system", id: "risk-engine" },
        reason: "First evidence accepted for review.",
      },
    );
    const original = evidence({
      id: "audio-1",
      source: "audio",
      signal: "aggression",
      score: 0.4,
    });

    expect(() =>
      assessIncidentWithEvidence({
        incident,
        evidenceHistory: [original],
        newEvidence: { ...original, score: 0.9 },
        now: new Date("2026-10-04T17:00:02.000Z"),
      }),
    ).toThrow(EvidenceIdConflictError);
  });

  it("rejects evidence addressed to a different incident", () => {
    const incident = createIncident({ id: "incident-1", at: t0 });

    expect(() =>
      assessIncidentWithEvidence({
        incident,
        evidenceHistory: [],
        newEvidence: evidence({
          id: "audio-1",
          incidentId: "incident-2",
          source: "audio",
          signal: "aggression",
          score: 0.8,
        }),
        now: t1,
      }),
    ).toThrow(EvidenceIncidentMismatchError);
  });

  it("does not let later model evidence silently rewrite an ALERTED incident", () => {
    let incident = createIncident({ id: "incident-1", at: t0 });
    incident = transitionIncident(incident, {
      to: "MONITORING",
      at: new Date("2026-10-04T17:00:01.000Z"),
      actor: { type: "system", id: "risk-engine" },
      reason: "Evidence review started.",
    });
    incident = transitionIncident(incident, {
      to: "HIGH_RISK",
      at: new Date("2026-10-04T17:00:02.000Z"),
      actor: { type: "system", id: "risk-engine" },
      reason: "Risk crossed threshold.",
    });
    incident = transitionIncident(incident, {
      to: "ALERTED",
      at: new Date("2026-10-04T17:00:03.000Z"),
      actor: { type: "system", id: "notification-worker" },
      reason: "Alert delivery accepted.",
    });

    const result = assessIncidentWithEvidence({
      incident,
      evidenceHistory: [],
      newEvidence: evidence({
        id: "audio-low",
        source: "audio",
        signal: "aggression",
        score: 0.1,
      }),
      now: new Date("2026-10-04T17:00:04.000Z"),
    });

    expect(result.incident.state).toBe("ALERTED");
    expect(result.stateChanged).toBe(false);
    expect(result.evidence).toHaveLength(1);
  });
});
