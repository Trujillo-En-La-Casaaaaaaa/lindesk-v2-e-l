export type OrderStatus = "CONFIRMED" | "SHIPPED" | "CANCELLED";

export interface Product {
  id: string;
  name: string;
  priceCents: number;
  stock: number;
}

export interface Order {
  id: string;
  customerEmail: string;
  status: OrderStatus;
  productId: string;
  quantity: number;
  totalCents: number;
  createdAt: string;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
}

export interface NotificationRecord {
  id: string;
  type: "ORDER_CONFIRMATION" | "ORDER_CANCELLATION";
  orderId: string;
  createdAt: string;
  payload?: Record<string, unknown>;
}
