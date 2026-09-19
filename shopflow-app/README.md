# ShopFlow F1 — Low MVC (frozen fixture)

Experimental fixture for LinDesk evaluation. Customers can cancel an order that has not
been shipped, from the REST API or the server-rendered web UI.

## Startup

```bash
docker compose up -d --build
curl http://127.0.0.1:3000/api/health
```

App: http://127.0.0.1:3000  
Postgres on host port `5433`.

## Tests

```bash
npm install
npm test
```

`npm test` builds the project and runs `node --test` over the compiled output:

- `dist/services/notificationAdapter.test.js` — notification adapter tests.
- `dist/services/orderCancellation.test.js` — pure `validateCancellationReason` unit tests
  (always run) plus DB-backed cancellation integration tests. The integration tests are
  **skipped** unless `DATABASE_URL` is set.

To run the integration tests locally against the compose database:

```powershell
docker compose up -d db
$env:DATABASE_URL = "postgres://shopflow:shopflow@localhost:5433/shopflow"
npm test
```

## Order cancellation

Cancel a `CONFIRMED` order (not yet shipped) with a reason of at most 200 characters.

| Route | Body | Result |
| --- | --- | --- |
| `POST /api/orders/:id/cancel` | `{ "reason": "<string>" }` (also accepts `cancellationReason`) | `200` with the cancelled order, `400` for an invalid/blank/too-long reason or a non-cancellable order, `404` for an unknown order |
| `POST /orders/:id/cancel` | form field `reason` | `302` redirect to `/orders/:id`, or `400` with the error message |

```bash
curl -X POST http://127.0.0.1:3000/api/orders/<ID>/cancel \
  -H "Content-Type: application/json" -d '{"reason":"changed my mind"}'
```

The order page at `GET /orders/:id` renders a cancel form (with a required `reason` input)
for `CONFIRMED` orders only, next to the existing "Mark SHIPPED" button.

Semantics:

- The status transition (`CONFIRMED` → `CANCELLED`) and the inventory restoration run in a
  single PostgreSQL transaction; both apply or neither does.
- `cancelled_at` and `cancellation_reason` are persisted on the order.
- Inventory is restored **exactly once**: only the guarded `CONFIRMED` → `CANCELLED`
  transition triggers `restoreStock`. Repeated or concurrent cancels take an idempotent
  no-write path and return the existing `CANCELLED` order record.
- An `ORDER_CANCELLATION` notification is recorded once, after commit, through the existing
  local notification adapter (`GET /api/notifications`).

Black-box acceptance (from `lindesk-evaluation`):

```powershell
..\..\..\scripts\run-acceptance.ps1 -Target . -Suite baseline -StartCompose
```

## Architecture

MVC-style separation under `src/`:

- `controllers/` — HTTP handlers and HTML views
- `services/` — application logic + notification adapter
- `repositories/` — persistence
- `models/` — entities
- `db/` — pool + migrations

## Seed

| ID | Name | Stock |
| --- | --- | ---: |
| prod-a | Product A | 20 |
| prod-b | Product B | 10 |
