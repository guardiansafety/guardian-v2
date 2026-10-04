import type {
  AlertDelivery,
  EnqueueAlertInput,
} from "./delivery";

export interface NotificationOutboxRepository {
  enqueue(
    input: EnqueueAlertInput,
    now: Date,
  ): AlertDelivery;

  claimNext(
    now: Date,
    leaseMs: number,
  ): AlertDelivery | null;

  markSent(input: {
    deliveryId: string;
    providerMessageId: string;
    now: Date;
  }): AlertDelivery;

  markFailed(input: {
    deliveryId: string;
    error: string;
    nextAttemptAt: Date | null;
    now: Date;
  }): AlertDelivery;

  getByIdempotencyKey(
    idempotencyKey: string,
  ): AlertDelivery | null;

  list(): readonly AlertDelivery[];
}
