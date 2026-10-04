import {
  parseEvidence,
  type Evidence,
  type EvidenceSource,
} from "../domain/evidence";

export interface AnalyzerTask {
  name: string;
  source: EvidenceSource;
  run: () => Promise<readonly unknown[]>;
  timeoutMs?: number;
}

export type AnalyzerFailureKind = "error" | "timeout" | "contract";

export interface AnalyzerFailure {
  name: string;
  source: EvidenceSource;
  kind: AnalyzerFailureKind;
  message: string;
}

export interface InferenceBatchResult {
  evidence: readonly Evidence[];
  failures: readonly AnalyzerFailure[];
  degraded: boolean;
  allFailed: boolean;
}

export class AnalyzerTimeoutError extends Error {
  constructor(name: string, timeoutMs: number) {
    super(`Analyzer ${name} timed out after ${timeoutMs}ms`);
    this.name = "AnalyzerTimeoutError";
  }
}

export class AnalyzerContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalyzerContractError";
  }
}

/**
 * Run independent analyzers without letting one failed model take down the
 * whole incident. Each analyzer is also treated as an untrusted boundary:
 * its outputs are parsed at runtime and checked against the task contract.
 */
export async function runInferenceBatch(input: {
  incidentId: string;
  tasks: readonly AnalyzerTask[];
  defaultTimeoutMs?: number;
}): Promise<InferenceBatchResult> {
  const defaultTimeoutMs = input.defaultTimeoutMs ?? 2500;

  const settled = await Promise.allSettled(
    input.tasks.map(async (task) => {
      const rawOutputs = await withTimeout(
        task.run(),
        task.timeoutMs ?? defaultTimeoutMs,
        task.name,
      );

      const evidence = rawOutputs.map((raw) => parseEvidence(raw));

      for (const item of evidence) {
        if (item.incidentId !== input.incidentId) {
          throw new AnalyzerContractError(
            `Analyzer ${task.name} returned evidence for incident ${item.incidentId}`,
          );
        }

        if (item.source !== task.source) {
          throw new AnalyzerContractError(
            `Analyzer ${task.name} is registered as ${task.source} but returned ${item.source} evidence`,
          );
        }
      }

      return {
        name: task.name,
        source: task.source,
        evidence,
      };
    }),
  );

  const evidence: Evidence[] = [];
  const failures: AnalyzerFailure[] = [];

  settled.forEach((result, index) => {
    const task = input.tasks[index];
    if (!task) {
      return;
    }

    if (result.status === "fulfilled") {
      evidence.push(...result.value.evidence);
      return;
    }

    const error = asError(result.reason);
    failures.push({
      name: task.name,
      source: task.source,
      kind:
        error instanceof AnalyzerTimeoutError
          ? "timeout"
          : error instanceof AnalyzerContractError || error.name === "ZodError"
            ? "contract"
            : "error",
      message: error.message,
    });
  });

  return {
    evidence,
    failures,
    degraded: failures.length > 0,
    allFailed: input.tasks.length > 0 && failures.length === input.tasks.length,
  };
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  analyzerName: string,
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new AnalyzerTimeoutError(analyzerName, timeoutMs));
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  });
}

function asError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }

  return new Error(String(value));
}
