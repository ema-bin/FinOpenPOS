CREATE TABLE IF NOT EXISTS tournament_registration_notified (
    id              BIGSERIAL PRIMARY KEY,
    tournament_id   BIGINT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    player_id       BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    user_uid        UUID NOT NULL,
    notified_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tournament_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_tournament_registration_notified_tournament
    ON tournament_registration_notified(tournament_id);
