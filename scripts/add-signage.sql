-- Cartelería digital. Correr en el editor de Supabase después de scripts/add-club-alta.sql.
-- Solo agrega tablas. No modifica datos ni tablas que ya existen.

CREATE TABLE IF NOT EXISTS signage_promotions (
    id              BIGSERIAL PRIMARY KEY,
    club_id         BIGINT NOT NULL REFERENCES clubs(id),
    user_uid        UUID NOT NULL,
    name            VARCHAR(120) NOT NULL,
    title           VARCHAR(160) NOT NULL DEFAULT '',
    description     TEXT,
    image_url       TEXT NOT NULL,
    price           NUMERIC(12, 2),
    highlight       VARCHAR(80),
    starts_on       DATE,
    ends_on         DATE,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    content_type    VARCHAR(20) NOT NULL DEFAULT 'full_image'
                    CHECK (content_type IN ('full_image', 'promo_card')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS signage_playlists (
    id              BIGSERIAL PRIMARY KEY,
    club_id         BIGINT NOT NULL REFERENCES clubs(id),
    user_uid        UUID NOT NULL,
    name            VARCHAR(120) NOT NULL,
    description     TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    transition      VARCHAR(10) NOT NULL DEFAULT 'fade'
                    CHECK (transition IN ('fade', 'cut')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS signage_playlist_items (
    id                  BIGSERIAL PRIMARY KEY,
    club_id             BIGINT NOT NULL REFERENCES clubs(id),
    playlist_id         BIGINT NOT NULL REFERENCES signage_playlists(id) ON DELETE CASCADE,
    promotion_id        BIGINT NOT NULL REFERENCES signage_promotions(id) ON DELETE CASCADE,
    position            INTEGER NOT NULL,
    duration_seconds    INTEGER NOT NULL DEFAULT 10 CHECK (duration_seconds BETWEEN 3 AND 180),
    UNIQUE (playlist_id, position),
    UNIQUE (playlist_id, promotion_id)
);

CREATE TABLE IF NOT EXISTS signage_screens (
    id                      BIGSERIAL PRIMARY KEY,
    club_id                 BIGINT NOT NULL REFERENCES clubs(id),
    user_uid                UUID NOT NULL,
    name                    VARCHAR(120) NOT NULL,
    slug                    VARCHAR(40) NOT NULL,
    location                VARCHAR(160),
    is_active               BOOLEAN NOT NULL DEFAULT TRUE,
    default_playlist_id     BIGINT REFERENCES signage_playlists(id) ON DELETE SET NULL,
    playback_token          TEXT NOT NULL UNIQUE,
    last_seen_at            TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (club_id, slug)
);

CREATE TABLE IF NOT EXISTS signage_schedules (
    id              BIGSERIAL PRIMARY KEY,
    club_id         BIGINT NOT NULL REFERENCES clubs(id),
    screen_id       BIGINT NOT NULL REFERENCES signage_screens(id) ON DELETE CASCADE,
    playlist_id     BIGINT NOT NULL REFERENCES signage_playlists(id) ON DELETE RESTRICT,
    name            VARCHAR(120) NOT NULL,
    weekdays        SMALLINT[] NOT NULL,
    start_time      TIME NOT NULL,
    end_time        TIME NOT NULL,
    starts_on       DATE,
    ends_on         DATE,
    priority        INTEGER NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT signage_schedules_weekdays_check CHECK (
        cardinality(weekdays) > 0
        AND weekdays <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::SMALLINT[]
    )
);

CREATE TABLE IF NOT EXISTS signage_overrides (
    id              BIGSERIAL PRIMARY KEY,
    club_id         BIGINT NOT NULL REFERENCES clubs(id),
    screen_id       BIGINT NOT NULL UNIQUE REFERENCES signage_screens(id) ON DELETE CASCADE,
    playlist_id     BIGINT NOT NULL REFERENCES signage_playlists(id) ON DELETE RESTRICT,
    ends_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS signage_promotions_club_idx ON signage_promotions (club_id);
CREATE INDEX IF NOT EXISTS signage_playlists_club_idx ON signage_playlists (club_id);
CREATE INDEX IF NOT EXISTS signage_screens_club_idx ON signage_screens (club_id);
CREATE INDEX IF NOT EXISTS signage_schedules_screen_idx ON signage_schedules (screen_id);

DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'signage_promotions',
        'signage_playlists',
        'signage_playlist_items',
        'signage_screens',
        'signage_schedules',
        'signage_overrides'
    ]
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('DROP POLICY IF EXISTS club_isolation ON %I', v_table);
        EXECUTE format(
            'CREATE POLICY club_isolation ON %I FOR ALL TO authenticated USING (public.can_access_club(club_id)) WITH CHECK (public.can_access_club(club_id))',
            v_table
        );
        EXECUTE format('DROP TRIGGER IF EXISTS enforce_actor_club ON %I', v_table);
        EXECUTE format(
            'CREATE TRIGGER enforce_actor_club BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION public.enforce_actor_club()',
            v_table
        );
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated, service_role', v_table);
    END LOOP;
END $$;

GRANT USAGE, SELECT ON SEQUENCE
    signage_promotions_id_seq,
    signage_playlists_id_seq,
    signage_playlist_items_id_seq,
    signage_screens_id_seq,
    signage_schedules_id_seq,
    signage_overrides_id_seq
TO authenticated, service_role;
