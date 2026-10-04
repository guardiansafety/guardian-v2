import { describe, expect, it } from "vitest";

import {
  NotificationProviderError,
  processNextAlert,
  type NotificationProvider,
} from "./notification-worker";
import { SqliteNotificationOutbox } from "./sqlite-outbox";

const t0 = new Date(
  "2026-10-04T18:00:00.000Z",
);

describe("notification outbox", () => {
  it("deduplicates enqueue by the business idempotency key", () => {
    const outbox =
      new SqliteNotificationOutbox(
        ":memory:",
      );

    try {
      const first = outbox.enqueue(
        {
          incidentId: "incident-1",
          recipientId: "guardian-1",
          alertType: "high-risk",
        },
        t0,
      );
      const second = outbox.enqueue(
        {
          incidentId: "incident-1",
          recipientId: "guardian-1",
          alertType: "high-risk",
        },
        new Date(
          "2026-10-04T18:00:01.000Z",
        ),
      );

      expect(second.id).toBe(first.id);
      expect(outbox.list()).toHaveLength(1);
    } finally {
      outbox.close();
    }
  });

  it("marks a successfully delivered alert as SENT", async () => {
    const outbox =
      new SqliteNotificationOutbox(
        ":memory:",
      );

    try {
      outbox.enqueue(
        {
          incidentId: "incident-1",
          recipientId: "guardian-1",
          alertType: "high-risk",
        },
        t0,
      );

      const provider: NotificationProvider = {
        send: async () => ({
          providerMessageId: "msg-1",
        }),
      };

      const result =
        await processNextAlert({
          outbox,
          provider,
          now: t0,
        });

      expect(result?.outcome).toBe(
        "sent",
      );
      expect(result?.delivery.status).toBe(
        "SENT",
      );
      expect(
        result?.delivery.providerMessageId,
      ).toBe("msg-1");
    } finally {
      outbox.close();
    }
  });

  it("retries an ambiguous timeout with the same provider idempotency key", async () => {
    const outbox =
      new SqliteNotificationOutbox(
        ":memory:",
      );
    const provider =
      new AmbiguousTimeoutProvider();

    try {
      const delivery = outbox.enqueue(
        {
          incidentId: "incident-1",
          recipientId: "guardian-1",
          alertType: "high-risk",
        },
        t0,
      );

      const first =
        await processNextAlert({
          outbox,
          provider,
          now: t0,
          baseRetryDelayMs: 1000,
        });

      expect(first?.outcome).toBe(
        "retry_scheduled",
      );
      expect(first?.delivery.status).toBe(
        "FAILED",
      );
      expect(
        first?.delivery.nextAttemptAt,
      ).toEqual(
        new Date(
          "2026-10-04T18:00:01.000Z",
        ),
      );

      const second =
        await processNextAlert({
          outbox,
          provider,
          now: new Date(
            "2026-10-04T18:00:01.000Z",
          ),
        });

      expect(second?.outcome).toBe(
        "sent",
      );
      expect(second?.delivery.status).toBe(
        "SENT",
      );

      expect(provider.accepted.size).toBe(
        1,
      );
      expect(provider.calls).toEqual([
        delivery.idempotencyKey,
        delivery.idempotencyKey,
      ]);
    } finally {
      outbox.close();
    }
  });

  it("does not retry a permanent provider error", async () => {
    const outbox =
      new SqliteNotificationOutbox(
        ":memory:",
      );

    try {
      outbox.enqueue(
        {
          incidentId: "incident-1",
          recipientId: "guardian-1",
          alertType: "high-risk",
        },
        t0,
      );

      const provider: NotificationProvider = {
        send: async () => {
          throw new NotificationProviderError(
            "invalid recipient",
            false,
          );
        },
      };

      const result =
        await processNextAlert({
          outbox,
          provider,
          now: t0,
        });

      expect(result?.outcome).toBe(
        "terminal_failure",
      );
      expect(
        result?.delivery.nextAttemptAt,
      ).toBeNull();
    } finally {
      outbox.close();
    }
  });

  it("reclaims a SENDING delivery after its worker lease expires", async () => {
    const outbox =
      new SqliteNotificationOutbox(
        ":memory:",
      );

    try {
      outbox.enqueue(
        {
          incidentId: "incident-1",
          recipientId: "guardian-1",
          alertType: "high-risk",
        },
        t0,
      );

      const claimed = outbox.claimNext(
        t0,
        1000,
      );
      expect(claimed?.status).toBe(
        "SENDING",
      );

      const provider: NotificationProvider = {
        send: async () => ({
          providerMessageId: "msg-reclaimed",
        }),
      };

      const result =
        await processNextAlert({
          outbox,
          provider,
          now: new Date(
            "2026-10-04T18:00:01.001Z",
          ),
        });

      expect(result?.outcome).toBe(
        "sent",
      );
      expect(result?.delivery.attempts).toBe(
        2,
      );
    } finally {
      outbox.close();
    }
  });
});

class AmbiguousTimeoutProvider
  implements NotificationProvider
{
  readonly accepted =
    new Map<string, string>();

  readonly calls: string[] = [];

  private failAfterAccept = true;

  async send(input: {
    incidentId: string;
    recipientId: string;
    alertType: string;
    idempotencyKey: string;
  }): Promise<{
    providerMessageId: string;
  }> {
    this.calls.push(
      input.idempotencyKey,
    );

    const existing = this.accepted.get(
      input.idempotencyKey,
    );

    if (existing) {
      return {
        providerMessageId: existing,
      };
    }

    const providerMessageId = "msg-1";
    this.accepted.set(
      input.idempotencyKey,
      providerMessageId,
    );

    if (this.failAfterAccept) {
      this.failAfterAccept = false;

      throw new NotificationProviderError(
        "provider timed out after accepting request",
        true,
      );
    }

    return {
      providerMessageId,
    };
  }
}
