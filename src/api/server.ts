import express from "express";

import { buildDemoIncidentView } from "./demo-incident";

export function createApp() {
  const app = express();

  app.get("/healthz", (_request, response) => {
    response.json({ ok: true });
  });

  app.get("/api/incidents/demo", async (_request, response, next) => {
    try {
      response.json(await buildDemoIncidentView());
    } catch (error) {
      next(error);
    }
  });

  return app;
}

if (require.main === module) {
  const port = 3000;

  createApp().listen(port, () => {
    console.log(`Guardian v2 API listening on http://localhost:${port}`);
  });
}
