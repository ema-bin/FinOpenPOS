-- Marca manual de una fila de Mercado Pago. Correr en el editor de Supabase.
-- No asigna una cancha: solo guarda lo que una persona eligió cuando el cruce no es único.
-- Los usuarios de la app no leen esta tabla: el servidor la escribe con service role.

CREATE TABLE IF NOT EXISTS mp_settlement_matches (
    id                  BIGSERIAL PRIMARY KEY,
    club_id             BIGINT NOT NULL REFERENCES clubs(id),
    settlement_row_id   BIGINT NOT NULL REFERENCES mp_settlement_rows(id) ON DELETE CASCADE,
    kind                TEXT NOT NULL CHECK (kind IN ('court_seat', 'pack', 'yield', 'withdrawal', 'ignored')),
    court_slot_id       BIGINT,
    seat_index          SMALLINT CHECK (seat_index IS NULL OR seat_index BETWEEN 1 AND 4),
    pack_id             BIGINT,
    user_uid            UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (settlement_row_id)
);

CREATE INDEX IF NOT EXISTS mp_settlement_matches_club_idx
    ON mp_settlement_matches (club_id);

ALTER TABLE mp_settlement_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS club_isolation ON mp_settlement_matches;
CREATE POLICY club_isolation ON mp_settlement_matches
    FOR ALL TO authenticated
    USING (public.can_access_club(club_id))
    WITH CHECK (public.can_access_club(club_id));

DROP TRIGGER IF EXISTS enforce_actor_club ON mp_settlement_matches;
CREATE TRIGGER enforce_actor_club
    BEFORE INSERT OR UPDATE OR DELETE ON mp_settlement_matches
    FOR EACH ROW EXECUTE FUNCTION public.enforce_actor_club();

REVOKE ALL ON mp_settlement_matches FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON mp_settlement_matches TO service_role;
REVOKE ALL ON SEQUENCE mp_settlement_matches_id_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE mp_settlement_matches_id_seq TO service_role;
