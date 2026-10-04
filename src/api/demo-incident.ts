import type { Evidence } from "../domain/evidence";
import { createIncident } from "../domain/incident";
import type { AnalyzerTask } from "../inference/inference-service";
import { evaluateIncidentFromAnalyzers } from "../incidents/incident-pipeline";
import {
  buildIncidentConsoleView,
  type IncidentConsoleView,
} from "./incident-view";

const createdAt = new Date("2026-10-04T18:00:00.000Z");
const now = new Date("2026-10-04T18:00:03.000Z");

export async function buildDemoIncidentView(): Promise<IncidentConsoleView> {
  const result = await evaluateIncidentFromAnalyzers({
    incident: createIncident({ id: "demo-incident-001", at: createdAt }),
    evidenceHistory: [],
    now,
    tasks: demoAnalyzers(),
  });

  return buildIncidentConsoleView({
    incident: result.incident,
    evidence: result.evidence,
    decision: result.latestDecision,
    degraded: result.inference.degraded,
    failures: result.inference.failures,
  });
}

function demoAnalyzers(): AnalyzerTask[] {
  return [
    {
      name: "audio-aggression-v1",
      source: "audio",
      run: async () => [
        evidence({
          id: "audio-demo-001",
          source: "audio",
          signal: "aggression",
          score: 0.78,
          observedAt: new Date("2026-10-04T18:00:01.000Z"),
          receivedAt: new Date("2026-10-04T18:00:01.120Z"),
          provenance: {
            kind: "classifier",
            provider: "guardian",
            model: "audio-aggression",
            modelVersion: "v1",
          },
        }),
      ],
    },
    {
      name: "vision-context-v1",
      source: "vision",
      run: async () => [
        evidence({
          id: "vision-demo-001",
          source: "vision",
          signal: "possible_physical_altercation",
          score: 0.73,
          observedAt: new Date("2026-10-04T18:00:01.250Z"),
          receivedAt: new Date("2026-10-04T18:00:01.640Z"),
          provenance: {
            kind: "llm",
            provider: "google",
            model: "gemini",
            modelVersion: "demo",
            promptVersion: "vision-v1",
          },
        }),
      ],
    },
    {
      name: "device-telemetry-v1",
      source: "device",
      run: async () => {
        throw new Error("device telemetry unavailable");
      },
    },
  ];
}

function evidence(
  input: Omit<Evidence, "incidentId">,
): Evidence {
  return {
    ...input,
    incidentId: "demo-incident-001",
  };
}
