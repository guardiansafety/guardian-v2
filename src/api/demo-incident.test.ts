import { describe, expect, it } from "vitest";

import { buildDemoIncidentView } from "./demo-incident";

describe("buildDemoIncidentView", () => {
  it("shows a high-risk incident even when one analyzer fails", async () => {
    const view = await buildDemoIncidentView();

    expect(view.incident.state).toBe("HIGH_RISK");
    expect(view.risk?.band).toBe("HIGH");
    expect(view.evidence).toHaveLength(2);

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
