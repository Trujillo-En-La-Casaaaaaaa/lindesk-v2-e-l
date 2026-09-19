import type { PoolClient } from "pg";
import { getPool } from "../db/pool.js";
import type { Order, Product } from "../models/types.js";

function mapProduct(row: Record<string, unknown>): Product {
  return {
    id: String(row.id),
    name: String(row.name),
    priceCents: Number(row.price_cents),
    stock: Number(row.stock),
  };
}

function mapOrder(row: Record<string, unknown>): Order {
  return {
    id: String(row.id),
    customerEmail: String(row.customer_email),
    status: row.status as Order["status"],
    productId: String(row.product_id),
    quantity: Number(row.quantity),
    totalCents: Number(row.total_cents),
    createdAt: new Date(String(row.created_at)).toISOString(),
    cancelledAt: row.cancelled_at
      ? new Date(String(row.cancelled_at)).toISOString()
      : null,
    cancellationReason: row.cancellation_reason
      ? String(row.cancellation_reason)
      : null,
  };
}

export class ProductRepository {
  async list(): Promise<Product[]> {
    const r = await getPool().query("SELECT * FROM products ORDER BY id");
    return r.rows.map(mapProduct);
  }

  async getById(id: string, client?: PoolClient): Promise<Product | null> {
    const q = client ?? getPool();
    const r = await q.query("SELECT * FROM products WHERE id = $1", [id]);
    return r.rows[0] ? mapProduct(r.rows[0]) : null;
  }

  async decrementStock(
    id: string,
    quantity: number,
    client: PoolClient
  ): Promise<boolean> {
    const r = await client.query(
      `UPDATE products SET stock = stock - $2
       WHERE id = $1 AND stock >= $2
       RETURNING *`,
      [id, quantity]
    );
    return r.rowCount === 1;
  }

  async restoreStock(
    id: string,
    quantity: number,
    client: PoolClient
  ): Promise<boolean> {
    const r = await client.query(
      `UPDATE products SET stock = stock + $2
       WHERE id = $1
       RETURNING *`,
      [id, quantity]
    );
    return r.rowCount === 1;
  }
}

export class OrderRepository {
  async create(
    order: Omit<Order, "cancelledAt" | "cancellationReason">,
    client: PoolClient
  ): Promise<Order> {
    const r = await client.query(
      `INSERT INTO orders
        (id, customer_email, status, product_id, quantity, total_cents, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        order.id,
        order.customerEmail,
        order.status,
        order.productId,
        order.quantity,
        order.totalCents,
        order.createdAt,
      ]
    );
    return mapOrder(r.rows[0]);
  }

  async getById(id: string): Promise<Order | null> {
    const r = await getPool().query("SELECT * FROM orders WHERE id = $1", [id]);
    return r.rows[0] ? mapOrder(r.rows[0]) : null;
  }

  async getByIdForUpdate(id: string, client: PoolClient): Promise<Order | null> {
    const r = await client.query("SELECT * FROM orders WHERE id = $1 FOR UPDATE", [
      id,
    ]);
    return r.rows[0] ? mapOrder(r.rows[0]) : null;
  }

  async markShipped(id: string): Promise<Order | null> {
    const r = await getPool().query(
      `UPDATE orders SET status = 'SHIPPED'
       WHERE id = $1 AND status = 'CONFIRMED'
       RETURNING *`,
      [id]
    );
    return r.rows[0] ? mapOrder(r.rows[0]) : null;
  }

  async markCancelled(
    id: string,
    reason: string,
    client: PoolClient
  ): Promise<Order | null> {
    const r = await client.query(
      `UPDATE orders SET status = 'CANCELLED', cancelled_at = NOW(), cancellation_reason = $2
       WHERE id = $1 AND status = 'CONFIRMED'
       RETURNING *`,
      [id, reason]
    );
    return r.rows[0] ? mapOrder(r.rows[0]) : null;
  }
}
