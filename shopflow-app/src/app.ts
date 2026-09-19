import express from "express";
import {
  health,
  listProductsApi,
  getProductApi,
  createOrderApi,
  getOrderApi,
  shipOrderApi,
  cancelOrderApi,
  listNotificationsApi,
  homePage,
  productPage,
  newOrderPage,
  createOrderForm,
  orderPage,
  shipOrderForm,
  cancelOrderForm,
} from "./controllers/shopController.js";

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  app.get("/api/health", health);
  app.get("/api/products", listProductsApi);
  app.get("/api/products/:id", getProductApi);
  app.post("/api/orders", createOrderApi);
  app.get("/api/orders/:id", getOrderApi);
  app.post("/api/orders/:id/ship", shipOrderApi);
  app.post("/api/orders/:id/cancel", cancelOrderApi);
  app.get("/api/notifications", listNotificationsApi);

  app.get("/", homePage);
  app.get("/products/:id", productPage);
  app.get("/orders/new", newOrderPage);
  app.post("/orders", createOrderForm);
  app.get("/orders/:id", orderPage);
  app.post("/orders/:id/ship", shipOrderForm);
  app.post("/orders/:id/cancel", cancelOrderForm);

  return app;
}
