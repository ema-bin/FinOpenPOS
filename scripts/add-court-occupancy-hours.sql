-- Horario en el que se mide la ocupación de las canchas.
-- No cambia la grilla de turnos. El fin anterior al inicio cruza la medianoche.
-- PCP mide de 13:00 a 23:30. Otro complejo, si no elige horario, arranca con su apertura y su cierre.
-- Correr en dev y en prod.

ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS occupancy_start_time TIME,
  ADD COLUMN IF NOT EXISTS occupancy_end_time TIME;

UPDATE clubs
SET occupancy_start_time = open_time
WHERE occupancy_start_time IS NULL
  AND short_name <> 'PCP';

UPDATE clubs
SET occupancy_end_time = close_time
WHERE occupancy_end_time IS NULL
  AND short_name <> 'PCP';

UPDATE clubs
SET occupancy_start_time = TIME '13:00',
    occupancy_end_time = TIME '23:30'
WHERE short_name = 'PCP'
  AND (
    occupancy_start_time IS NULL
    OR occupancy_end_time IS NULL
    OR (occupancy_start_time = open_time AND occupancy_end_time = close_time)
  );

ALTER TABLE clubs
  ALTER COLUMN occupancy_start_time SET DEFAULT '10:00',
  ALTER COLUMN occupancy_end_time SET DEFAULT '01:00';
