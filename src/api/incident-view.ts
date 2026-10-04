import type { Evidence } from "../domain/evidence";
import type { Incident } from "../domain/incident";
import type { AnalyzerFailure } from "../inference/inference-service";
import type { RiskDecision } from "../risk/fusion";

export interface IncidentConsoleView {
  incident: {
    id: string;
    state: Incident["state"];
    updatedAt: string;
  };
  risk: {
    score: number;
    band: RiskDecision["band"];
    reasons: readonly string[];
  } | null;
  evidence: readonly {
    id: string;
    source: Evidence["source"];
    signal: string;
    score: number;
    observedAt: string;
    receivedAt: string;
    usedInDecision: boolean;
    provenance: Evidence["provenance"];
  }[];
  inference: {
    degraded: boolean;
    failures: readonly AnalyzerFailure[];
  };
  timeline: readonly {
    from: Incident["state"];
    to: Incident["state"];
    at: string;
    actor: string;
    reason: string;
  }[];
}

export function buildIncidentConsoleView(input: {
  incident: Incident;
  evidence: readonly Evidence[];
  decision: RiskDecision | null;
  degraded: boolean;
  failures: readonly AnalyzerFailure[];
}): IncidentConsoleView {
  const usedEvidenceIds = new Set(
    input.decision?.contributions
      .filter((item) => item.usedInDecision)
      .map((item) => item.evidenceId) ?? [],
  );

  return {
    incident: {
      id: input.incident.id,
      state: input.incident.state,
      updatedAt: input.incident.updatedAt.toISOString(),
    },
    risk: input.decision
      ? {
          score: input.decision.score,
          band: input.decision.band,
          reasons: input.decision.reasons,
        }
      : null,
    evidence: [...input.evidence]
      .sort((left, right) => right.receivedAt.getTime() - left.receivedAt.getTime())
      .map((item) => ({
        id: item.id,
        source: item.source,
        signal: item.signal,
        score: item.score,
        observedAt: item.observedAt.toISOString(),
        receivedAt: item.receivedAt.toISOString(),
        usedInDecision: usedEvidenceIds.has(item.id),
        provenance: item.provenance,
      })),
    inference: {
      degraded: input.degraded,
      failures: input.failures,
    },
    timeline: input.incident.transitions.map((transition) => ({
      from: transition.from,
      to: transition.to,
      at: transition.at.toISOString(),
      actor: `${transition.actor.type}:${transition.actor.id}`,
      reason: transition.reason,
    })),
  };
}
