import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import type { IncidentConsoleView } from "../api/incident-view";
import {
  IncidentConsole,
  type ConsoleAction,
} from "./incident-console";
import "./styles.css";

function App() {
  const [view, setView] = useState<IncidentConsoleView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<ConsoleAction | null>(null);

  useEffect(() => {
    void loadIncident();
  }, []);

  async function loadIncident() {
    try {
      const response = await fetch("/api/incidents/demo");
      if (!response.ok) {
        throw new Error(`Incident API returned ${response.status}`);
      }

      setView((await response.json()) as IncidentConsoleView);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function runAction(action: ConsoleAction) {
    setBusyAction(action);

    try {
      const response = await fetch(
        `/api/incidents/demo/actions/${action}`,
        { method: "POST" },
      );

      const payload = (await response.json()) as
        | IncidentConsoleView
        | { error: string };

      if (!response.ok) {
        throw new Error("error" in payload ? payload.error : `Action failed: ${response.status}`);
      }

      setView(payload as IncidentConsoleView);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusyAction(null);
    }
  }

  if (error && !view) {
    return (
      <main className="loading-shell">
        <p className="eyebrow">GUARDIAN V2</p>
        <h1>Unable to load incident</h1>
        <p>{error}</p>
      </main>
    );
  }

  if (!view) {
    return (
      <main className="loading-shell">
        <p className="eyebrow">GUARDIAN V2</p>
        <h1>Loading incident operations…</h1>
      </main>
    );
  }

  return (
    <>
      {error && <div className="error-banner">{error}</div>}
      <IncidentConsole
        view={view}
        busyAction={busyAction}
        onAction={(action) => void runAction(action)}
      />
    </>
  );
}

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root element");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
