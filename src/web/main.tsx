import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import type { IncidentConsoleView } from "../api/incident-view";
import { IncidentConsole } from "./incident-console";
import "./styles.css";

function App() {
  const [view, setView] = useState<IncidentConsoleView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    fetch("/api/incidents/demo")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Incident API returned ${response.status}`);
        }

        return (await response.json()) as IncidentConsoleView;
      })
      .then((nextView) => {
        if (active) {
          setView(nextView);
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (error) {
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
        <h1>Loading incident trace…</h1>
      </main>
    );
  }

  return <IncidentConsole view={view} />;
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
