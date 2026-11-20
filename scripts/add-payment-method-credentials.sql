-- Access token de Mercado Pago, cifrado, por medio de pago del complejo.
-- Correr en el editor de Supabase. No modifica tablas que ya existen.
-- El texto del token no se guarda: solo el cifrado. La clave vive en el servidor
-- (FINANCE_CREDENTIALS_KEY). Los usuarios de la app no pueden leer esta tabla.

CREATE TABLE IF NOT EXISTS payment_method_credentials (
    id                  BIGSERIAL PRIMARY KEY,
    club_id             BIGINT NOT NULL REFERENCES clubs(id),
    payment_method_id   BIGINT NOT NULL REFERENCES payment_methods(id),
    provider            TEXT NOT NULL DEFAULT 'mercadopago'
                        CHECK (provider IN ('mercadopago')),
    token_ciphertext    TEXT NOT NULL,
    token_iv            TEXT NOT NULL,
    token_tag           TEXT NOT NULL,
    key_version         SMALLINT NOT NULL DEFAULT 1,
    user_uid            UUID NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (payment_method_id, provider)
);

CREATE INDEX IF NOT EXISTS payment_method_credentials_club_idx
    ON payment_method_credentials (club_id);

ALTER TABLE payment_method_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS club_isolation ON payment_method_credentials;
CREATE POLICY club_isolation ON payment_method_credentials
    FOR ALL TO authenticated
    USING (public.can_access_club(club_id))
    WITH CHECK (public.can_access_club(club_id));

DROP TRIGGER IF EXISTS enforce_actor_club ON payment_method_credentials;
CREATE TRIGGER enforce_actor_club
    BEFORE INSERT OR UPDATE OR DELETE ON payment_method_credentials
    FOR EACH ROW EXECUTE FUNCTION public.enforce_actor_club();

REVOKE ALL ON payment_method_credentials FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON payment_method_credentials TO service_role;
REVOKE ALL ON SEQUENCE payment_method_credentials_id_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE payment_method_credentials_id_seq TO service_role;
