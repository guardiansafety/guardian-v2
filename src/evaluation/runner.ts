import { performance } from "node:perf_hooks";

import { createIncident } from "../domain/incident";
import type { AnalyzerTask } from "../inference/inference-service";
import { evaluateIncidentFromAnalyzers } from "../incidents/incident-pipeline";
import type { ReplayScenario, ScenarioAnalyzer } from "./scenario";

export interface ScenarioResult {
  id: string;
  description: string;
  passed: boolean;
  failures: readonly string[];
  actual: {
    state: string;
    degraded: boolean;
    evidenceCount: number;
    riskBand: string | null;
  };
  durationMs: number;
}

export interface ScenarioSuiteResult {
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  results: readonly ScenarioResult[];
}

export async function runReplayScenario(
  scenario: ReplayScenario,
): Promise<ScenarioResult> {
  const startedAt = performance.now();

  const result = await evaluateIncidentFromAnalyzers({
    incident: createIncident({
      id: scenario.incidentId,
      at: scenario.createdAt,
    }),
    evidenceHistory: [],
    tasks: scenario.analyzers.map(toTask),
    now: scenario.now,
  });

  const actual = {
    state: result.incident.state,
    degraded: result.inference.degraded,
    evidenceCount: result.evidence.length,
    riskBand: result.latestDecision?.band ?? null,
  };

  const failures: string[] = [];

  if (actual.state !== scenario.expected.state) {
    failures.push(
      `state: expected ${scenario.expected.state}, got ${actual.state}`,
    );
  }

  if (actual.degraded !== scenario.expected.degraded) {
    failures.push(
      `degraded: expected ${scenario.expected.degraded}, got ${actual.degraded}`,
    );
  }

  if (actual.evidenceCount !== scenario.expected.evidenceCount) {
    failures.push(
      `evidenceCount: expected ${scenario.expected.evidenceCount}, got ${actual.evidenceCount}`,
    );
  }

  if (actual.riskBand !== scenario.expected.riskBand) {
    failures.push(
      `riskBand: expected ${scenario.expected.riskBand}, got ${actual.riskBand}`,
    );
  }

  return {
    id: scenario.id,
    description: scenario.description,
    passed: failures.length === 0,
    failures,
    actual,
    durationMs: performance.now() - startedAt,
  };
}

export async function runReplaySuite(
  scenarios: readonly ReplayScenario[],
): Promise<ScenarioSuiteResult> {
  const results: ScenarioResult[] = [];

  for (const scenario of scenarios) {
    results.push(await runReplayScenario(scenario));
  }

  const passed = results.filter((result) => result.passed).length;
  const total = results.length;

  return {
    total,
    passed,
    failed: total - passed,
    passRate: total === 0 ? 1 : passed / total,
    results,
  };
}

function toTask(analyzer: ScenarioAnalyzer): AnalyzerTask {
  return {
    name: analyzer.name,
    source: analyzer.source,
    run: async () => {
      if (analyzer.outcome.type === "error") {
        throw new Error(analyzer.outcome.message);
      }

      return analyzer.outcome.items;
    },
  };
}
