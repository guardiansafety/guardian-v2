import type { Evidence, EvidenceSource } from "../domain/evidence";
import type { IncidentState } from "../domain/incident";

export type RiskBand = "LOW" | "WATCH" | "HIGH";

export interface RiskContribution {
  evidenceId: string;
  source: EvidenceSource;
  signal: string;
  score: number;
  freshness: number;
  weightedContribution: number;
}

export interface RiskDecision {
  score: number;
  band: RiskBand;
  recommendedState: Extract<IncidentState, "MONITORING" | "HIGH_RISK">;
  contributions: readonly RiskContribution[];
  reasons: readonly string[];
}

export interface RiskPolicy {
  sourceWeights: Record<EvidenceSource, number>;
  signalWeights: Record<string, number>;
  halfLifeSeconds: number;
  corroborationThreshold: number;
  corroborationBonus: number;
  highRiskEnterThreshold: number;
  highRiskExitThreshold: number;
}

const DEFAULT_POLICY: RiskPolicy = {
  sourceWeights: {
    audio: 0.9,
    vision: 1.0,
    device: 1.15,
  },
  signalWeights: {
    aggression: 1.0,
    possible_physical_altercation: 1.1,
    emergency_button_pressed: 1.2,
  },
  halfLifeSeconds: 30,
  corroborationThreshold: 0.55,
  corroborationBonus: 0.25,
  highRiskEnterThreshold: 1.25,
  highRiskExitThreshold: 0.85,
};

export function evaluateRisk(input: {
  evidence: readonly Evidence[];
  now: Date;
  currentState?: IncidentState;
  policy?: Partial<RiskPolicy>;
}): RiskDecision {
  const policy = mergePolicy(input.policy);

  const contributions = input.evidence.map((item) => {
    const ageSeconds = Math.max(
      0,
      (input.now.getTime() - item.observedAt.getTime()) / 1000,
    );
    const freshness = Math.pow(0.5, ageSeconds / policy.halfLifeSeconds);
    const signalWeight = policy.signalWeights[item.signal] ?? 1;
    const weightedContribution =
      policy.sourceWeights[item.source] * item.score * freshness * signalWeight;

    return {
      evidenceId: item.id,
      source: item.source,
      signal: item.signal,
      score: item.score,
      freshness,
      weightedContribution,
    } satisfies RiskContribution;
  });

  const rawScore = contributions.reduce(
    (total, item) => total + item.weightedContribution,
    0,
  );
  const corroboratingSources = new Set(
    input.evidence
      .filter((item) => item.score >= policy.corroborationThreshold)
      .map((item) => item.source),
  );
  const corroborationApplied = corroboratingSources.size >= 2;
  const score = rawScore + (corroborationApplied ? policy.corroborationBonus : 0);

  const currentlyHighRisk = input.currentState === "HIGH_RISK";
  const highRiskThreshold = currentlyHighRisk
    ? policy.highRiskExitThreshold
    : policy.highRiskEnterThreshold;
  const isHighRisk = score >= highRiskThreshold;

  const reasons: string[] = [];
  if (input.evidence.length === 0) {
    reasons.push("No evidence has been received yet.");
  }
  if (corroborationApplied) {
    reasons.push("Independent evidence sources corroborated each other.");
  }
  if (currentlyHighRisk) {
    reasons.push(
      "Hysteresis applied: existing HIGH_RISK incidents need stronger evidence to de-escalate.",
    );
  }
  if (isHighRisk) {
    reasons.push("Risk score crossed the high-risk threshold.");
  } else {
    reasons.push("Risk score remains below the high-risk threshold.");
  }

  return {
    score,
    band: isHighRisk ? "HIGH" : input.evidence.length > 0 ? "WATCH" : "LOW",
    recommendedState: isHighRisk ? "HIGH_RISK" : "MONITORING",
    contributions,
    reasons,
  };
}

function mergePolicy(overrides: Partial<RiskPolicy> | undefined): RiskPolicy {
  return {
    ...DEFAULT_POLICY,
    ...overrides,
    sourceWeights: {
      ...DEFAULT_POLICY.sourceWeights,
      ...overrides?.sourceWeights,
    },
    signalWeights: {
      ...DEFAULT_POLICY.signalWeights,
      ...overrides?.signalWeights,
    },
  };
}
