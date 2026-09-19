import type { Request, Response, NextFunction } from "express";
import { OrderService } from "../services/orderService.js";

const service = new OrderService();

function handleError(err: unknown, res: Response) {
  const e = err as { status?: number; message?: string };
  const status = e.status ?? 500;
  res.status(status).json({ error: e.message ?? "Internal error" });
}

export async function health(_req: Request, res: Response) {
  res.json({ ok: true });
}

export async function listProductsApi(_req: Request, res: Response) {
  res.json(await service.listProducts());
}

export async function getProductApi(req: Request, res: Response) {
  const product = await service.getProduct(req.params.id);
  if (!product) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(product);
}

export async function createOrderApi(req: Request, res: Response, next: NextFunction) {
  try {
    const order = await service.createOrder({
      productId: String(req.body.productId ?? ""),
      quantity: Number(req.body.quantity ?? 0),
      customerEmail: String(req.body.customerEmail ?? ""),
    });
    res.status(201).json(order);
  } catch (err) {
    handleError(err, res);
  }
}

export async function getOrderApi(req: Request, res: Response) {
  const order = await service.getOrder(req.params.id);
  if (!order) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(order);
}

export async function shipOrderApi(req: Request, res: Response) {
  try {
    res.json(await service.shipOrder(req.params.id));
  } catch (err) {
    handleError(err, res);
  }
}

export async function cancelOrderApi(req: Request, res: Response) {
  try {
    const body = (req.body ?? {}) as {
      reason?: unknown;
      cancellationReason?: unknown;
    };
    const reason = String(body.reason ?? body.cancellationReason ?? "");
    res.json(await service.cancelOrder(req.params.id, reason));
  } catch (err) {
    handleError(err, res);
  }
}

export async function listNotificationsApi(_req: Request, res: Response) {
  res.json(await service.listNotifications());
}

/** HTML views */
export async function homePage(_req: Request, res: Response) {
  const products = await service.listProducts();
  const rows = products
    .map(
      (p) =>
        `<tr><td>${p.id}</td><td>${p.name}</td><td>${p.priceCents}</td><td>${p.stock}</td>
         <td><a href="/products/${p.id}">View</a></td></tr>`
    )
    .join("");
  res.type("html").send(`<!doctype html><html><head><title>ShopFlow</title></head>
<body><h1>ShopFlow Catalog</h1>
<table border="1"><tr><th>ID</th><th>Name</th><th>Price</th><th>Stock</th><th></th></tr>${rows}</table>
<p><a href="/orders/new">Create order</a></p></body></html>`);
}

export async function productPage(req: Request, res: Response) {
  const product = await service.getProduct(req.params.id);
  if (!product) {
    res.status(404).send("Not found");
    return;
  }
  res.type("html").send(`<!doctype html><html><body>
<h1>${product.name}</h1>
<p>ID: ${product.id}</p>
<p>Price: ${product.priceCents} cents</p>
<p>Stock: ${product.stock}</p>
<p><a href="/">Back</a></p></body></html>`);
}

export async function newOrderPage(_req: Request, res: Response) {
  const products = await service.listProducts();
  const opts = products
    .map((p) => `<option value="${p.id}">${p.name} (stock ${p.stock})</option>`)
    .join("");
  res.type("html").send(`<!doctype html><html><body>
<h1>Create order</h1>
<form method="POST" action="/orders">
<label>Product <select name="productId">${opts}</select></label><br/>
<label>Quantity <input name="quantity" type="number" value="1" min="1"/></label><br/>
<label>Email <input name="customerEmail" type="email" required/></label><br/>
<button type="submit">Place order</button>
</form></body></html>`);
}

export async function createOrderForm(req: Request, res: Response) {
  try {
    const order = await service.createOrder({
      productId: String(req.body.productId),
      quantity: Number(req.body.quantity),
      customerEmail: String(req.body.customerEmail),
    });
    res.redirect(`/orders/${order.id}`);
  } catch (err) {
    const e = err as { message?: string };
    res.status(400).send(e.message ?? "Error");
  }
}

export async function orderPage(req: Request, res: Response) {
  const order = await service.getOrder(req.params.id);
  if (!order) {
    res.status(404).send("Not found");
    return;
  }
  const shipBtn =
    order.status === "CONFIRMED"
      ? `<form method="POST" action="/orders/${order.id}/ship"><button type="submit">Mark SHIPPED</button></form>`
      : "";
  const cancelForm =
    order.status === "CONFIRMED"
      ? `<form method="POST" action="/orders/${order.id}/cancel">
<label>Reason <input name="reason" maxlength="200" required/></label>
<button type="submit">Cancel order</button></form>`
      : "";
  res.type("html").send(`<!doctype html><html><body>
<h1>Order ${order.id}</h1>
<pre>${JSON.stringify(order, null, 2)}</pre>
${shipBtn}
${cancelForm}
<p><a href="/">Home</a></p></body></html>`);
}

export async function shipOrderForm(req: Request, res: Response) {
  try {
    await service.shipOrder(req.params.id);
    res.redirect(`/orders/${req.params.id}`);
  } catch (err) {
    const e = err as { message?: string };
    res.status(400).send(e.message ?? "Error");
  }
}

export async function cancelOrderForm(req: Request, res: Response) {
  try {
    const body = (req.body ?? {}) as { reason?: unknown };
    await service.cancelOrder(req.params.id, String(body.reason ?? ""));
    res.redirect(`/orders/${req.params.id}`);
  } catch (err) {
    const e = err as { message?: string };
    res.status(400).send(e.message ?? "Error");
  }
}
