import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

import {
  buildAlertIdempotencyKey,
  type AlertDelivery,
  type EnqueueAlertInput,
} from "./delivery";
import type { NotificationOutboxRepository } from "./outbox-repository";

interface DeliveryRow {
  id: string;
  incident_id: string;
  recipient_id: string;
  alert_type: string;
  idempotency_key: string;
  status: string;
  attempts: number;
  next_attempt_at: string | null;
  lease_until: string | null;
  provider_message_id: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export class SqliteNotificationOutbox
  implements NotificationOutboxRepository
{
  private readonly database: DatabaseSync;

  constructor(path: string) {
    this.database = new DatabaseSync(path);
    this.database.exec(
      "PRAGMA journal_mode = WAL;" +
        " CREATE TABLE IF NOT EXISTS alert_deliveries (" +
        " id TEXT PRIMARY KEY," +
        " incident_id TEXT NOT NULL," +
        " recipient_id TEXT NOT NULL," +
        " alert_type TEXT NOT NULL," +
        " idempotency_key TEXT NOT NULL UNIQUE," +
        " status TEXT NOT NULL," +
        " attempts INTEGER NOT NULL," +
        " next_attempt_at TEXT," +
        " lease_until TEXT," +
        " provider_message_id TEXT," +
        " last_error TEXT," +
        " created_at TEXT NOT NULL," +
        " updated_at TEXT NOT NULL" +
        ");" +
        " CREATE INDEX IF NOT EXISTS idx_alert_deliveries_claim" +
        " ON alert_deliveries (status, next_attempt_at, lease_until, created_at);",
    );
  }

  enqueue(
    input: EnqueueAlertInput,
    now: Date,
  ): AlertDelivery {
    const idempotencyKey =
      buildAlertIdempotencyKey(input);

    this.database
      .prepare(
        "INSERT OR IGNORE INTO alert_deliveries (" +
          "id, incident_id, recipient_id, alert_type, idempotency_key, status," +
          "attempts, next_attempt_at, lease_until, provider_message_id, last_error," +
          "created_at, updated_at" +
          ") VALUES (?, ?, ?, ?, ?, 'PENDING', 0, NULL, NULL, NULL, NULL, ?, ?)",
      )
      .run(
        randomUUID(),
        input.incidentId,
        input.recipientId,
        input.alertType,
        idempotencyKey,
        now.toISOString(),
        now.toISOString(),
      );

    const delivery =
      this.getByIdempotencyKey(idempotencyKey);

    if (!delivery) {
      throw new Error(
        "Failed to read alert delivery after enqueue",
      );
    }

    return delivery;
  }

  claimNext(
    now: Date,
    leaseMs: number,
  ): AlertDelivery | null {
    this.database.exec("BEGIN IMMEDIATE");

    try {
      const row = this.database
        .prepare(
          "SELECT * FROM alert_deliveries WHERE " +
            "status = 'PENDING' OR " +
            "(status = 'FAILED' AND next_attempt_at IS NOT NULL AND next_attempt_at <= ?) OR " +
            "(status = 'SENDING' AND lease_until IS NOT NULL AND lease_until <= ?) " +
            "ORDER BY created_at ASC LIMIT 1",
        )
        .get(
          now.toISOString(),
          now.toISOString(),
        ) as DeliveryRow | undefined;

      if (!row) {
        this.database.exec("COMMIT");
        return null;
      }

      const leaseUntil = new Date(
        now.getTime() + leaseMs,
      );

      this.database
        .prepare(
          "UPDATE alert_deliveries SET " +
            "status = 'SENDING', attempts = attempts + 1, lease_until = ?, " +
            "next_attempt_at = NULL, updated_at = ? WHERE id = ?",
        )
        .run(
          leaseUntil.toISOString(),
          now.toISOString(),
          row.id,
        );

      const claimed = this.getById(row.id);

      this.database.exec("COMMIT");

      if (!claimed) {
        throw new Error(
          "Claimed alert delivery disappeared",
        );
      }

      return claimed;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  markSent(input: {
    deliveryId: string;
    providerMessageId: string;
    now: Date;
  }): AlertDelivery {
    this.database
      .prepare(
        "UPDATE alert_deliveries SET " +
          "status = 'SENT', provider_message_id = ?, lease_until = NULL, " +
          "next_attempt_at = NULL, last_error = NULL, updated_at = ? WHERE id = ?",
      )
      .run(
        input.providerMessageId,
        input.now.toISOString(),
        input.deliveryId,
      );

    return this.requireById(input.deliveryId);
  }

  markFailed(input: {
    deliveryId: string;
    error: string;
    nextAttemptAt: Date | null;
    now: Date;
  }): AlertDelivery {
    this.database
      .prepare(
        "UPDATE alert_deliveries SET " +
          "status = 'FAILED', next_attempt_at = ?, lease_until = NULL, " +
          "last_error = ?, updated_at = ? WHERE id = ?",
      )
      .run(
        input.nextAttemptAt?.toISOString() ?? null,
        input.error,
        input.now.toISOString(),
        input.deliveryId,
      );

    return this.requireById(input.deliveryId);
  }

  getByIdempotencyKey(
    idempotencyKey: string,
  ): AlertDelivery | null {
    const row = this.database
      .prepare(
        "SELECT * FROM alert_deliveries WHERE idempotency_key = ?",
      )
      .get(idempotencyKey) as
      | DeliveryRow
      | undefined;

    return row ? mapRow(row) : null;
  }

  list(): readonly AlertDelivery[] {
    const rows = this.database
      .prepare(
        "SELECT * FROM alert_deliveries ORDER BY created_at ASC",
      )
      .all() as unknown as DeliveryRow[];

    return rows.map(mapRow);
  }

  close(): void {
    this.database.close();
  }

  private getById(
    deliveryId: string,
  ): AlertDelivery | null {
    const row = this.database
      .prepare(
        "SELECT * FROM alert_deliveries WHERE id = ?",
      )
      .get(deliveryId) as
      | DeliveryRow
      | undefined;

    return row ? mapRow(row) : null;
  }

  private requireById(
    deliveryId: string,
  ): AlertDelivery {
    const delivery = this.getById(deliveryId);

    if (!delivery) {
      throw new Error(
        "Unknown alert delivery: " + deliveryId,
      );
    }

    return delivery;
  }
}

function mapRow(
  row: DeliveryRow,
): AlertDelivery {
  return {
    id: row.id,
    incidentId: row.incident_id,
    recipientId: row.recipient_id,
    alertType: row.alert_type,
    idempotencyKey: row.idempotency_key,
    status: row.status as AlertDelivery["status"],
    attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at
      ? new Date(row.next_attempt_at)
      : null,
    leaseUntil: row.lease_until
      ? new Date(row.lease_until)
      : null,
    providerMessageId:
      row.provider_message_id,
    lastError: row.last_error,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
