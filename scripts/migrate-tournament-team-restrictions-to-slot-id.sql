-- Reemplaza tournament_team_schedule_restrictions por la estructura con tournament_group_slot_id.
-- No se migran datos: las restricciones previas se pierden.
-- Ejecutar: psql -U <user> -d <database> -f scripts/migrate-tournament-team-restrictions-to-slot-id.sql

DROP TABLE IF EXISTS tournament_team_schedule_restrictions;

CREATE TABLE tournament_team_schedule_restrictions (
    id                          BIGSERIAL PRIMARY KEY,
    tournament_team_id           BIGINT NOT NULL REFERENCES tournament_teams(id) ON DELETE CASCADE,
    tournament_group_slot_id     BIGINT NOT NULL REFERENCES tournament_group_slots(id) ON DELETE CASCADE,
    can_play                    BOOLEAN NOT NULL DEFAULT true,
    user_uid                    UUID NOT NULL,
    created_at                  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tournament_team_id, tournament_group_slot_id)
);
CREATE INDEX idx_tournament_team_schedule_restrictions_slot ON tournament_team_schedule_restrictions(tournament_group_slot_id);
