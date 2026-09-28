-- Flag: la pareja necesita jugar sus dos partidos de zona el mismo día y en horarios cercanos.
ALTER TABLE tournament_teams
  ADD COLUMN IF NOT EXISTS needs_same_day_close_matches BOOLEAN NOT NULL DEFAULT FALSE;
