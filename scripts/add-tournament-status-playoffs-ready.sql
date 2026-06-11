-- Nuevo estado: grupos finalizados, pendiente de generar playoffs.
ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_status_check;
ALTER TABLE tournaments ADD CONSTRAINT tournaments_status_check
  CHECK (status IN (
    'draft',
    'schedule_review',
    'in_progress',
    'playoffs_ready',
    'finished',
    'cancelled'
  ));
