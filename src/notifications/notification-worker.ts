import type { AlertDelivery } from "./delivery";
import type { NotificationOutboxRepository } from "./outbox-repository";

export interface NotificationProvider {
  send(input: {
    incidentId: string;
    recipientId: string;
    alertType: string;
    idempotencyKey: string;
  }): Promise<{
    providerMessageId: string;
  }>;
}

export class NotificationProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "NotificationProviderError";
  }
}

export interface NotificationWorkerResult {
  delivery: AlertDelivery;
  outcome:
    | "sent"
    | "retry_scheduled"
    | "terminal_failure";
}

export async function processNextAlert(input: {
  outbox: NotificationOutboxRepository;
  provider: NotificationProvider;
  now: Date;
  leaseMs?: number;
  maxAttempts?: number;
  baseRetryDelayMs?: number;
}): Promise<NotificationWorkerResult | null> {
  const leaseMs = input.leaseMs ?? 30_000;
  const maxAttempts = input.maxAttempts ?? 5;
  const baseRetryDelayMs =
    input.baseRetryDelayMs ?? 1_000;

  const delivery = input.outbox.claimNext(
    input.now,
    leaseMs,
  );

  if (!delivery) {
    return null;
  }

  try {
    const result = await input.provider.send({
      incidentId: delivery.incidentId,
      recipientId: delivery.recipientId,
      alertType: delivery.alertType,
      idempotencyKey:
        delivery.idempotencyKey,
    });

    return {
      delivery: input.outbox.markSent({
        deliveryId: delivery.id,
        providerMessageId:
          result.providerMessageId,
        now: input.now,
      }),
      outcome: "sent",
    };
  } catch (error) {
    const normalized = normalizeError(error);
    const canRetry =
      normalized.retryable &&
      delivery.attempts < maxAttempts;

    const nextAttemptAt = canRetry
      ? new Date(
          input.now.getTime() +
            retryDelayMs(
              delivery.attempts,
              baseRetryDelayMs,
            ),
        )
      : null;

    return {
      delivery: input.outbox.markFailed({
        deliveryId: delivery.id,
        error: normalized.message,
        nextAttemptAt,
        now: input.now,
      }),
      outcome: canRetry
        ? "retry_scheduled"
        : "terminal_failure",
    };
  }
}

function retryDelayMs(
  attempts: number,
  baseRetryDelayMs: number,
): number {
  const exponent = Math.max(
    0,
    attempts - 1,
  );

  return Math.min(
    60_000,
    baseRetryDelayMs * 2 ** exponent,
  );
}

function normalizeError(error: unknown): {
  message: string;
  retryable: boolean;
} {
  if (
    error instanceof
    NotificationProviderError
  ) {
    return {
      message: error.message,
      retryable: error.retryable,
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      retryable: true,
    };
  }

  return {
    message: String(error),
    retryable: true,
  };
}
