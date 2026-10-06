import type { IncidentConsoleView } from "../api/incident-view";

export type ConsoleAction =
  | "deliver"
  | "acknowledge"
  | "resolve"
  | "reset";

export function IncidentConsole({
  view,
  busyAction,
  onAction,
}: {
  view: IncidentConsoleView;
  busyAction: ConsoleAction | null;
  onAction: (action: ConsoleAction) => void;
}) {
  const riskScore =
    view.risk === null ? "—" : view.risk.score.toFixed(2);

  return (
    <main className="console-shell">
      <nav className="topbar">
        <div className="brand">
          <span className="brand-mark">G</span>
          <div>
            <strong>Guardian Operations</strong>
            <span>Incident response console</span>
          </div>
        </div>
        <div className="system-status">
          <span className="status-dot" />
          API CONNECTED
        </div>
      </nav>

      <header className="console-header">
        <div>
          <div className="breadcrumb">INCIDENTS / ACTIVE / {view.incident.id}</div>
          <h1>{view.incident.id}</h1>
          <p className="muted header-copy">
            Multimodal incident analysis with explicit evidence, deterministic
            policy, durable notification delivery, and a human audit trail.
          </p>
        </div>

        <div className="header-status">
          <span className="priority-pill">PRIORITY {view.risk?.band ?? "LOW"}</span>
          <span className={`state-pill state-${view.incident.state.toLowerCase()}`}>
            {view.incident.state.replace("_", " ")}
          </span>
          {view.inference.degraded && (
            <span className="degraded-pill">1 ANALYZER DEGRADED</span>
          )}
        </div>
      </header>

      <section className="summary-grid" aria-label="incident summary">
        <SummaryCard
          label="Risk score"
          metric={riskScore}
          detail={view.risk?.band ?? "No decision"}
        />
        <SummaryCard
          label="Alert delivery"
          metric={view.alertDelivery?.status ?? "—"}
          detail={
            view.alertDelivery
              ? `${view.alertDelivery.attempts} delivery attempt${view.alertDelivery.attempts === 1 ? "" : "s"}`
              : "No alert committed"
          }
          compact
        />
        <SummaryCard
          label="Evidence"
          metric={String(view.evidence.length)}
          detail={`${view.evidence.filter((item) => item.usedInDecision).length} active contributions`}
        />
        <SummaryCard
          label="Inference health"
          metric={view.inference.degraded ? "DEGRADED" : "HEALTHY"}
          detail={`${view.inference.failures.length} analyzer failure${view.inference.failures.length === 1 ? "" : "s"}`}
          compact
        />
      </section>

      <section className="response-panel">
        <div className="panel-heading response-heading">
          <div>
            <p className="eyebrow">RESPONSE WORKFLOW</p>
            <h2>One incident, end to end</h2>
          </div>
          <span className="updated-at">
            Updated {formatTime(view.incident.updatedAt)}
          </span>
        </div>

        <div className="workflow">
          <WorkflowStep
            number="01"
            title="Risk detected"
            detail="Independent audio + vision evidence crossed policy threshold."
            complete
          />
          <WorkflowStep
            number="02"
            title="Alert committed"
            detail="Durable outbox row created before external delivery."
            complete={stateAtLeast(view.incident.state, "ALERTED")}
          />
          <WorkflowStep
            number="03"
            title="Provider delivery"
            detail={
              view.alertDelivery?.status === "SENT"
                ? `Sent as ${view.alertDelivery.providerMessageId}`
                : `${view.alertDelivery?.status ?? "Not queued"} · stable idempotency key`
            }
            complete={view.alertDelivery?.status === "SENT"}
            active={view.alertDelivery?.status === "PENDING"}
          />
          <WorkflowStep
            number="04"
            title="Operator acknowledgement"
            detail="Human confirms ownership of the response."
            complete={stateAtLeast(view.incident.state, "ACKED")}
            active={view.actions.canAcknowledge}
          />
          <WorkflowStep
            number="05"
            title="Resolved"
            detail="Human closes the incident after response completion."
            complete={view.incident.state === "RESOLVED"}
            active={view.actions.canResolve}
          />
        </div>

        <div className="action-bar">
          <ActionButton
            label="Run delivery worker"
            action="deliver"
            disabled={!view.actions.canDeliver}
            busyAction={busyAction}
            onAction={onAction}
          />
          <ActionButton
            label="Acknowledge incident"
            action="acknowledge"
            disabled={!view.actions.canAcknowledge}
            busyAction={busyAction}
            onAction={onAction}
          />
          <ActionButton
            label="Resolve incident"
            action="resolve"
            disabled={!view.actions.canResolve}
            busyAction={busyAction}
            onAction={onAction}
          />
          <button
            className="button button-quiet"
            disabled={busyAction !== null}
            onClick={() => onAction("reset")}
          >
            {busyAction === "reset" ? "Resetting…" : "Reset scenario"}
          </button>
        </div>

        {view.alertDelivery && (
          <div className="delivery-meta">
            <span>
              <strong>Idempotency key</strong>
              <code>{view.alertDelivery.idempotencyKey}</code>
            </span>
            <span>
              <strong>Provider message</strong>
              <code>{view.alertDelivery.providerMessageId ?? "awaiting delivery"}</code>
            </span>
          </div>
        )}
      </section>

      <div className="content-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">EVIDENCE</p>
              <h2>What the system observed</h2>
            </div>
            <span className="panel-kicker">MODEL BOUNDARY VISIBLE</span>
          </div>

          <div className="evidence-list">
            {view.evidence.map((item) => (
              <article className="evidence-row" key={item.id}>
                <div>
                  <div className="evidence-title">
                    <span className="source">{item.source}</span>
                    <strong>{item.signal.replaceAll("_", " ")}</strong>
                  </div>
                  <p className="muted small">
                    {formatProvenance(item.provenance)}
                  </p>
                  <p className="muted small">
                    observed {formatTime(item.observedAt)} · received{" "}
                    {formatTime(item.receivedAt)}
                  </p>
                </div>

                <div className="evidence-score">
                  <strong>{item.score.toFixed(2)}</strong>
                  <span>{item.usedInDecision ? "USED" : "RETAINED"}</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">DECISION TRACE</p>
              <h2>Why the product changed state</h2>
            </div>
            <span className="panel-kicker">AUDITABLE</span>
          </div>

          <div className="reason-list">
            {view.risk?.reasons.map((reason) => (
              <p key={reason}>{reason}</p>
            ))}
          </div>

          <div className="timeline">
            {[...view.timeline].reverse().map((transition, index) => (
              <article
                className="timeline-row"
                key={`${transition.at}-${index}`}
              >
                <span className="timeline-dot" />
                <div>
                  <strong>
                    {transition.from} → {transition.to}
                  </strong>
                  <p className="muted small">
                    {formatTime(transition.at)} · {transition.actor}
                  </p>
                  <p>{transition.reason}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <section className="panel health-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">INFERENCE HEALTH</p>
            <h2>Partial failure stays visible</h2>
          </div>
          <span className="panel-kicker">GRACEFUL DEGRADATION</span>
        </div>

        <div className="health-grid">
          <HealthItem name="Audio classifier" status="HEALTHY" detail="Evidence accepted" />
          <HealthItem name="Vision analyzer" status="HEALTHY" detail="Evidence accepted" />
          <HealthItem
            name="Device telemetry"
            status={view.inference.degraded ? "DEGRADED" : "HEALTHY"}
            detail={view.inference.failures[0]?.message ?? "Connected"}
          />
        </div>
      </section>
    </main>
  );
}

function SummaryCard({
  label,
  metric,
  detail,
  compact = false,
}: {
  label: string;
  metric: string;
  detail: string;
  compact?: boolean;
}) {
  return (
    <article className="summary-card">
      <p className="label">{label}</p>
      <p className={compact ? "metric metric-compact" : "metric"}>{metric}</p>
      <p className="muted small">{detail}</p>
    </article>
  );
}

function WorkflowStep({
  number,
  title,
  detail,
  complete = false,
  active = false,
}: {
  number: string;
  title: string;
  detail: string;
  complete?: boolean;
  active?: boolean;
}) {
  const className = [
    "workflow-step",
    complete ? "workflow-complete" : "",
    active ? "workflow-active" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className}>
      <span className="workflow-number">{complete ? "✓" : number}</span>
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
    </div>
  );
}

function ActionButton({
  label,
  action,
  disabled,
  busyAction,
  onAction,
}: {
  label: string;
  action: ConsoleAction;
  disabled: boolean;
  busyAction: ConsoleAction | null;
  onAction: (action: ConsoleAction) => void;
}) {
  const busy = busyAction === action;

  return (
    <button
      className="button button-primary"
      disabled={disabled || busyAction !== null}
      onClick={() => onAction(action)}
    >
      {busy ? "Working…" : label}
    </button>
  );
}

function HealthItem({
  name,
  status,
  detail,
}: {
  name: string;
  status: "HEALTHY" | "DEGRADED";
  detail: string;
}) {
  return (
    <div className="health-item">
      <span className={`health-dot health-${status.toLowerCase()}`} />
      <div>
        <strong>{name}</strong>
        <p className="muted small">{detail}</p>
      </div>
      <span className={`health-status health-${status.toLowerCase()}`}>
        {status}
      </span>
    </div>
  );
}

function stateAtLeast(
  state: IncidentConsoleView["incident"]["state"],
  target: "ALERTED" | "ACKED",
): boolean {
  const order = ["CREATED", "MONITORING", "HIGH_RISK", "ALERTED", "ACKED", "RESOLVED"];
  return order.indexOf(state) >= order.indexOf(target);
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatProvenance(
  provenance: IncidentConsoleView["evidence"][number]["provenance"],
): string {
  return [
    provenance.provider,
    provenance.model,
    provenance.modelVersion,
    provenance.promptVersion && `prompt:${provenance.promptVersion}`,
  ]
    .filter(Boolean)
    .join(" · ");
}
