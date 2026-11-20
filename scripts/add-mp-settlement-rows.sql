-- Filas de las liquidaciones de Mercado Pago. Correr en el editor de Supabase.
-- Solo agrega tablas. Cada fila guarda el SOURCE_ID y el resto de las columnas del reporte.
-- Los usuarios de la app no leen estas tablas: el servidor las escribe con service role.

CREATE TABLE IF NOT EXISTS mp_settlement_reports (
    id                  BIGSERIAL PRIMARY KEY,
    club_id             BIGINT NOT NULL REFERENCES clubs(id),
    payment_method_id   BIGINT NOT NULL REFERENCES payment_methods(id),
    mp_report_id        TEXT,
    file_name           TEXT NOT NULL,
    begin_date          TIMESTAMPTZ,
    end_date            TIMESTAMPTZ,
    created_from        TEXT,
    user_uid            UUID,
    imported_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (club_id, payment_method_id, file_name)
);

CREATE TABLE IF NOT EXISTS mp_settlement_rows (
    id                      BIGSERIAL PRIMARY KEY,
    club_id                 BIGINT NOT NULL REFERENCES clubs(id),
    payment_method_id       BIGINT NOT NULL REFERENCES payment_methods(id),
    report_id               BIGINT NOT NULL REFERENCES mp_settlement_reports(id) ON DELETE CASCADE,
    source_id               TEXT,
    payment_method_type     TEXT,
    transaction_type        TEXT,
    transaction_amount      NUMERIC(17, 2),
    transaction_date        TIMESTAMPTZ,
    fee_amount              NUMERIC(17, 2),
    settlement_date         TIMESTAMPTZ,
    real_amount             NUMERIC(17, 2),
    taxes_amount            NUMERIC(17, 2),
    business_unit           TEXT,
    sub_unit                TEXT,
    money_release_date      TIMESTAMPTZ,
    row_fingerprint         TEXT NOT NULL,
    payload                 JSONB NOT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (club_id, payment_method_id, row_fingerprint)
);

CREATE INDEX IF NOT EXISTS mp_settlement_reports_club_idx
    ON mp_settlement_reports (club_id, payment_method_id);
CREATE INDEX IF NOT EXISTS mp_settlement_rows_source_idx
    ON mp_settlement_rows (club_id, payment_method_id, source_id);

ALTER TABLE mp_settlement_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE mp_settlement_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS club_isolation ON mp_settlement_reports;
CREATE POLICY club_isolation ON mp_settlement_reports
    FOR ALL TO authenticated
    USING (public.can_access_club(club_id))
    WITH CHECK (public.can_access_club(club_id));

DROP POLICY IF EXISTS club_isolation ON mp_settlement_rows;
CREATE POLICY club_isolation ON mp_settlement_rows
    FOR ALL TO authenticated
    USING (public.can_access_club(club_id))
    WITH CHECK (public.can_access_club(club_id));

DROP TRIGGER IF EXISTS enforce_actor_club ON mp_settlement_reports;
CREATE TRIGGER enforce_actor_club
    BEFORE INSERT OR UPDATE OR DELETE ON mp_settlement_reports
    FOR EACH ROW EXECUTE FUNCTION public.enforce_actor_club();

DROP TRIGGER IF EXISTS enforce_actor_club ON mp_settlement_rows;
CREATE TRIGGER enforce_actor_club
    BEFORE INSERT OR UPDATE OR DELETE ON mp_settlement_rows
    FOR EACH ROW EXECUTE FUNCTION public.enforce_actor_club();

REVOKE ALL ON mp_settlement_reports, mp_settlement_rows FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON mp_settlement_reports, mp_settlement_rows TO service_role;
REVOKE ALL ON SEQUENCE mp_settlement_reports_id_seq, mp_settlement_rows_id_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE mp_settlement_reports_id_seq, mp_settlement_rows_id_seq TO service_role;

-- La tabla puede existir de una corrida anterior, sin estas columnas.
ALTER TABLE mp_settlement_rows
    ADD COLUMN IF NOT EXISTS payment_method_type TEXT,
    ADD COLUMN IF NOT EXISTS transaction_type TEXT,
    ADD COLUMN IF NOT EXISTS transaction_amount NUMERIC(17, 2),
    ADD COLUMN IF NOT EXISTS transaction_date TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS fee_amount NUMERIC(17, 2),
    ADD COLUMN IF NOT EXISTS settlement_date TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS real_amount NUMERIC(17, 2),
    ADD COLUMN IF NOT EXISTS taxes_amount NUMERIC(17, 2),
    ADD COLUMN IF NOT EXISTS business_unit TEXT,
    ADD COLUMN IF NOT EXISTS sub_unit TEXT,
    ADD COLUMN IF NOT EXISTS money_release_date TIMESTAMPTZ;
