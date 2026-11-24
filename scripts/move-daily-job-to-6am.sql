-- La tarea diaria corre a las 06:00 de Argentina para todos los complejos.
-- La hora no se elige por complejo. Esta columna queda fija en 6.
-- No borra datos. El día de caja empieza a cortar a las 06:00.

UPDATE clubs SET daily_closure_hour = 6 WHERE daily_closure_hour = 3;
UPDATE clubs SET reservation_week_hour = 6 WHERE reservation_week_hour = 3;

ALTER TABLE clubs ALTER COLUMN daily_closure_hour SET DEFAULT 6;
ALTER TABLE clubs ALTER COLUMN reservation_week_hour SET DEFAULT 6;
