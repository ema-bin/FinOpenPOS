-- Fase 1: ficha del complejo y club en los roles.
-- Correr después de scripts/add-roles-permissions.sql.
-- No parte canchas, ventas ni el resto de las tablas.
-- Este complejo queda como el primer club. user_uid no se toca.

CREATE TABLE IF NOT EXISTS clubs (
    id                              BIGSERIAL PRIMARY KEY,
    name                            TEXT NOT NULL,
    short_name                      TEXT NOT NULL,
    logo_url                        TEXT,
    -- Tripletas HSL de Tailwind, sin hsl(): "142 60% 35%".
    primary_color                   TEXT NOT NULL DEFAULT '142 60% 35%',
    accent_color                    TEXT NOT NULL DEFAULT '20 80% 50%',
    on_primary_color                TEXT NOT NULL DEFAULT '0 0% 100%',
    timezone                        TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
    open_time                       TIME NOT NULL DEFAULT '10:00',
    close_time                      TIME NOT NULL DEFAULT '01:00',
    slot_duration_minutes           SMALLINT NOT NULL DEFAULT 90 CHECK (slot_duration_minutes BETWEEN 15 AND 240),
    overnight_slot                  BOOLEAN NOT NULL DEFAULT TRUE,
    fixed_weekdays                  SMALLINT[] NOT NULL DEFAULT ARRAY[1, 2, 3, 4, 5]::SMALLINT[],
    class_player_limit              SMALLINT NOT NULL DEFAULT 5 CHECK (class_player_limit BETWEEN 1 AND 30),
    registration_discount_percent   NUMERIC(5, 2) NOT NULL DEFAULT 20 CHECK (registration_discount_percent BETWEEN 0 AND 100),
    module_reservations             BOOLEAN NOT NULL DEFAULT TRUE,
    module_classes                  BOOLEAN NOT NULL DEFAULT TRUE,
    module_tournaments              BOOLEAN NOT NULL DEFAULT TRUE,
    module_packs                    BOOLEAN NOT NULL DEFAULT TRUE,
    module_buffet                   BOOLEAN NOT NULL DEFAULT TRUE,
    auto_daily_closure              BOOLEAN NOT NULL DEFAULT TRUE,
    daily_closure_hour              SMALLINT NOT NULL DEFAULT 3 CHECK (daily_closure_hour BETWEEN 0 AND 23),
    auto_reservation_week           BOOLEAN NOT NULL DEFAULT TRUE,
    reservation_week_weekday        SMALLINT NOT NULL DEFAULT 6 CHECK (reservation_week_weekday BETWEEN 0 AND 6),
    reservation_week_hour           SMALLINT NOT NULL DEFAULT 3 CHECK (reservation_week_hour BETWEEN 0 AND 23),
    is_active                       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT clubs_fixed_weekdays_check CHECK (
        cardinality(fixed_weekdays) >= 1
        AND fixed_weekdays <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::SMALLINT[]
    )
);

INSERT INTO clubs (name, short_name)
SELECT 'PCP', 'PCP'
WHERE NOT EXISTS (SELECT 1 FROM clubs);

ALTER TABLE roles ADD COLUMN IF NOT EXISTS club_id BIGINT REFERENCES clubs(id);
ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS club_id BIGINT REFERENCES clubs(id);

UPDATE roles
SET club_id = (SELECT id FROM clubs ORDER BY id LIMIT 1)
WHERE club_id IS NULL;

UPDATE user_roles
SET club_id = (SELECT id FROM clubs ORDER BY id LIMIT 1)
WHERE club_id IS NULL;

ALTER TABLE roles ALTER COLUMN club_id SET NOT NULL;
ALTER TABLE user_roles ALTER COLUMN club_id SET NOT NULL;

ALTER TABLE roles DROP CONSTRAINT IF EXISTS roles_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS roles_club_name_key ON roles (club_id, name);

DROP INDEX IF EXISTS idx_roles_single_system;
CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_single_system ON roles (club_id) WHERE is_system;

-- Quien hoy es Admin de sistema administra la plataforma, no un solo club.
CREATE TABLE IF NOT EXISTS platform_admins (
    user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO platform_admins (user_id)
SELECT ur.user_id
FROM user_roles ur
JOIN roles r ON r.id = ur.role_id
WHERE r.is_system
ON CONFLICT (user_id) DO NOTHING;

ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE clubs, platform_admins TO service_role;
GRANT USAGE, SELECT ON SEQUENCE clubs_id_seq TO service_role;
