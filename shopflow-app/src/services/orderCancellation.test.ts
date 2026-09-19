import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { OrderService, validateCancellationReason } from "./orderService.js";
import { NotificationAdapter } from "./notificationAdapter.js";
import { getPool } from "../db/pool.js";
import type { NotificationRecord, Order } from "../models/types.js";

const hasDatabase = Boolean(process.env.DATABASE_URL);

function thrownStatus(err: unknown): number | undefined {
  return (err as { status?: number }).status;
}

function statusIs(expected: number) {
  return (err: unknown) => thrownStatus(err) === expected;
}

describe("validateCancellationReason", () => {
  it("rejects an empty reason", () => {
    assert.throws(() => validateCancellationReason(""), statusIs(400));
  });

  it("rejects a whitespace-only reason", () => {
    assert.throws(() => validateCancellationReason("   "), statusIs(400));
  });

  it("accepts exactly 200 characters", () => {
    const reason = "a".repeat(200);
    assert.equal(validateCancellationReason(reason), reason);
  });

  it("rejects 201 characters", () => {
    assert.throws(() => validateCancellationReason("a".repeat(201)), statusIs(400));
  });

  it("returns the trimmed reason", () => {
    assert.equal(validateCancellationReason("  refund  "), "refund");
  });

  it("rejects non-string input", () => {
    assert.throws(() => validateCancellationReason(null), statusIs(400));
    assert.throws(() => validateCancellationReason(undefined), statusIs(400));
  });
});

