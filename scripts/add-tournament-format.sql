-- Formato del torneo.
-- standard: el de siempre (no cambia).
-- master: 8 parejas, 2 zonas de 4 todos contra todos, clasifican 2, semis cruzadas y final.
-- Otros formatos se agregan después, cada uno con su propia lógica y su propio valor.

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS format VARCHAR(20) NOT NULL DEFAULT 'standard';

ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_format_check;

UPDATE tournaments SET format = 'master' WHERE format = 'masters';
UPDATE tournaments SET format = 'standard' WHERE format IS NULL OR format = '';

ALTER TABLE tournaments
  ADD CONSTRAINT tournaments_format_check
  CHECK (format IN ('standard', 'master'));
