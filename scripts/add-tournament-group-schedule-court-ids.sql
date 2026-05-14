-- Opcional: ejecutar en DBs ya creadas antes de incluir group_schedule_court_ids en schema.sql
ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS group_schedule_court_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
