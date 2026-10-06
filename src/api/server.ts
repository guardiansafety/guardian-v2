import express from "express";

import {
  demoIncidentSession,
  type DemoIncidentAction,
} from "./demo-incident";

const DEMO_ACTIONS = new Set<DemoIncidentAction>([
  "deliver",
  "acknowledge",
  "resolve",
  "reset",
]);

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get("/", (_request, response) => {
    response.json({
      service: "guardian-v2-api",
      ok: true,
      health: "/healthz",
      incidentConsole: "/api/incidents/demo",
    });
  });

  app.get("/healthz", (_request, response) => {
    response.json({ ok: true });
  });

  app.get("/api/incidents/demo", async (_request, response, next) => {
    try {
      response.json(await demoIncidentSession.getView());
    } catch (error) {
      next(error);
    }
  });

  app.post(
    "/api/incidents/demo/actions/:action",
    async (request, response) => {
      const action = request.params.action as DemoIncidentAction;

      if (!DEMO_ACTIONS.has(action)) {
        response.status(404).json({ error: "Unknown incident action" });
        return;
      }

      try {
        response.json(await demoIncidentSession.act(action));
      } catch (error) {
        response.status(409).json({
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );

  return app;
}

if (require.main === module) {
  const port = Number(process.env.API_PORT ?? "3101");

  createApp().listen(port, () => {
    console.log(`Guardian v2 API listening on http://localhost:${port}`);
  });
}
