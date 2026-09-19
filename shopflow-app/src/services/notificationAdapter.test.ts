import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NotificationAdapter } from "./notificationAdapter.js";

describe("NotificationAdapter", () => {
  it("records notifications deterministically without network", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shopflow-n-"));
    const file = path.join(dir, "n.jsonl");
    const adapter = new NotificationAdapter(file);
    await adapter.record("ORDER_CONFIRMATION", "ord-1");
    const list = await adapter.list();
    assert.equal(list.length, 1);
    assert.equal(list[0].type, "ORDER_CONFIRMATION");
    assert.equal(list[0].orderId, "ord-1");
  });
});
