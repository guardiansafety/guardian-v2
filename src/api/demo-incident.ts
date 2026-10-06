import type { Evidence } from "../domain/evidence";
import {
  createIncident,
  transitionIncident,
  type Incident,
} from "../domain/incident";
import type {
  AnalyzerFailure,
  AnalyzerTask,
} from "../inference/inference-service";
import { evaluateIncidentFromAnalyzers } from "../incidents/incident-pipeline";
import { commitIncidentAlert } from "../notifications/alert-service";
import type { AlertDelivery } from "../notifications/delivery";
import {
  processNextAlert,
  type NotificationProvider,
} from "../notifications/notification-worker";
import { SqliteNotificationOutbox } from "../notifications/sqlite-outbox";
import type { RiskDecision } from "../risk/fusion";
import {
  buildIncidentConsoleView,
  type IncidentConsoleView,
} from "./incident-view";

const INCIDENT_ID = "inc-2026-10-04-001";
const createdAt = new Date("2026-10-04T18:00:00.000Z");
const decisionAt = new Date("2026-10-04T18:00:03.000Z");

interface DemoRuntime {
  incident: Incident;
  evidence: readonly Evidence[];
  decision: RiskDecision | null;
  degraded: boolean;
  failures: readonly AnalyzerFailure[];
  outbox: SqliteNotificationOutbox;
  clockMs: number;
}

export type DemoIncidentAction =
  | "deliver"
  | "acknowledge"
  | "resolve"
  | "reset";

export class DemoIncidentSession {
  private runtime: DemoRuntime | null = null;

  async getView(): Promise<IncidentConsoleView> {
    const runtime = await this.requireRuntime();
    return this.toView(runtime);
  }

  async act(action: DemoIncidentAction): Promise<IncidentConsoleView> {
    if (action === "reset") {
      await this.reset();
      return this.getView();
    }

    const runtime = await this.requireRuntime();

    if (action === "deliver") {
      await this.deliver(runtime);
    } else if (action === "acknowledge") {
      this.acknowledge(runtime);
    } else if (action === "resolve") {
      this.resolve(runtime);
    }

    return this.toView(runtime);
  }

  async reset(): Promise<void> {
    this.runtime?.outbox.close();
    this.runtime = await createRuntime();
  }

  private async requireRuntime(): Promise<DemoRuntime> {
    if (!this.runtime) {
      this.runtime = await createRuntime();
    }

    return this.runtime;
  }

  private async deliver(runtime: DemoRuntime): Promise<void> {
    const delivery = currentDelivery(runtime);
    if (delivery?.status === "SENT") {
      return;
    }

    const result = await processNextAlert({
      outbox: runtime.outbox,
      provider: DEMO_NOTIFICATION_PROVIDER,
      now: nextTime(runtime),
    });

    if (!result) {
      throw new Error("No alert delivery is ready for the worker");
    }
  }

  private acknowledge(runtime: DemoRuntime): void {
    if (
      runtime.incident.state === "ACKED" ||
      runtime.incident.state === "RESOLVED"
    ) {
      return;
    }

    const delivery = currentDelivery(runtime);
    if (runtime.incident.state !== "ALERTED" || delivery?.status !== "SENT") {
      throw new Error("Incident can only be acknowledged after alert delivery");
    }

    runtime.incident = transitionIncident(runtime.incident, {
      to: "ACKED",
      at: nextTime(runtime),
      actor: { type: "human", id: "operator-demo" },
      reason: "Operator acknowledged the incident after responder notification delivery.",
    });
  }

  private resolve(runtime: DemoRuntime): void {
    if (runtime.incident.state === "RESOLVED") {
      return;
    }

    if (runtime.incident.state !== "ACKED") {
      throw new Error("Incident must be acknowledged before it can be resolved");
    }

    runtime.incident = transitionIncident(runtime.incident, {
      to: "RESOLVED",
      at: nextTime(runtime),
      actor: { type: "human", id: "operator-demo" },
      reason: "Operator resolved the incident after the response workflow completed.",
    });
  }

  private toView(runtime: DemoRuntime): IncidentConsoleView {
    return buildIncidentConsoleView({
      incident: runtime.incident,
      evidence: runtime.evidence,
      decision: runtime.decision,
      degraded: runtime.degraded,
      failures: runtime.failures,
      delivery: currentDelivery(runtime),
    });
  }
}

export const demoIncidentSession = new DemoIncidentSession();

export async function buildDemoIncidentView(): Promise<IncidentConsoleView> {
  const session = new DemoIncidentSession();
  return session.getView();
}

async function createRuntime(): Promise<DemoRuntime> {
  const result = await evaluateIncidentFromAnalyzers({
    incident: createIncident({ id: INCIDENT_ID, at: createdAt }),
    evidenceHistory: [],
    now: decisionAt,
    tasks: demoAnalyzers(),
  });

  const outbox = new SqliteNotificationOutbox(":memory:");
  const committed = commitIncidentAlert({
    incident: result.incident,
    outbox,
    recipientId: "response-team-primary",
    alertType: "high-risk",
    now: new Date(decisionAt.getTime() + 1_000),
  });

  return {
    incident: committed.incident,
    evidence: result.evidence,
    decision: result.latestDecision,
    degraded: result.inference.degraded,
    failures: result.inference.failures,
    outbox,
    clockMs: decisionAt.getTime() + 1_000,
  };
}

function currentDelivery(runtime: DemoRuntime): AlertDelivery | null {
  return runtime.outbox.list()[0] ?? null;
}

function nextTime(runtime: DemoRuntime): Date {
  runtime.clockMs += 1_000;
  return new Date(runtime.clockMs);
}

const DEMO_NOTIFICATION_PROVIDER: NotificationProvider = {
  send: async ({ incidentId }) => ({
    providerMessageId: `demo-provider-${incidentId}`,
  }),
};

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

function evidence(input: Omit<Evidence, "incidentId">): Evidence {
  return {
    ...input,
    incidentId: INCIDENT_ID,
  };
}
