import { describe, expect, it } from "vitest";

import {
  buildDemoIncidentView,
  DemoIncidentSession,
} from "./demo-incident";

describe("Guardian incident operations demo", () => {
  it("starts with high-risk evidence already committed to a durable alert workflow", async () => {
    const view = await buildDemoIncidentView();

    expect(view.incident.state).toBe("ALERTED");
    expect(view.risk?.band).toBe("HIGH");
    expect(view.evidence).toHaveLength(2);
    expect(view.alertDelivery?.status).toBe("PENDING");
    expect(view.alertDelivery?.attempts).toBe(0);
    expect(view.actions.canDeliver).toBe(true);

    expect(view.inference.degraded).toBe(true);
    expect(view.inference.failures).toEqual([
      {
        name: "device-telemetry-v1",
        source: "device",
        kind: "error",
        message: "device telemetry unavailable",
      },
    ]);

    expect(view.risk?.reasons).toContain(
      "Independent evidence sources corroborated each other.",
    );
    expect(view.evidence.every((item) => item.usedInDecision)).toBe(true);
    expect(view.timeline.map((item) => item.to)).toEqual([
      "MONITORING",
      "HIGH_RISK",
      "ALERTED",
    ]);
  });

  it("runs delivery, acknowledgement, and resolution through the real state machine", async () => {
    const session = new DemoIncidentSession();

    const delivered = await session.act("deliver");
    expect(delivered.alertDelivery?.status).toBe("SENT");
    expect(delivered.alertDelivery?.attempts).toBe(1);
    expect(delivered.actions.canAcknowledge).toBe(true);

    const acknowledged = await session.act("acknowledge");
    expect(acknowledged.incident.state).toBe("ACKED");
    expect(acknowledged.actions.canResolve).toBe(true);

    const resolved = await session.act("resolve");
    expect(resolved.incident.state).toBe("RESOLVED");
    expect(resolved.timeline.map((item) => item.to)).toEqual([
      "MONITORING",
      "HIGH_RISK",
      "ALERTED",
      "ACKED",
      "RESOLVED",
    ]);
  });

  it("exposes AI provenance instead of hiding the model boundary", async () => {
    const view = await buildDemoIncidentView();
    const vision = view.evidence.find((item) => item.source === "vision");

    expect(vision?.provenance.kind).toBe("llm");
    expect(vision?.provenance.provider).toBe("google");
    expect(vision?.provenance.promptVersion).toBe("vision-v1");
  });
});
