import type { Evidence } from "../domain/evidence";
import {
  type Incident,
  transitionIncident,
} from "../domain/incident";
import { evaluateRisk, type RiskDecision } from "../risk/fusion";

const RISK_ENGINE = { type: "system", id: "risk-engine" } as const;

export interface IncidentAssessment {
  incident: Incident;
  evidence: readonly Evidence[];
  decision: RiskDecision;
  duplicate: boolean;
  stateChanged: boolean;
}

export class EvidenceIncidentMismatchError extends Error {
  constructor(evidenceIncidentId: string, incidentId: string) {
    super(
      `Evidence belongs to incident ${evidenceIncidentId}, not incident ${incidentId}`,
    );
    this.name = "EvidenceIncidentMismatchError";
  }
}

export class EvidenceIdConflictError extends Error {
  constructor(evidenceId: string) {
    super(`Evidence ID ${evidenceId} was reused with a different payload`);
    this.name = "EvidenceIdConflictError";
  }
}

/**
 * Accept one normalized piece of evidence and deterministically recompute the
 * incident's risk. Persistence is deliberately outside this function so the
 * same decision path can be replayed in tests and evaluation harnesses.
 */
export function assessIncidentWithEvidence(input: {
  incident: Incident;
  evidenceHistory: readonly Evidence[];
  newEvidence: Evidence;
  now: Date;
}): IncidentAssessment {
  if (input.newEvidence.incidentId !== input.incident.id) {
    throw new EvidenceIncidentMismatchError(
      input.newEvidence.incidentId,
      input.incident.id,
    );
  }

  const existing = input.evidenceHistory.find(
    (item) => item.id === input.newEvidence.id,
  );

  if (existing) {
    if (!sameEvidence(existing, input.newEvidence)) {
      throw new EvidenceIdConflictError(input.newEvidence.id);
    }

    return {
      incident: input.incident,
      evidence: input.evidenceHistory,
      decision: evaluateRisk({
        evidence: input.evidenceHistory,
        now: input.now,
        currentState: input.incident.state,
      }),
      duplicate: true,
      stateChanged: false,
    };
  }

  const evidence = [...input.evidenceHistory, input.newEvidence];
  let incident = input.incident;
  let stateChanged = false;

  // CREATED means the incident exists but has not yet entered evidence review.
  // The first accepted observation always opens that review step before any
  // risk-based escalation is allowed.
  if (incident.state === "CREATED") {
    incident = transitionIncident(incident, {
      to: "MONITORING",
      at: input.now,
      actor: RISK_ENGINE,
      reason: "First evidence accepted for review.",
    });
    stateChanged = true;
  }

  const decision = evaluateRisk({
    evidence,
    now: input.now,
    currentState: incident.state,
  });

  // Automated risk assessment owns only the reversible MONITORING/HIGH_RISK
  // portion of the lifecycle. Once an alert has been sent or a human has acted,
  // evidence can still be recorded but cannot silently rewrite that state.
  const riskManagedState =
    incident.state === "MONITORING" || incident.state === "HIGH_RISK";

  if (riskManagedState && decision.recommendedState !== incident.state) {
    incident = transitionIncident(incident, {
      to: decision.recommendedState,
      at: input.now,
      actor: RISK_ENGINE,
      reason: riskTransitionReason(decision),
    });
    stateChanged = true;
  }

  return {
    incident,
    evidence,
    decision,
    duplicate: false,
    stateChanged,
  };
}

function riskTransitionReason(decision: RiskDecision): string {
  const roundedScore = decision.score.toFixed(3);
  return `Risk engine recommended ${decision.recommendedState} at score ${roundedScore}: ${decision.reasons.join(" ")}`;
}

function sameEvidence(left: Evidence, right: Evidence): boolean {
  return (
    left.id === right.id &&
    left.incidentId === right.incidentId &&
    left.source === right.source &&
    left.signal === right.signal &&
    left.score === right.score &&
    left.observedAt.getTime() === right.observedAt.getTime() &&
    left.receivedAt.getTime() === right.receivedAt.getTime() &&
    JSON.stringify(left.provenance) === JSON.stringify(right.provenance)
  );
}
