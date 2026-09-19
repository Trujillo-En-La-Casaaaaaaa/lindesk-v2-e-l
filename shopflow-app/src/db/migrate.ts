import { getPool } from "./pool.js";

async function main() {
  const pool = getPool();
  await pool.query(`
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

  await pool.query(
    `INSERT INTO products (id, name, price_cents, stock) VALUES
      ('prod-a', 'Product A', 1999, 20),
      ('prod-b', 'Product B', 999, 10)
     ON CONFLICT (id) DO NOTHING`
  );
  console.log("migrate: ok");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
