import type { IncidentConsoleView } from "../api/incident-view";

export function IncidentConsole({
  view,
}: {
  view: IncidentConsoleView;
}) {
  const riskScore =
    view.risk === null ? "—" : view.risk.score.toFixed(2);

  return (
    <main className="console-shell">
      <header className="console-header">
        <div>
          <p className="eyebrow">GUARDIAN V2 / INCIDENT CONSOLE</p>
          <h1>{view.incident.id}</h1>
          <p className="muted">
            AI evidence is visible here as input to a deterministic product
            decision, not as an instruction hidden behind the UI.
          </p>
        </div>

        <div className="header-status">
          <span className={`state-pill state-${view.incident.state.toLowerCase()}`}>
            {view.incident.state.replace("_", " ")}
          </span>
          {view.inference.degraded && (
            <span className="degraded-pill">DEGRADED INFERENCE</span>
          )}
        </div>
      </header>

      <section className="summary-grid" aria-label="incident summary">
        <article className="summary-card">
          <p className="label">Risk score</p>
          <p className="metric">{riskScore}</p>
          <p className="muted">{view.risk?.band ?? "No decision"}</p>
        </article>

        <article className="summary-card">
          <p className="label">Evidence</p>
          <p className="metric">{view.evidence.length}</p>
          <p className="muted">
            {view.evidence.filter((item) => item.usedInDecision).length} active
            contributions
          </p>
        </article>

        <article className="summary-card">
          <p className="label">Analyzer failures</p>
          <p className="metric">{view.inference.failures.length}</p>
          <p className="muted">
            partial failures remain visible to the operator
          </p>
        </article>
      </section>

      <div className="content-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">EVIDENCE</p>
              <h2>What the system observed</h2>
            </div>
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
                    observed {formatTime(item.observedAt)}
                  </p>
                </div>

                <div className="evidence-score">
                  <strong>{item.score.toFixed(2)}</strong>
                  <span>{item.usedInDecision ? "used" : "retained"}</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <p className="eyebrow">DECISION TRACE</p>
          <h2>Why the product changed state</h2>

          <div className="reason-list">
            {view.risk?.reasons.map((reason) => (
              <p key={reason}>{reason}</p>
            ))}
          </div>

          <div className="timeline">
            {view.timeline.map((transition, index) => (
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

      {view.inference.failures.length > 0 && (
        <section className="panel failure-panel">
          <p className="eyebrow">DEGRADED MODE</p>
          <h2>What did not complete</h2>

          {view.inference.failures.map((failure) => (
            <article className="failure-row" key={failure.name}>
              <div>
                <strong>{failure.name}</strong>
                <p className="muted small">
                  {failure.source} · {failure.kind}
                </p>
              </div>
              <p>{failure.message}</p>
            </article>
          ))}
        </section>
      )}
    </main>
  );
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
