import type { Evidence, EvidenceSource } from "../domain/evidence";
import type { IncidentState } from "../domain/incident";
import type { RiskBand } from "../risk/fusion";

export type ScenarioAnalyzerOutcome =
  | {
      type: "evidence";
      items: readonly Evidence[];
    }
  | {
      type: "error";
      message: string;
    };

export interface ScenarioAnalyzer {
  name: string;
  source: EvidenceSource;
  outcome: ScenarioAnalyzerOutcome;
}

export interface ReplayScenario {
  id: string;
  description: string;
  incidentId: string;
  createdAt: Date;
  now: Date;
  analyzers: readonly ScenarioAnalyzer[];
  expected: {
    state: IncidentState;
    degraded: boolean;
    evidenceCount: number;
    riskBand: RiskBand | null;
  };
}
