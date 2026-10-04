import type { AlertDelivery } from "./delivery";
import type { NotificationOutboxRepository } from "./outbox-repository";
import {
  type Incident,
  transitionIncident,
} from "../domain/incident";

const ALERT_ORCHESTRATOR = {
  type: "system",
  id: "alert-orchestrator",
} as const;

export interface CommitIncidentAlertResult {
  incident: Incident;
  delivery: AlertDelivery | null;
  committed: boolean;
}

/**
 * Commit the product decision to alert before any external provider call runs.
 *
 * ALERTED means the alert workflow has been durably enqueued. Delivery status
 * remains separate because an incident state cannot prove whether a third-party
 * provider actually delivered the side effect.
 */
export function commitIncidentAlert(input: {
  incident: Incident;
  outbox: NotificationOutboxRepository;
  recipientId: string;
  alertType?: string;
  now: Date;
}): CommitIncidentAlertResult {
  const alertType =
    input.alertType ?? "high-risk";

  if (
    input.incident.state !== "HIGH_RISK" &&
    input.incident.state !== "ALERTED"
  ) {
    return {
      incident: input.incident,
      delivery: null,
      committed: false,
    };
  }

  // Enqueue first. If the process crashes after this succeeds but before the
  // incident transition is persisted, retrying this function is safe because
  // the outbox's idempotency key returns the same delivery row.
  const delivery = input.outbox.enqueue(
    {
      incidentId: input.incident.id,
      recipientId: input.recipientId,
      alertType,
    },
    input.now,
  );

  if (input.incident.state === "ALERTED") {
    return {
      incident: input.incident,
      delivery,
      committed: false,
    };
  }

  const incident = transitionIncident(
    input.incident,
    {
      to: "ALERTED",
      at: input.now,
      actor: ALERT_ORCHESTRATOR,
      reason:
        "Alert workflow durably enqueued with idempotency key " +
        delivery.idempotencyKey,
    },
  );

  return {
    incident,
    delivery,
    committed: true,
  };
}
