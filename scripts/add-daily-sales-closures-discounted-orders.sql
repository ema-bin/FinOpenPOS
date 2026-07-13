-- Agrega conteo de órdenes cerradas con descuento al cierre diario.
-- Ejecutar en Supabase si ya corriste add-daily-sales-closures.sql.

ALTER TABLE daily_sales_closures
  ADD COLUMN IF NOT EXISTS discounted_orders_count INTEGER NOT NULL DEFAULT 0;
