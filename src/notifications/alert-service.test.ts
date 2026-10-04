import { describe, expect, it } from "vitest";

import {
  createIncident,
  transitionIncident,
} from "../domain/incident";
import { commitIncidentAlert } from "./alert-service";
import { SqliteNotificationOutbox } from "./sqlite-outbox";

const t0 = new Date(
  "2026-10-04T18:00:00.000Z",
);

function highRiskIncident() {
  let incident = createIncident({
    id: "incident-1",
    at: t0,
  });

  incident = transitionIncident(incident, {
    to: "MONITORING",
    at: new Date(
      "2026-10-04T18:00:01.000Z",
    ),
    actor: {
      type: "system",
      id: "risk-engine",
    },
    reason: "Evidence review started.",
  });

  return transitionIncident(incident, {
    to: "HIGH_RISK",
    at: new Date(
      "2026-10-04T18:00:02.000Z",
    ),
    actor: {
      type: "system",
      id: "risk-engine",
    },
    reason: "Risk crossed threshold.",
  });
}

describe("commitIncidentAlert", () => {
  it("does nothing for an incident that has not reached HIGH_RISK", () => {
    const outbox =
      new SqliteNotificationOutbox(
        ":memory:",
      );

    try {
      const incident = createIncident({
        id: "incident-1",
        at: t0,
      });

      const result = commitIncidentAlert({
        incident,
        outbox,
        recipientId: "guardian-1",
        now: t0,
      });

      expect(result.committed).toBe(
        false,
      );
      expect(result.delivery).toBeNull();
      expect(outbox.list()).toEqual([]);
    } finally {
      outbox.close();
    }
  });

  it("durably enqueues before moving HIGH_RISK to ALERTED", () => {
    const outbox =
      new SqliteNotificationOutbox(
        ":memory:",
      );

    try {
      const result = commitIncidentAlert({
        incident: highRiskIncident(),
        outbox,
        recipientId: "guardian-1",
        now: new Date(
          "2026-10-04T18:00:03.000Z",
        ),
      });

      expect(result.committed).toBe(true);
      expect(result.incident.state).toBe(
        "ALERTED",
      );
      expect(result.delivery?.status).toBe(
        "PENDING",
      );
      expect(outbox.list()).toHaveLength(1);
      expect(
        result.incident.transitions.at(-1)
          ?.reason,
      ).toContain(
        result.delivery?.idempotencyKey,
      );
    } finally {
      outbox.close();
    }
  });

  it("reuses the same delivery when the alert commitment is replayed", () => {
    const outbox =
      new SqliteNotificationOutbox(
        ":memory:",
      );

    try {
      const incident = highRiskIncident();

      const first = commitIncidentAlert({
        incident,
        outbox,
        recipientId: "guardian-1",
        now: new Date(
          "2026-10-04T18:00:03.000Z",
        ),
      });

      const replay = commitIncidentAlert({
        incident,
        outbox,
        recipientId: "guardian-1",
        now: new Date(
          "2026-10-04T18:00:04.000Z",
        ),
      });

      expect(replay.delivery?.id).toBe(
        first.delivery?.id,
      );
      expect(outbox.list()).toHaveLength(1);
    } finally {
      outbox.close();
    }
  });

  it("keeps an already ALERTED incident idempotent", () => {
    const outbox =
      new SqliteNotificationOutbox(
        ":memory:",
      );

    try {
      const first = commitIncidentAlert({
        incident: highRiskIncident(),
        outbox,
        recipientId: "guardian-1",
        now: new Date(
          "2026-10-04T18:00:03.000Z",
        ),
      });

      const second = commitIncidentAlert({
        incident: first.incident,
        outbox,
        recipientId: "guardian-1",
        now: new Date(
          "2026-10-04T18:00:04.000Z",
        ),
      });

      expect(second.committed).toBe(
        false,
      );
      expect(second.incident).toBe(
        first.incident,
      );
      expect(second.delivery?.id).toBe(
        first.delivery?.id,
      );
      expect(outbox.list()).toHaveLength(1);
    } finally {
      outbox.close();
    }
  });
});
