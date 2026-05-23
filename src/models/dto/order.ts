// src/models/dto/order.ts
import { OrderDB, OrderItemDB, OrderStatus } from "../db/order";
import { ProductNestedDTO } from "./product";
import type { PlayerNestedDTO } from "./tournament";

// Order Item DTO with nested product
export interface OrderItemDTO extends Omit<OrderItemDB, "user_uid" | "order_id" | "product_id"> {
  product: ProductNestedDTO | null;
}

export interface OrderPaymentDTO {
  id: number;
  amount: number;
  created_at: string;
  payment_method_id: number | null;
  payment_method: { id: number; name: string } | null;
}

// Order DTO with nested player and items
export interface OrderDTO extends Omit<OrderDB, "user_uid" | "player_id"> {
  player: PlayerNestedDTO | null;
  items?: OrderItemDTO[];
  /** Pagos en dinero registrados (cuenta abierta o cerrada). */
  payments?: OrderPaymentDTO[];
  amount_paid?: number;
  balance_due?: number;
}

// Re-export status type
export type { OrderStatus };

