import { randomUUID } from "node:crypto";
import { getPool } from "../db/pool.js";
import { OrderRepository, ProductRepository } from "../repositories/index.js";
import { NotificationAdapter } from "./notificationAdapter.js";
import type { Order, Product } from "../models/types.js";

/**
 * Validates and normalizes a cancellation reason.
 * Throws an error carrying `status: 400` when the reason is unusable.
 */
export function validateCancellationReason(raw: unknown): string {
  const reason = String(raw ?? "").trim();
  if (!reason) {
    throw Object.assign(new Error("Cancellation reason is required"), {
      status: 400,
    });
  }
  if (reason.length > 200) {
    throw Object.assign(
      new Error("Cancellation reason must be 200 characters or fewer"),
      { status: 400 }
    );
  }
  return reason;
}

export class OrderService {
  private products = new ProductRepository();
  private orders = new OrderRepository();
  private notifications = new NotificationAdapter();

  listProducts(): Promise<Product[]> {
    return this.products.list();
  }

  getProduct(id: string): Promise<Product | null> {
    return this.products.getById(id);
  }

  getOrder(id: string): Promise<Order | null> {
    return this.orders.getById(id);
  }

  listNotifications() {
    return this.notifications.list();
  }

  async createOrder(input: {
    productId: string;
    quantity: number;
    customerEmail: string;
  }): Promise<Order> {
    if (!input.customerEmail || input.quantity < 1) {
      throw Object.assign(new Error("Invalid order"), { status: 400 });
    }

    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const product = await this.products.getById(input.productId, client);
      if (!product) {
        throw Object.assign(new Error("Product not found"), { status: 404 });
      }
      const ok = await this.products.decrementStock(
        input.productId,
        input.quantity,
        client
      );
      if (!ok) {
        throw Object.assign(new Error("Insufficient stock"), { status: 400 });
      }
      const order = await this.orders.create(
        {
          id: randomUUID(),
          customerEmail: input.customerEmail,
          status: "CONFIRMED",
          productId: input.productId,
          quantity: input.quantity,
          totalCents: product.priceCents * input.quantity,
          createdAt: new Date().toISOString(),
        },
        client
      );
      await client.query("COMMIT");
      await this.notifications.record("ORDER_CONFIRMATION", order.id, {
        customerEmail: order.customerEmail,
      });
      return order;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async shipOrder(id: string): Promise<Order> {
    const order = await this.orders.markShipped(id);
    if (!order) {
      throw Object.assign(new Error("Cannot ship order"), { status: 400 });
    }
    return order;
  }

  async cancelOrder(id: string, reason: string): Promise<Order> {
    const trimmed = validateCancellationReason(reason);

    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await this.orders.getByIdForUpdate(id, client);
      if (!existing) {
        throw Object.assign(new Error("Order not found"), { status: 404 });
      }
      if (existing.status === "SHIPPED") {
        throw Object.assign(new Error("Cannot cancel a shipped order"), {
          status: 400,
        });
      }
      if (existing.status === "CANCELLED") {
        await client.query("COMMIT");
        return existing;
      }
      const cancelled = await this.orders.markCancelled(id, trimmed, client);
      if (!cancelled) {
        throw Object.assign(new Error("Order is not cancellable"), {
          status: 400,
        });
      }
      await this.products.restoreStock(
        cancelled.productId,
        cancelled.quantity,
        client
      );
      await client.query("COMMIT");
      await this.notifications.record("ORDER_CANCELLATION", cancelled.id, {
        customerEmail: cancelled.customerEmail,
        reason: cancelled.cancellationReason,
      });
      return cancelled;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
}
