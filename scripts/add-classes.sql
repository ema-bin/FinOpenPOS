-- Clases. Correr en el SQL editor de Supabase.
-- Idempotente. No borra turnos, jugadores ni caja.
--
-- Si el ALTER TYPE falla porque el editor manda todo en una sola transacción,
-- corré solo esa línea, confirmá, y volvé a correr el archivo.
-- Los medios pcp.clases.seba, pcp.clases.manu, pcp.clases.cintia y pcp.clases.efectivo
-- los crea la pantalla de Clases.

ALTER TYPE payment_scope ADD VALUE IF NOT EXISTS 'CLASSES';

CREATE TABLE IF NOT EXISTS class_professors (
    id                BIGSERIAL PRIMARY KEY,
    user_uid          UUID NOT NULL,
    name              VARCHAR(100) NOT NULL,
    phone             VARCHAR(30),
    payment_method_id BIGINT REFERENCES payment_methods(id),
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS class_professor_rates (
    id              BIGSERIAL PRIMARY KEY,
    user_uid        UUID NOT NULL,
    professor_id    BIGINT NOT NULL REFERENCES class_professors(id) ON DELETE CASCADE,
    weekly_count    SMALLINT NOT NULL CHECK (weekly_count >= 1),
    monthly_amount  NUMERIC(10, 2) NOT NULL CHECK (monthly_amount >= 0),
    UNIQUE (professor_id, weekly_count)
);

CREATE TABLE IF NOT EXISTS class_schedules (
    id                BIGSERIAL PRIMARY KEY,
    user_uid          UUID NOT NULL,
    professor_id      BIGINT NOT NULL REFERENCES class_professors(id),
    court_id          BIGINT NOT NULL REFERENCES courts(id),
    weekday           SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    start_time        TIME NOT NULL,
    duration_minutes  SMALLINT NOT NULL DEFAULT 60 CHECK (duration_minutes > 0),
    name              VARCHAR(100),
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS class_enrollments (
    id           BIGSERIAL PRIMARY KEY,
    user_uid     UUID NOT NULL,
    schedule_id  BIGINT NOT NULL REFERENCES class_schedules(id) ON DELETE CASCADE,
    player_id    BIGINT NOT NULL REFERENCES players(id),
    started_on   DATE NOT NULL DEFAULT CURRENT_DATE,
    ended_on     DATE,
    CHECK (ended_on IS NULL OR ended_on >= started_on)
);

CREATE UNIQUE INDEX IF NOT EXISTS class_enrollments_one_open
    ON class_enrollments (schedule_id, player_id)
    WHERE ended_on IS NULL;

CREATE TABLE IF NOT EXISTS class_sessions (
    id                 BIGSERIAL PRIMARY KEY,
    user_uid           UUID NOT NULL,
    schedule_id        BIGINT NOT NULL REFERENCES class_schedules(id) ON DELETE CASCADE,
    session_date       DATE NOT NULL,
    court_id           BIGINT NOT NULL REFERENCES courts(id),
    start_time         TIME NOT NULL,
    end_time           TIME NOT NULL,
    professor_id       BIGINT NOT NULL REFERENCES class_professors(id),
    status             VARCHAR(20) NOT NULL DEFAULT 'scheduled'
                         CHECK (status IN ('scheduled', 'cancelled')),
    roster_customized  BOOLEAN NOT NULL DEFAULT FALSE,
    detached           BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (schedule_id, session_date)
);

CREATE INDEX IF NOT EXISTS idx_class_sessions_date ON class_sessions (session_date);
CREATE INDEX IF NOT EXISTS idx_class_sessions_court_date ON class_sessions (court_id, session_date);

CREATE TABLE IF NOT EXISTS class_session_players (
    id         BIGSERIAL PRIMARY KEY,
    user_uid   UUID NOT NULL,
    session_id BIGINT NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
    player_id  BIGINT NOT NULL REFERENCES players(id),
    UNIQUE (session_id, player_id)
);

CREATE TABLE IF NOT EXISTS class_charges (
    id                 BIGSERIAL PRIMARY KEY,
    user_uid           UUID NOT NULL,
    player_id          BIGINT NOT NULL REFERENCES players(id),
    professor_id       BIGINT NOT NULL REFERENCES class_professors(id),
    year_month         CHAR(7) NOT NULL,
    weekly_count       SMALLINT NOT NULL CHECK (weekly_count >= 1),
    amount             NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
    professor_share    NUMERIC(10, 2),
    partners_share     NUMERIC(10, 2),
    emanuel_share      NUMERIC(10, 2),
    payment_method_id  BIGINT REFERENCES payment_methods(id),
    status             VARCHAR(20) NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'paid')),
    paid_at            TIMESTAMP,
    transaction_id     BIGINT REFERENCES transactions(id),
    UNIQUE (user_uid, player_id, professor_id, year_month)
);

CREATE INDEX IF NOT EXISTS idx_class_charges_month ON class_charges (year_month);

ALTER TABLE class_charges ADD COLUMN IF NOT EXISTS professor_share NUMERIC(10, 2);
ALTER TABLE class_charges ADD COLUMN IF NOT EXISTS partners_share NUMERIC(10, 2);
ALTER TABLE class_charges ADD COLUMN IF NOT EXISTS emanuel_share NUMERIC(10, 2);

CREATE TABLE IF NOT EXISTS class_month_closures (
    id            BIGSERIAL PRIMARY KEY,
    user_uid      UUID NOT NULL,
    professor_id  BIGINT NOT NULL REFERENCES class_professors(id),
    year_month    CHAR(7) NOT NULL,
    closed_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_uid, professor_id, year_month)
);

-- Si la tabla ya existía para el mes entero, pasa a un cierre por profesor.
ALTER TABLE class_month_closures ADD COLUMN IF NOT EXISTS professor_id BIGINT REFERENCES class_professors(id);
ALTER TABLE class_month_closures DROP CONSTRAINT IF EXISTS class_month_closures_user_uid_year_month_key;
DELETE FROM class_month_closures WHERE professor_id IS NULL;
ALTER TABLE class_month_closures ALTER COLUMN professor_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS class_month_closures_user_professor_month
    ON class_month_closures (user_uid, professor_id, year_month);

-- Alias o cuenta que se manda en el recordatorio. Se puede cambiar desde Profesores.
ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS account TEXT;
UPDATE payment_methods
SET account = name
WHERE name IN ('pcp.clases.seba', 'pcp.clases.manu')
  AND (account IS NULL OR btrim(account) = '');
