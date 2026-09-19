import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { NotificationRecord } from "../models/types.js";

/**
 * Deterministic local notification adapter — no internet required.
 */
export class NotificationAdapter {
  private readonly filePath: string;

  constructor(filePath = process.env.NOTIFICATION_LOG_PATH || "./data/notifications.jsonl") {
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, "");
    }
  }

  async record(
    type: NotificationRecord["type"],
    orderId: string,
    payload: Record<string, unknown> = {}
  ): Promise<NotificationRecord> {
    const record: NotificationRecord = {
      id: randomUUID(),
      type,
      orderId,
      createdAt: new Date().toISOString(),
      payload: { ...payload, orderId },
    };
    fs.appendFileSync(this.filePath, `${JSON.stringify(record)}\n`);
    return record;
  }

  async list(): Promise<NotificationRecord[]> {
    const raw = fs.readFileSync(this.filePath, "utf8").trim();
    if (!raw) return [];
    return raw.split("\n").map((line) => JSON.parse(line) as NotificationRecord);
  }
}
