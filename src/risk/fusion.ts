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
  usedInDecision: boolean;
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
    person_in_distress: 1.0,
    weapon_visible: 1.25,
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

  const calculated = input.evidence.map((item) => {
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
    };
  });

  // Repeated frames from one analyzer are correlated observations, not
  // independent votes. Keep all of them for traceability, but let only the
  // strongest current contribution from each source affect the aggregate risk.
  const strongestBySource = new Map<
    EvidenceSource,
    { evidenceId: string; weightedContribution: number }
  >();

  for (const item of calculated) {
    const current = strongestBySource.get(item.source);
    if (!current || item.weightedContribution > current.weightedContribution) {
      strongestBySource.set(item.source, {
        evidenceId: item.evidenceId,
        weightedContribution: item.weightedContribution,
      });
    }
  }

  const contributions: RiskContribution[] = calculated.map((item) => ({
    ...item,
    usedInDecision:
      strongestBySource.get(item.source)?.evidenceId === item.evidenceId,
  }));

  const activeContributions = contributions.filter((item) => item.usedInDecision);
  const rawScore = activeContributions.reduce(
    (total, item) => total + item.weightedContribution,
    0,
  );

  const corroboratingSources = new Set(
    activeContributions
      .filter(
        (item) =>
          item.score * item.freshness >= policy.corroborationThreshold,
      )
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
  if (input.evidence.length > activeContributions.length) {
    reasons.push(
      "Repeated evidence from the same source was retained for traceability but not double-counted.",
    );
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
