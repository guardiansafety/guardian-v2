import { describe, expect, it } from "vitest";

import {
  InvalidIncidentTransitionError,
  createIncident,
  transitionIncident,
} from "./incident";

const t0 = new Date("2026-10-04T17:00:00.000Z");
const t1 = new Date("2026-10-04T17:00:01.000Z");

const riskEngine = { type: "system", id: "risk-engine" } as const;

describe("incident lifecycle", () => {
  it("starts every incident in CREATED", () => {
    const incident = createIncident({ id: "incident-1", at: t0 });

    expect(incident.state).toBe("CREATED");
    expect(incident.transitions).toEqual([]);
  });

  it("requires evidence review before an incident can become ALERTED", () => {
    const incident = createIncident({ id: "incident-1", at: t0 });

    expect(() =>
      transitionIncident(incident, {
        to: "ALERTED",
        at: t1,
        actor: riskEngine,
        reason: "skip straight to alert",
      }),
    ).toThrow(InvalidIncidentTransitionError);
  });

  it("records why and by whom a legal transition happened", () => {
    const incident = createIncident({ id: "incident-1", at: t0 });

    const monitoring = transitionIncident(incident, {
      to: "MONITORING",
      at: t1,
      actor: riskEngine,
      reason: "first evidence received",
    });

    expect(monitoring.state).toBe("MONITORING");
    expect(monitoring.transitions).toEqual([
      {
        from: "CREATED",
        to: "MONITORING",
        at: t1,
        actor: riskEngine,
        reason: "first evidence received",
      },
    ]);
  });

  it("allows HIGH_RISK incidents to de-escalate before an alert is sent", () => {
    const created = createIncident({ id: "incident-1", at: t0 });
    const monitoring = transitionIncident(created, {
      to: "MONITORING",
      at: new Date("2026-10-04T17:00:01.000Z"),
      actor: riskEngine,
      reason: "evidence review started",
    });
    const highRisk = transitionIncident(monitoring, {
      to: "HIGH_RISK",
      at: new Date("2026-10-04T17:00:02.000Z"),
      actor: riskEngine,
      reason: "corroborating signals crossed the high-risk threshold",
    });

    const deEscalated = transitionIncident(highRisk, {
      to: "MONITORING",
      at: new Date("2026-10-04T17:00:03.000Z"),
      actor: riskEngine,
      reason: "new evidence reduced the risk score below the exit threshold",
    });

    expect(deEscalated.state).toBe("MONITORING");
  });

  it("treats RESOLVED as terminal", () => {
    const created = createIncident({ id: "incident-1", at: t0 });
    const monitoring = transitionIncident(created, {
      to: "MONITORING",
      at: new Date("2026-10-04T17:00:01.000Z"),
      actor: riskEngine,
      reason: "evidence review started",
    });
    const resolved = transitionIncident(monitoring, {
      to: "RESOLVED",
      at: new Date("2026-10-04T17:00:02.000Z"),
      actor: { type: "human", id: "guardian-42" },
      reason: "incident dismissed after review",
    });

    expect(() =>
      transitionIncident(resolved, {
        to: "MONITORING",
        at: new Date("2026-10-04T17:00:03.000Z"),
        actor: riskEngine,
        reason: "late evidence arrived",
      }),
    ).toThrow(InvalidIncidentTransitionError);
  });
});
