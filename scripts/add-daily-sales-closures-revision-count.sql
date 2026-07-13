-- Permite re-cierre: número de revisión por día.
-- Ejecutar en Supabase si ya corriste add-daily-sales-closures.sql.

ALTER TABLE daily_sales_closures
  ADD COLUMN IF NOT EXISTS revision_count INTEGER NOT NULL DEFAULT 1;
