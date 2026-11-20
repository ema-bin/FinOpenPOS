-- Historial de tarifas de cancha.
-- Correr en el editor de Supabase. No borra tarifas.
-- Cada fila vigente queda abierta desde 1970-01-01.
-- Un cambio posterior cierra esa fila y abre otra con la fecha del cambio.

ALTER TABLE court_pricing
  ADD COLUMN IF NOT EXISTS valid_from DATE,
  ADD COLUMN IF NOT EXISTS valid_until DATE;

UPDATE court_pricing
SET valid_from = DATE '1970-01-01'
WHERE valid_from IS NULL;

ALTER TABLE court_pricing
  ALTER COLUMN valid_from SET NOT NULL;

ALTER TABLE court_pricing
  ALTER COLUMN valid_from SET DEFAULT DATE '1970-01-01';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM court_pricing WHERE club_id IS NULL) THEN
    RAISE EXCEPTION 'Hay tarifas sin complejo. Corré antes scripts/add-club-id.sql.';
  END IF;
END $$;

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'court_pricing'
    AND con.contype = 'u';
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE court_pricing DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'court_pricing_validity_check'
  ) THEN
    ALTER TABLE court_pricing
      ADD CONSTRAINT court_pricing_validity_check
      CHECK (valid_until IS NULL OR valid_until > valid_from);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS court_pricing_open_range_idx
  ON court_pricing (club_id, court_id, start_time, end_time)
  WHERE valid_until IS NULL;

CREATE INDEX IF NOT EXISTS court_pricing_court_validity_idx
  ON court_pricing (court_id, valid_from, valid_until);
