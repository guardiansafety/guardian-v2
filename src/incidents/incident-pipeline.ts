import type { Evidence } from "../domain/evidence";
import type { Incident } from "../domain/incident";
import {
  runInferenceBatch,
  type AnalyzerTask,
  type InferenceBatchResult,
} from "../inference/inference-service";
import type { RiskDecision } from "../risk/fusion";
import {
  assessIncidentWithEvidence,
  type IncidentAssessment,
} from "./incident-service";

export interface IncidentPipelineResult {
  incident: Incident;
  evidence: readonly Evidence[];
  inference: InferenceBatchResult;
  assessments: readonly IncidentAssessment[];
  processedEvidenceIds: readonly string[];
  latestDecision: RiskDecision | null;
}

/**
 * Run one inference cycle and apply every valid observation through the same
 * deterministic incident decision path.
 *
 * Analyzer calls can finish in any order. Product state cannot depend on that
 * scheduling accident, so evidence is processed in a canonical received-time
 * order with stable tie-breakers.
 */
export async function evaluateIncidentFromAnalyzers(input: {
  incident: Incident;
  evidenceHistory: readonly Evidence[];
  tasks: readonly AnalyzerTask[];
  now: Date;
  defaultTimeoutMs?: number;
}): Promise<IncidentPipelineResult> {
  const inference = await runInferenceBatch({
    incidentId: input.incident.id,
    tasks: input.tasks,
    defaultTimeoutMs: input.defaultTimeoutMs,
  });

  // If every analyzer fails, missing evidence is not negative evidence.
  // Preserve the incident exactly as-is rather than silently de-escalating.
  if (inference.evidence.length === 0) {
    return {
      incident: input.incident,
      evidence: input.evidenceHistory,
      inference,
      assessments: [],
      processedEvidenceIds: [],
      latestDecision: null,
    };
  }

  const orderedEvidence = [...inference.evidence].sort(compareEvidence);
  const assessments: IncidentAssessment[] = [];

  let incident = input.incident;
  let evidenceHistory = [...input.evidenceHistory];

  for (const item of orderedEvidence) {
    const assessment = assessIncidentWithEvidence({
      incident,
      evidenceHistory,
      newEvidence: item,
      now: input.now,
    });

    incident = assessment.incident;
    evidenceHistory = [...assessment.evidence];
    assessments.push(assessment);
  }

  return {
    incident,
    evidence: evidenceHistory,
    inference,
    assessments,
    processedEvidenceIds: orderedEvidence.map((item) => item.id),
    latestDecision: assessments.at(-1)?.decision ?? null,
  };
}

function compareEvidence(left: Evidence, right: Evidence): number {
  const receivedDifference =
    left.receivedAt.getTime() - right.receivedAt.getTime();
  if (receivedDifference !== 0) {
    return receivedDifference;
  }

  const observedDifference =
    left.observedAt.getTime() - right.observedAt.getTime();
  if (observedDifference !== 0) {
    return observedDifference;
  }

  const sourceDifference = left.source.localeCompare(right.source);
  if (sourceDifference !== 0) {
    return sourceDifference;
  }

  return left.id.localeCompare(right.id);
}