describe(
  "order cancellation (integration)",
  { skip: hasDatabase ? false : "DATABASE_URL is not set" },
  () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "shopflow-cancel-"));
    const notificationPath = path.join(tmpDir, "notifications.jsonl");
    process.env.NOTIFICATION_LOG_PATH = notificationPath;

    const service = new OrderService();
    const notifications = new NotificationAdapter(notificationPath);

    const productIds: string[] = [];
    const orderIds: string[] = [];

    async function createProduct(stock: number): Promise<string> {
      const id = `prod-test-${randomUUID()}`;
      await getPool().query(
        "INSERT INTO products (id, name, price_cents, stock) VALUES ($1,$2,$3,$4)",
        [id, "Cancellation Test Product", 1234, stock]
      );
      productIds.push(id);
      return id;
    }

    async function stockOf(productId: string): Promise<number> {
      const r = await getPool().query("SELECT stock FROM products WHERE id = $1", [
        productId,
      ]);
      return Number(r.rows[0].stock);
    }

    async function newOrder(productId: string, quantity: number): Promise<Order> {
      const order = await service.createOrder({
        productId,
        quantity,
        customerEmail: "cancel-test@example.com",
      });
      orderIds.push(order.id);
      return order;
    }

    async function cancellationNotifications(
      orderId: string
    ): Promise<NotificationRecord[]> {
      const all = await notifications.list();
      return all.filter(
        (r) => r.type === "ORDER_CANCELLATION" && r.orderId === orderId
      );
    }

    before(async () => {
      // Idempotent: mirrors src/db/migrate.ts so the suite also runs without a
      // separate `node dist/db/migrate.js` step.
      await getPool().query(`
        CREATE TABLE IF NOT EXISTS products (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          price_cents INTEGER NOT NULL,
          stock INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS orders (
          id TEXT PRIMARY KEY,
          customer_email TEXT NOT NULL,
          status TEXT NOT NULL,
          product_id TEXT NOT NULL REFERENCES products(id),
          quantity INTEGER NOT NULL,
          total_cents INTEGER NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          cancelled_at TIMESTAMPTZ,
          cancellation_reason TEXT
        );
      `);
    });

    after(async () => {
      const pool = getPool();
      for (const id of orderIds) {
        await pool.query("DELETE FROM orders WHERE id = $1", [id]);
      }
      for (const id of productIds) {
        await pool.query("DELETE FROM products WHERE id = $1", [id]);
      }
      await pool.end();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("I1 cancels a confirmed order and restores stock exactly once", async () => {
      const productId = await createProduct(10);
      const order = await newOrder(productId, 3);
      assert.equal(await stockOf(productId), 7);

      const cancelled = await service.cancelOrder(order.id, "  changed my mind  ");

      assert.equal(cancelled.status, "CANCELLED");
      assert.equal(cancelled.cancellationReason, "changed my mind");
      assert.ok(cancelled.cancelledAt);
      assert.ok(!Number.isNaN(Date.parse(String(cancelled.cancelledAt))));
      assert.equal(await stockOf(productId), 10);
    });

    it("I2 records exactly one ORDER_CANCELLATION notification", async () => {
      const productId = await createProduct(5);
      const order = await newOrder(productId, 1);

      const cancelled = await service.cancelOrder(order.id, "duplicate order");

      const records = await cancellationNotifications(order.id);
      assert.equal(records.length, 1);
      assert.equal(records[0].payload?.reason, "duplicate order");
      assert.equal(records[0].payload?.customerEmail, cancelled.customerEmail);
    });

    it("I3 persists the cancellation fields on the order", async () => {
      const productId = await createProduct(4);
      const order = await newOrder(productId, 2);

      const cancelled = await service.cancelOrder(order.id, "no longer needed");
      const stored = await service.getOrder(order.id);

      assert.ok(stored);
      assert.equal(stored.status, "CANCELLED");
      assert.equal(stored.cancellationReason, "no longer needed");
      assert.equal(stored.cancelledAt, cancelled.cancelledAt);
      assert.ok(!Number.isNaN(Date.parse(String(stored.cancelledAt))));
    });

    it("I4 rejects an empty or whitespace-only reason and leaves state untouched", async () => {
      const productId = await createProduct(6);
      const order = await newOrder(productId, 2);
      const stockBefore = await stockOf(productId);

      await assert.rejects(
        () => service.cancelOrder(order.id, ""),
        statusIs(400)
      );
      await assert.rejects(
        () => service.cancelOrder(order.id, "   "),
        statusIs(400)
      );

      assert.equal((await service.getOrder(order.id))?.status, "CONFIRMED");
      assert.equal(await stockOf(productId), stockBefore);
      assert.equal((await cancellationNotifications(order.id)).length, 0);
    });

    it("I5 rejects a reason longer than 200 characters and leaves state untouched", async () => {
      const productId = await createProduct(6);
      const order = await newOrder(productId, 2);
      const stockBefore = await stockOf(productId);

      await assert.rejects(
        () => service.cancelOrder(order.id, "a".repeat(201)),
        statusIs(400)
      );

      assert.equal((await service.getOrder(order.id))?.status, "CONFIRMED");
      assert.equal(await stockOf(productId), stockBefore);
      assert.equal((await cancellationNotifications(order.id)).length, 0);
    });

    it("I6 rejects cancellation of a shipped order", async () => {
      const productId = await createProduct(8);
      const order = await newOrder(productId, 2);
      const shipped = await service.shipOrder(order.id);
      assert.equal(shipped.status, "SHIPPED");
      const stockBefore = await stockOf(productId);

      await assert.rejects(
        () => service.cancelOrder(order.id, "too late"),
        statusIs(400)
      );

      assert.equal((await service.getOrder(order.id))?.status, "SHIPPED");
      assert.equal(await stockOf(productId), stockBefore);
      assert.equal((await cancellationNotifications(order.id)).length, 0);
    });

    it("I7 returns 404 for an unknown order id", async () => {
      const unknownId = randomUUID();

      await assert.rejects(
        () => service.cancelOrder(unknownId, "why not"),
        statusIs(404)
      );

      assert.equal((await cancellationNotifications(unknownId)).length, 0);
    });

    it("I8 treats a repeated cancellation as an idempotent no-op", async () => {
      const productId = await createProduct(10);
      const order = await newOrder(productId, 4);

      const first = await service.cancelOrder(order.id, "first reason");
      const second = await service.cancelOrder(order.id, "second reason");

      assert.equal(second.status, "CANCELLED");
      assert.equal(second.id, first.id);
      assert.equal(second.cancelledAt, first.cancelledAt);
      assert.equal(second.cancellationReason, "first reason");
      assert.equal(await stockOf(productId), 10);
      assert.equal((await cancellationNotifications(order.id)).length, 1);
    });

    it("I9 serializes concurrent cancellations and restores stock once", async () => {
      const productId = await createProduct(12);
      const order = await newOrder(productId, 5);

      const [a, b] = await Promise.all([
        service.cancelOrder(order.id, "concurrent a"),
        service.cancelOrder(order.id, "concurrent b"),
      ]);

      assert.equal(a.status, "CANCELLED");
      assert.equal(b.status, "CANCELLED");
      assert.equal((await service.getOrder(order.id))?.status, "CANCELLED");
      assert.equal(await stockOf(productId), 12);
      assert.equal((await cancellationNotifications(order.id)).length, 1);
    });

    it("I10 keeps the existing create and ship flow intact", async () => {
      const productId = await createProduct(3);

      const order = await newOrder(productId, 2);
      assert.equal(order.status, "CONFIRMED");
      assert.equal(order.productId, productId);
      assert.equal(await stockOf(productId), 1);

      const shipped = await service.shipOrder(order.id);
      assert.equal(shipped.status, "SHIPPED");
      assert.equal((await service.getOrder(order.id))?.status, "SHIPPED");
      assert.equal(shipped.cancelledAt ?? null, null);
    });
  }
);
