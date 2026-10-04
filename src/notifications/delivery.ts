export const ALERT_DELIVERY_STATUSES = [
  "PENDING",
  "SENDING",
  "SENT",
  "FAILED",
] as const;

export type AlertDeliveryStatus =
  (typeof ALERT_DELIVERY_STATUSES)[number];

export interface AlertDelivery {
  id: string;
  incidentId: string;
  recipientId: string;
  alertType: string;
  idempotencyKey: string;
  status: AlertDeliveryStatus;
  attempts: number;
  nextAttemptAt: Date | null;
  leaseUntil: Date | null;
  providerMessageId: string | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EnqueueAlertInput {
  incidentId: string;
  recipientId: string;
  alertType: string;
}

export function buildAlertIdempotencyKey(
  input: EnqueueAlertInput,
): string {
  return [
    input.incidentId,
    input.recipientId,
    input.alertType,
  ].join(":");
}
