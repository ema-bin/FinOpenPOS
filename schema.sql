-- =========================================================
-- RESET (para desarrollo)
-- =========================================================

DROP TABLE IF EXISTS class_month_closures;
DROP TABLE IF EXISTS class_charges;
DROP TABLE IF EXISTS class_session_players;
DROP TABLE IF EXISTS class_sessions;
DROP TABLE IF EXISTS class_enrollments;
DROP TABLE IF EXISTS class_schedules;
DROP TABLE IF EXISTS class_professor_rates;
DROP TABLE IF EXISTS class_professors;

DROP TABLE IF EXISTS user_roles;
DROP TABLE IF EXISTS role_permissions;
DROP TABLE IF EXISTS roles;
DROP TABLE IF EXISTS whatsapp_message_templates;
DROP TABLE IF EXISTS tournament_team_schedule_restrictions;
DROP TABLE IF EXISTS registration_pricing_settings;
DROP TABLE IF EXISTS tournament_registration_payments;
DROP TABLE IF EXISTS tournament_group_standings;
DROP TABLE IF EXISTS tournament_playoffs;
DROP TABLE IF EXISTS tournament_matches;
DROP TABLE IF EXISTS tournament_group_teams;
DROP TABLE IF EXISTS tournament_groups;
DROP TABLE IF EXISTS tournament_group_slots;
DROP TABLE IF EXISTS player_tournament_points;
DROP TABLE IF EXISTS tournament_ranking_point_rules;
DROP TABLE IF EXISTS tournament_teams;
DROP TABLE IF EXISTS tournaments;

DROP TABLE IF EXISTS monthly_sales_closure_days;
DROP TABLE IF EXISTS monthly_sales_closure_categories;
DROP TABLE IF EXISTS monthly_sales_closure_products;
DROP TABLE IF EXISTS monthly_sales_closure_payment_methods;
DROP TABLE IF EXISTS monthly_sales_closures;

DROP TABLE IF EXISTS daily_sales_closure_categories;
DROP TABLE IF EXISTS daily_sales_closure_products;
DROP TABLE IF EXISTS daily_sales_closure_payment_methods;
DROP TABLE IF EXISTS daily_sales_closures;

DROP TABLE IF EXISTS stock_movements;
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS court_slot_day_notes;

DROP FUNCTION IF EXISTS adjust_slot_credits(bigint, integer, text);
DROP FUNCTION IF EXISTS save_slot_pack_definition(bigint, text, integer, numeric, boolean);
DROP FUNCTION IF EXISTS grant_slot_pack(bigint, bigint, numeric, bigint, date, text);
DROP FUNCTION IF EXISTS grant_slot_pack(bigint, text, integer, numeric, bigint, date, text);
DROP FUNCTION IF EXISTS delete_court_slot(bigint);
DROP FUNCTION IF EXISTS save_court_slot(bigint, jsonb);
DROP FUNCTION IF EXISTS slot_credit_consume(bigint, bigint, smallint, text);
DROP FUNCTION IF EXISTS slot_credit_refund(bigint);
DROP FUNCTION IF EXISTS slot_credit_lock_balance(bigint);
DROP FUNCTION IF EXISTS slot_patch_bigint(jsonb, text, bigint);
DROP VIEW IF EXISTS slot_pack_balances;
DROP TABLE IF EXISTS slot_credit_movements;
DROP TABLE IF EXISTS player_slot_balances;
DROP TABLE IF EXISTS slot_packs;
DROP TABLE IF EXISTS slot_pack_definitions;

DROP TABLE IF EXISTS court_slots;
DROP TABLE IF EXISTS courts;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS partners;
DROP TABLE IF EXISTS players;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS product_categories;
DROP TABLE IF EXISTS payment_methods;
DROP TABLE IF EXISTS suppliers;
DROP TABLE IF EXISTS purchases;
DROP TABLE IF EXISTS purchase_items;

DROP TYPE IF EXISTS payment_scope;

-- =========================================================
-- PAYMENT METHODS (Efectivo / Transferencia / QR por usuario)
-- =========================================================

CREATE TYPE payment_scope AS ENUM ('BAR', 'COURT', 'BOTH', 'CLASSES');

CREATE TABLE payment_methods (
    id         BIGSERIAL PRIMARY KEY,
    user_uid   UUID NOT NULL,
    name       VARCHAR(50) NOT NULL,
    scope      payment_scope NOT NULL DEFAULT 'BAR', -- dónde se usa
    account    TEXT, -- alias o cuenta para mostrar en recordatorios
    is_active  BOOLEAN NOT NULL DEFAULT TRUE,
    consumes_slot_credit BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pm_unique_per_user UNIQUE (user_uid, name)
);

-- =========================================================
-- CATEGORIES (categorías estandarizadas: libre y damas)
-- =========================================================
-- Lista fija por tipo: libre (Principiantes, 8va...3ra) y damas (8va-7ma damas)

CREATE TABLE categories (
    id            SMALLSERIAL PRIMARY KEY,
    name          VARCHAR(50) NOT NULL UNIQUE,
    type          VARCHAR(10) NOT NULL CHECK (type IN ('libre', 'damas')),
    display_order SMALLINT NOT NULL DEFAULT 0,
    sum_value     SMALLINT,  -- para damas: valor para suma 13 (4ta=4, 5ta=5, 6ta=6, 7ma=7)
    CONSTRAINT categories_sum_value_range CHECK (sum_value IS NULL OR (sum_value >= 1 AND sum_value <= 10))
);

INSERT INTO categories (name, type, display_order, sum_value) VALUES
  ('Principiantes', 'libre', 1, NULL),
  ('8va', 'libre', 2, NULL),
  ('7ma', 'libre', 3, NULL),
  ('6ta', 'libre', 4, NULL),
  ('5ta', 'libre', 5, NULL),
  ('4ta', 'libre', 6, NULL),
  ('3ra', 'libre', 7, NULL),
  ('8va damas', 'damas', 0, NULL),
  ('7ma damas', 'damas', 1, 7),
  ('6ta damas', 'damas', 2, 6),
  ('5ta damas', 'damas', 3, 5),
  ('4ta damas', 'damas', 4, 4),
  ('Suma 13 damas', 'damas', 5, NULL);

-- =========================================================
-- PLAYERS (jugadores / clientes del buffet / alumnos)
-- =========================================================
-- Versión unificada de "personas"
-- Obligatorios: first_name, last_name, phone
-- El resto opcional

CREATE TABLE players (
    id                  BIGSERIAL PRIMARY KEY,
    user_uid            UUID NOT NULL,

    first_name          VARCHAR(255) NOT NULL,
    last_name           VARCHAR(255) NOT NULL,
    phone               VARCHAR(30)  NOT NULL,

    email               VARCHAR(255),
    gender              VARCHAR(20),
    city                VARCHAR(100),

    category_id         SMALLINT REFERENCES categories(id),
    female_category_id  SMALLINT REFERENCES categories(id),

    notes               TEXT,

    status              VARCHAR(20) NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'inactive')),

    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================
-- ADVERTISEMENTS (publicidades para flyers)
-- =========================================================

CREATE TABLE advertisements (
    id          BIGSERIAL PRIMARY KEY,
    user_uid    UUID NOT NULL,
    name        VARCHAR(255) NOT NULL,
    image_url   TEXT NOT NULL,
    target_url  TEXT,
    description TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    ordering    INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================
-- PARTNERS (dueños/propietarios de la sociedad)
-- =========================================================
-- Tabla para gestionar los partners (dueños del negocio en una sociedad)
-- Los partners se crean y editan directamente desde la base de datos
-- La aplicación solo permite lectura

CREATE TABLE partners (
    id               BIGSERIAL PRIMARY KEY,
    user_uid         UUID NOT NULL,

    first_name       VARCHAR(255) NOT NULL,
    last_name        VARCHAR(255) NOT NULL,
    phone            VARCHAR(30)  NOT NULL,

    email            VARCHAR(255),
    notes            TEXT,

    status           VARCHAR(20) NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'inactive')),

    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================
-- PRODUCT CATEGORIES
-- =========================================================

CREATE TABLE product_categories (
    id          BIGSERIAL PRIMARY KEY,
    user_uid    UUID NOT NULL,
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    color       VARCHAR(20),   -- opcional, para mostrar en la UI
    is_sellable BOOLEAN NOT NULL DEFAULT TRUE, -- si los productos de esta categoría se venden
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    is_cantina_revenue BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT product_categories_unique_per_user UNIQUE (user_uid, name)
);

-- =========================================================
-- PRODUCTS (buffet / tienda)
-- =========================================================

CREATE TABLE products (
    id             BIGSERIAL PRIMARY KEY,
    user_uid       UUID NOT NULL,
    category_id    BIGINT REFERENCES product_categories(id),
    name           VARCHAR(255) NOT NULL,
    description    TEXT,
    price          NUMERIC(10, 2) NOT NULL,
    uses_stock     BOOLEAN NOT NULL DEFAULT TRUE,     -- si descuenta stock
    min_stock      INTEGER NOT NULL DEFAULT 0,        -- para alertas
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================
-- ORDERS (cuentas de buffet por persona)
-- =========================================================

CREATE TABLE orders (
    id           BIGSERIAL PRIMARY KEY,
    user_uid     UUID NOT NULL,
    player_id    BIGINT NOT NULL REFERENCES players(id),

    status       VARCHAR(20) NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open', 'closed', 'cancelled')),

    total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
    discount_percentage NUMERIC(5, 2) DEFAULT 0 CHECK (discount_percentage >= 0 AND discount_percentage <= 100),
    discount_amount NUMERIC(10, 2) DEFAULT 0 CHECK (discount_amount >= 0),
    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at    TIMESTAMP
);

-- =========================================================
-- ORDER_ITEMS (consumos en buffet)
-- =========================================================

CREATE TABLE order_items (
    id           BIGSERIAL PRIMARY KEY,
    user_uid     UUID NOT NULL,
    order_id     BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id   BIGINT NOT NULL REFERENCES products(id),
    quantity     INTEGER NOT NULL CHECK (quantity > 0),
    unit_price   NUMERIC(10, 2) NOT NULL,
    total_price  NUMERIC(10, 2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Estadísticas de ventas por producto (solo órdenes cerradas; evita límite de filas)
CREATE OR REPLACE FUNCTION order_sales_statistics(
  p_from_date   TIMESTAMPTZ DEFAULT NULL,
  p_to_date     TIMESTAMPTZ DEFAULT NULL,
  p_product_id  BIGINT DEFAULT NULL,
  p_category_id BIGINT DEFAULT NULL
)
RETURNS TABLE (
  product_id     BIGINT,
  product_name   TEXT,
  category_id    BIGINT,
  category_name  TEXT,
  total_quantity BIGINT,
  total_amount   NUMERIC
) AS $$
  SELECT
    p.id,
    p.name,
    c.id,
    c.name,
    SUM(oi.quantity)::BIGINT,
    COALESCE(SUM(oi.total_price), 0) AS total_amount
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id AND o.status = 'closed'
  JOIN products p ON p.id = oi.product_id
  LEFT JOIN product_categories c ON c.id = p.category_id
  WHERE (p_from_date IS NULL OR oi.created_at >= p_from_date)
    AND (p_to_date   IS NULL OR oi.created_at <= p_to_date)
    AND (p_product_id IS NULL OR p.id = p_product_id)
    AND (p_category_id IS NULL OR p.category_id = p_category_id)
  GROUP BY p.id, p.name, c.id, c.name
  ORDER BY 6 DESC NULLS LAST;
$$ LANGUAGE SQL STABLE;

-- Ranking de clientes por monto total (solo órdenes cerradas; excluye player_id = 1; evita límite de filas)
CREATE OR REPLACE FUNCTION client_ranking_statistics(
  p_from_date TIMESTAMPTZ DEFAULT NULL,
  p_to_date   TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  player_id    BIGINT,
  player_name  TEXT,
  total_amount NUMERIC,
  order_count  BIGINT
) AS $$
  SELECT
    pl.id,
    TRIM(pl.first_name || ' ' || pl.last_name),
    COALESCE(SUM(o.total_amount), 0) AS total_amount,
    COUNT(*)::BIGINT
  FROM orders o
  JOIN players pl ON pl.id = o.player_id
  WHERE o.status = 'closed'
    AND o.player_id != 1
    AND (p_from_date IS NULL OR o.closed_at >= p_from_date)
    AND (p_to_date   IS NULL OR o.closed_at <= p_to_date)
  GROUP BY pl.id, pl.first_name, pl.last_name
  ORDER BY 3 DESC NULLS LAST;
$$ LANGUAGE SQL STABLE;

-- =========================================================
-- COURTS (canchas de pádel)
-- =========================================================

CREATE TABLE courts (
    id        BIGSERIAL PRIMARY KEY,
    user_uid  UUID NOT NULL,
    name      VARCHAR(50) NOT NULL,        -- 'Cancha 1', 'Cancha 2', etc.
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- =========================================================
-- COURT_SLOTS (turnos fijos – siempre 4 jugadores)
-- Solo indica si se usó el turno y cómo pagó cada jugador.
-- =========================================================

CREATE TABLE court_slots (
    id          BIGSERIAL PRIMARY KEY,
    user_uid    UUID NOT NULL,
    court_id    BIGINT NOT NULL REFERENCES courts(id),
    slot_date   DATE NOT NULL,             -- día del turno
    start_time  TIME NOT NULL,             -- ej: 13:00
    end_time    TIME NOT NULL,             -- ej: 14:30

    was_played  BOOLEAN NOT NULL DEFAULT FALSE,
    notes       TEXT,

    -- Jugador 1
    player1_payment_method_id BIGINT REFERENCES payment_methods(id),
    player1_note              TEXT,

    -- Jugador 2
    player2_payment_method_id BIGINT REFERENCES payment_methods(id),
    player2_note              TEXT,

    -- Jugador 3
    player3_payment_method_id BIGINT REFERENCES payment_methods(id),
    player3_note              TEXT,

    -- Jugador 4
    player4_payment_method_id BIGINT REFERENCES payment_methods(id),
    player4_note              TEXT,
    player1_id                BIGINT REFERENCES players(id),
    player2_id                BIGINT REFERENCES players(id),
    player3_id                BIGINT REFERENCES players(id),
    player4_id                BIGINT REFERENCES players(id),

    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================
-- COURT_SLOT_DAY_NOTES (notas globales por día)
-- =========================================================

CREATE TABLE court_slot_day_notes (
    id          BIGSERIAL PRIMARY KEY,
    user_uid    UUID NOT NULL,
    slot_date   DATE NOT NULL,             -- día de las notas
    notes       TEXT,                      -- notas globales del día
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_uid, slot_date)
);

-- =========================================================
-- COURT_PRICING (precios por cancha y horario)
-- =========================================================

CREATE TABLE court_pricing (
    id              BIGSERIAL PRIMARY KEY,
    user_uid        UUID NOT NULL,
    court_id        BIGINT NOT NULL REFERENCES courts(id) ON DELETE CASCADE,
    start_time      TIME NOT NULL,             -- hora de inicio del rango (ej: 13:00)
    end_time        TIME NOT NULL,             -- hora de fin del rango (ej: 19:00)
    price_per_player NUMERIC(10, 2) NOT NULL CHECK (price_per_player >= 0),
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_uid, court_id, start_time, end_time)
);

CREATE INDEX idx_court_pricing_court_id ON court_pricing(court_id);
CREATE INDEX idx_court_pricing_time_range ON court_pricing(start_time, end_time);

CREATE TABLE slot_pack_definitions (
  id          BIGSERIAL PRIMARY KEY,
  user_uid    UUID NOT NULL,
  name        TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  credits     INTEGER NOT NULL CHECK (credits > 0),
  price       NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX slot_pack_definitions_name_idx
  ON slot_pack_definitions (lower(btrim(name)));

CREATE TABLE slot_packs (
  id                 BIGSERIAL PRIMARY KEY,
  user_uid           UUID NOT NULL,
  player_id          BIGINT NOT NULL REFERENCES players(id),
  definition_id      BIGINT REFERENCES slot_pack_definitions(id),
  name               TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  credits            INTEGER NOT NULL CHECK (credits > 0),
  amount_paid        NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  payment_method_id  BIGINT REFERENCES payment_methods(id),
  sold_at            DATE NOT NULL DEFAULT CURRENT_DATE,
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX slot_packs_player_idx ON slot_packs(player_id, sold_at, id);

CREATE TABLE player_slot_balances (
  player_id   BIGINT PRIMARY KEY REFERENCES players(id),
  user_uid    UUID NOT NULL,
  balance     INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE slot_credit_movements (
  id                    BIGSERIAL PRIMARY KEY,
  user_uid              UUID NOT NULL,
  player_id             BIGINT NOT NULL REFERENCES players(id),
  pack_id               BIGINT REFERENCES slot_packs(id),
  court_slot_id         BIGINT REFERENCES court_slots(id) ON DELETE SET NULL,
  seat                  SMALLINT CHECK (seat IS NULL OR seat BETWEEN 1 AND 4),
  kind                  TEXT NOT NULL CHECK (kind IN ('grant', 'consume', 'refund', 'adjustment')),
  delta                 INTEGER NOT NULL CHECK (delta <> 0),
  status                TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reversed')),
  reverses_movement_id  BIGINT REFERENCES slot_credit_movements(id),
  slot_label            TEXT,
  reason                TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT slot_credit_movements_delta_kind CHECK (
    (kind = 'grant' AND delta > 0)
    OR (kind = 'consume' AND delta = -1)
    OR (kind = 'refund' AND delta = 1)
    OR (kind = 'adjustment' AND delta <> 0)
  )
);

CREATE INDEX slot_credit_movements_player_idx
  ON slot_credit_movements(player_id, created_at DESC);

CREATE INDEX slot_credit_movements_slot_idx
  ON slot_credit_movements(court_slot_id);

CREATE INDEX slot_credit_movements_pack_idx
  ON slot_credit_movements(pack_id)
  WHERE pack_id IS NOT NULL;

CREATE UNIQUE INDEX slot_credit_one_open_seat
  ON slot_credit_movements(court_slot_id, seat)
  WHERE kind = 'consume' AND status = 'open';

CREATE OR REPLACE VIEW slot_pack_balances AS
SELECT
  sp.id,
  sp.player_id,
  sp.user_uid,
  sp.name,
  sp.credits,
  sp.amount_paid,
  sp.payment_method_id,
  sp.sold_at,
  sp.notes,
  sp.created_at,
  sp.credits + COALESCE((
    SELECT SUM(m.delta)
    FROM slot_credit_movements m
    WHERE m.pack_id = sp.id
      AND m.kind IN ('consume', 'refund')
  ), 0)::integer AS remaining
FROM slot_packs sp;

CREATE OR REPLACE FUNCTION slot_patch_bigint(p_patch jsonb, p_key text, p_current bigint)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
AS $
  SELECT CASE
    WHEN p_patch ? p_key THEN NULLIF(p_patch ->> p_key, '')::bigint
    ELSE p_current
  END;
$;

CREATE OR REPLACE FUNCTION slot_credit_lock_balance(p_player_id bigint)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $
DECLARE
  v_balance integer;
BEGIN
  INSERT INTO player_slot_balances (player_id, user_uid, balance)
  SELECT p.id, p.user_uid, 0
  FROM players p
  WHERE p.id = p_player_id
  ON CONFLICT (player_id) DO NOTHING;

  SELECT balance
  INTO v_balance
  FROM player_slot_balances
  WHERE player_id = p_player_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SLOT_CREDIT:Jugador inexistente';
  END IF;

  RETURN v_balance;
END;
$;

CREATE OR REPLACE FUNCTION slot_credit_refund(p_movement_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $
DECLARE
  v_row slot_credit_movements%ROWTYPE;
  v_actor uuid;
BEGIN
  v_actor := auth.uid();

  UPDATE slot_credit_movements
  SET status = 'reversed'
  WHERE id = p_movement_id
    AND kind = 'consume'
    AND status = 'open'
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  INSERT INTO slot_credit_movements (
    user_uid, player_id, pack_id, court_slot_id, seat, kind, delta, status,
    reverses_movement_id, slot_label, reason
  ) VALUES (
    COALESCE(v_actor, v_row.user_uid),
    v_row.player_id,
    v_row.pack_id,
    v_row.court_slot_id,
    v_row.seat,
    'refund',
    1,
    'open',
    v_row.id,
    v_row.slot_label,
    NULL
  );

  UPDATE player_slot_balances
  SET balance = balance + 1,
      updated_at = now()
  WHERE player_id = v_row.player_id;
END;
$;

CREATE OR REPLACE FUNCTION slot_credit_consume(
  p_player_id bigint,
  p_slot_id bigint,
  p_seat smallint,
  p_label text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $
DECLARE
  v_pack_id bigint;
  v_actor uuid;
  v_updated integer;
BEGIN
  v_actor := auth.uid();

  UPDATE player_slot_balances
  SET balance = balance - 1,
      updated_at = now()
  WHERE player_id = p_player_id
    AND balance >= 1;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'SLOT_CREDIT:El jugador no tiene créditos disponibles';
  END IF;

  SELECT sp.id
  INTO v_pack_id
  FROM slot_packs sp
  WHERE sp.player_id = p_player_id
    AND sp.credits + COALESCE((
      SELECT SUM(m.delta)
      FROM slot_credit_movements m
      WHERE m.pack_id = sp.id
        AND m.kind IN ('consume', 'refund')
    ), 0) > 0
  ORDER BY sp.sold_at, sp.id
  LIMIT 1;

  INSERT INTO slot_credit_movements (
    user_uid, player_id, pack_id, court_slot_id, seat, kind, delta, status, slot_label
  ) VALUES (
    COALESCE(v_actor, (SELECT user_uid FROM players WHERE id = p_player_id)),
    p_player_id,
    v_pack_id,
    p_slot_id,
    p_seat,
    'consume',
    -1,
    'open',
    p_label
  );
END;
$;

CREATE OR REPLACE FUNCTION save_court_slot(p_slot_id bigint, p_patch jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $
DECLARE
  v_slot court_slots%ROWTYPE;
  v_was_played boolean;
  v_notes text;
  v_method_ids bigint[];
  v_player_ids bigint[];
  v_player_notes text[];
  v_seat integer;
  v_consumes boolean;
  v_open record;
  v_kept boolean[];
  v_refund_ids bigint[] := ARRAY[]::bigint[];
  v_refund_players bigint[] := ARRAY[]::bigint[];
  v_consume_players bigint[] := ARRAY[]::bigint[];
  v_lock_ids bigint[];
  v_pid bigint;
  v_label text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'SLOT_CREDIT:No hay datos para guardar';
  END IF;

  SELECT *
  INTO v_slot
  FROM court_slots
  WHERE id = p_slot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Court slot not found';
  END IF;

  v_was_played := CASE
    WHEN p_patch ? 'was_played' THEN (p_patch ->> 'was_played')::boolean
    ELSE v_slot.was_played
  END;
  v_notes := CASE
    WHEN p_patch ? 'notes' THEN p_patch ->> 'notes'
    ELSE v_slot.notes
  END;

  v_method_ids := ARRAY[
    slot_patch_bigint(p_patch, 'player1_payment_method_id', v_slot.player1_payment_method_id),
    slot_patch_bigint(p_patch, 'player2_payment_method_id', v_slot.player2_payment_method_id),
    slot_patch_bigint(p_patch, 'player3_payment_method_id', v_slot.player3_payment_method_id),
    slot_patch_bigint(p_patch, 'player4_payment_method_id', v_slot.player4_payment_method_id)
  ];
  v_player_ids := ARRAY[
    slot_patch_bigint(p_patch, 'player1_id', v_slot.player1_id),
    slot_patch_bigint(p_patch, 'player2_id', v_slot.player2_id),
    slot_patch_bigint(p_patch, 'player3_id', v_slot.player3_id),
    slot_patch_bigint(p_patch, 'player4_id', v_slot.player4_id)
  ];
  v_player_notes := ARRAY[
    CASE WHEN p_patch ? 'player1_note' THEN p_patch ->> 'player1_note' ELSE v_slot.player1_note END,
    CASE WHEN p_patch ? 'player2_note' THEN p_patch ->> 'player2_note' ELSE v_slot.player2_note END,
    CASE WHEN p_patch ? 'player3_note' THEN p_patch ->> 'player3_note' ELSE v_slot.player3_note END,
    CASE WHEN p_patch ? 'player4_note' THEN p_patch ->> 'player4_note' ELSE v_slot.player4_note END
  ];

  IF NOT v_was_played THEN
    v_method_ids := ARRAY[NULL, NULL, NULL, NULL]::bigint[];
    v_player_ids := ARRAY[NULL, NULL, NULL, NULL]::bigint[];
  END IF;

  FOR v_seat IN 1..4 LOOP
    IF v_method_ids[v_seat] IS NULL THEN
      v_player_ids[v_seat] := NULL;
      CONTINUE;
    END IF;

    SELECT consumes_slot_credit
    INTO v_consumes
    FROM payment_methods
    WHERE id = v_method_ids[v_seat];

    IF NOT FOUND THEN
      RAISE EXCEPTION 'SLOT_CREDIT:El medio de pago no existe';
    END IF;

    IF COALESCE(v_consumes, FALSE) THEN
      IF v_player_ids[v_seat] IS NULL THEN
        RAISE EXCEPTION 'SLOT_CREDIT:Elegí un jugador con créditos';
      END IF;
    ELSE
      v_player_ids[v_seat] := NULL;
    END IF;
  END LOOP;

  v_kept := ARRAY[FALSE, FALSE, FALSE, FALSE];

  FOR v_open IN
    SELECT id, player_id, seat
    FROM slot_credit_movements
    WHERE court_slot_id = p_slot_id
      AND kind = 'consume'
      AND status = 'open'
    ORDER BY id
    FOR UPDATE
  LOOP
    IF v_open.seat BETWEEN 1 AND 4
       AND v_player_ids[v_open.seat] IS NOT DISTINCT FROM v_open.player_id THEN
      v_kept[v_open.seat] := TRUE;
    ELSE
      v_refund_ids := v_refund_ids || v_open.id;
      v_refund_players := v_refund_players || v_open.player_id;
    END IF;
  END LOOP;

  FOR v_seat IN 1..4 LOOP
    IF v_player_ids[v_seat] IS NOT NULL AND NOT COALESCE(v_kept[v_seat], FALSE) THEN
      v_consume_players := v_consume_players || v_player_ids[v_seat];
    END IF;
  END LOOP;

  SELECT ARRAY(
    SELECT DISTINCT x
    FROM (
      SELECT unnest(v_refund_players) AS x
      UNION
      SELECT unnest(v_consume_players)
    ) ids
    WHERE x IS NOT NULL
    ORDER BY x
  )
  INTO v_lock_ids;

  IF v_lock_ids IS NOT NULL THEN
    FOREACH v_pid IN ARRAY v_lock_ids LOOP
      PERFORM slot_credit_lock_balance(v_pid);
    END LOOP;
  END IF;

  IF v_refund_ids IS NOT NULL THEN
    FOREACH v_pid IN ARRAY v_refund_ids LOOP
      PERFORM slot_credit_refund(v_pid);
    END LOOP;
  END IF;

  SELECT c.name
    || ' · '
    || to_char(v_slot.slot_date, 'DD/MM/YYYY')
    || ' · '
    || to_char(v_slot.start_time, 'HH24:MI')
    || '-'
    || to_char(v_slot.end_time, 'HH24:MI')
  INTO v_label
  FROM courts c
  WHERE c.id = v_slot.court_id;

  FOR v_seat IN 1..4 LOOP
    IF v_player_ids[v_seat] IS NOT NULL AND NOT COALESCE(v_kept[v_seat], FALSE) THEN
      PERFORM slot_credit_consume(v_player_ids[v_seat], p_slot_id, v_seat::smallint, v_label);
    END IF;
  END LOOP;

  UPDATE court_slots
  SET
    was_played = v_was_played,
    notes = v_notes,
    player1_payment_method_id = v_method_ids[1],
    player2_payment_method_id = v_method_ids[2],
    player3_payment_method_id = v_method_ids[3],
    player4_payment_method_id = v_method_ids[4],
    player1_id = v_player_ids[1],
    player2_id = v_player_ids[2],
    player3_id = v_player_ids[3],
    player4_id = v_player_ids[4],
    player1_note = v_player_notes[1],
    player2_note = v_player_notes[2],
    player3_note = v_player_notes[3],
    player4_note = v_player_notes[4]
  WHERE id = p_slot_id;
END;
$;

CREATE OR REPLACE FUNCTION delete_court_slot(p_slot_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM court_slots WHERE id = p_slot_id) THEN
    RAISE EXCEPTION 'Court slot not found';
  END IF;

  PERFORM save_court_slot(p_slot_id, jsonb_build_object('was_played', false));
  DELETE FROM court_slots WHERE id = p_slot_id;
END;
$;

DROP FUNCTION IF EXISTS grant_slot_pack(bigint, text, integer, numeric, bigint, date, text);

CREATE OR REPLACE FUNCTION grant_slot_pack(
  p_player_id bigint,
  p_definition_id bigint,
  p_amount_paid numeric,
  p_payment_method_id bigint,
  p_sold_at date,
  p_notes text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pack_id bigint;
  v_actor uuid;
  v_definition slot_pack_definitions%ROWTYPE;
  v_amount numeric;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT *
  INTO v_definition
  FROM slot_pack_definitions
  WHERE id = p_definition_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SLOT_CREDIT:Elegí un pack';
  END IF;
  IF NOT v_definition.is_active THEN
    RAISE EXCEPTION 'SLOT_CREDIT:Ese pack no está activo';
  END IF;

  v_amount := COALESCE(p_amount_paid, v_definition.price, 0);
  IF v_amount < 0 THEN
    RAISE EXCEPTION 'SLOT_CREDIT:El importe del pack no puede ser negativo';
  END IF;
  IF p_payment_method_id IS NULL THEN
    RAISE EXCEPTION 'SLOT_CREDIT:Elegí cómo lo pagó';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM payment_methods WHERE id = p_payment_method_id) THEN
    RAISE EXCEPTION 'SLOT_CREDIT:El medio de pago no existe';
  END IF;
  IF EXISTS (
    SELECT 1 FROM payment_methods
    WHERE id = p_payment_method_id AND consumes_slot_credit
  ) THEN
    RAISE EXCEPTION 'SLOT_CREDIT:El pack se cobra con un medio que no usa créditos';
  END IF;

  PERFORM slot_credit_lock_balance(p_player_id);

  INSERT INTO slot_packs (
    user_uid, player_id, definition_id, name, credits, amount_paid, payment_method_id, sold_at, notes
  ) VALUES (
    v_actor,
    p_player_id,
    v_definition.id,
    v_definition.name,
    v_definition.credits,
    v_amount,
    p_payment_method_id,
    COALESCE(p_sold_at, CURRENT_DATE),
    NULLIF(btrim(COALESCE(p_notes, '')), '')
  )
  RETURNING id INTO v_pack_id;

  INSERT INTO slot_credit_movements (
    user_uid, player_id, pack_id, kind, delta, status, reason
  ) VALUES (
    v_actor, p_player_id, v_pack_id, 'grant', v_definition.credits, 'open', NULL
  );

  UPDATE player_slot_balances
  SET balance = balance + v_definition.credits,
      updated_at = now()
  WHERE player_id = p_player_id;

  RETURN v_pack_id;
END;
$$;

CREATE OR REPLACE FUNCTION save_slot_pack_definition(
  p_id bigint,
  p_name text,
  p_credits integer,
  p_price numeric,
  p_is_active boolean
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_name text;
  v_id bigint;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_name := btrim(COALESCE(p_name, ''));
  IF v_name = '' THEN
    RAISE EXCEPTION 'SLOT_CREDIT:El pack necesita un nombre';
  END IF;
  IF p_credits IS NULL OR p_credits <= 0 THEN
    RAISE EXCEPTION 'SLOT_CREDIT:Los turnos del pack tienen que ser mayores a cero';
  END IF;
  IF COALESCE(p_price, 0) < 0 THEN
    RAISE EXCEPTION 'SLOT_CREDIT:El precio del pack no puede ser negativo';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM slot_pack_definitions
    WHERE lower(btrim(name)) = lower(v_name)
      AND (p_id IS NULL OR id <> p_id)
  ) THEN
    RAISE EXCEPTION 'SLOT_CREDIT:Ya existe un pack con ese nombre';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO slot_pack_definitions (user_uid, name, credits, price, is_active)
    VALUES (v_actor, v_name, p_credits, COALESCE(p_price, 0), COALESCE(p_is_active, TRUE))
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  UPDATE slot_pack_definitions
  SET
    name = v_name,
    credits = p_credits,
    price = COALESCE(p_price, 0),
    is_active = COALESCE(p_is_active, TRUE)
  WHERE id = p_id
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'SLOT_CREDIT:No se encontró el pack';
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION adjust_slot_credits(
  p_player_id bigint,
  p_delta integer,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $
DECLARE
  v_actor uuid;
  v_reason text;
  v_balance integer;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_reason := btrim(COALESCE(p_reason, ''));
  IF v_reason = '' THEN
    RAISE EXCEPTION 'SLOT_CREDIT:El motivo del ajuste es obligatorio';
  END IF;
  IF p_delta IS NULL OR p_delta = 0 THEN
    RAISE EXCEPTION 'SLOT_CREDIT:El ajuste tiene que cambiar el saldo';
  END IF;

  v_balance := slot_credit_lock_balance(p_player_id);
  IF v_balance + p_delta < 0 THEN
    RAISE EXCEPTION 'SLOT_CREDIT:No se puede dejar el saldo en negativo';
  END IF;

  INSERT INTO slot_credit_movements (
    user_uid, player_id, kind, delta, status, reason
  ) VALUES (
    v_actor, p_player_id, 'adjustment', p_delta, 'open', v_reason
  );

  UPDATE player_slot_balances
  SET balance = balance + p_delta,
      updated_at = now()
  WHERE player_id = p_player_id;
END;
$;

REVOKE ALL ON FUNCTION slot_patch_bigint(jsonb, text, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION slot_credit_lock_balance(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION slot_credit_refund(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION slot_credit_consume(bigint, bigint, smallint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION save_court_slot(bigint, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION delete_court_slot(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION grant_slot_pack(bigint, text, integer, numeric, bigint, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION grant_slot_pack(bigint, bigint, numeric, bigint, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION save_slot_pack_definition(bigint, text, integer, numeric, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION adjust_slot_credits(bigint, integer, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION save_court_slot(bigint, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION delete_court_slot(bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION save_slot_pack_definition(bigint, text, integer, numeric, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION grant_slot_pack(bigint, bigint, numeric, bigint, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION adjust_slot_credits(bigint, integer, text) TO authenticated, service_role;

GRANT SELECT ON slot_pack_definitions, slot_packs, player_slot_balances, slot_credit_movements, slot_pack_balances
  TO authenticated, service_role;
GRANT ALL ON slot_pack_definitions, slot_packs, player_slot_balances, slot_credit_movements
  TO service_role;

-- =========================================================
-- TRANSACTIONS (movimientos de caja del buffet)
-- =========================================================

CREATE TABLE transactions (
    id                BIGSERIAL PRIMARY KEY,
    user_uid          UUID NOT NULL,

    order_id          BIGINT REFERENCES orders(id),
    player_id         BIGINT REFERENCES players(id),
    partner_id        BIGINT REFERENCES partners(id),
    payment_method_id BIGINT REFERENCES payment_methods(id),

    description       TEXT,
    amount            NUMERIC(10, 2) NOT NULL,
    type              VARCHAR(20) NOT NULL
                       CHECK (type IN ('income', 'expense', 'adjustment', 'withdrawal')),
    status            VARCHAR(20) NOT NULL DEFAULT 'completed'
                       CHECK (status IN ('pending', 'completed', 'failed')),
    created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Balance agregado por método de pago (evita límite de filas del cliente)
CREATE OR REPLACE FUNCTION transaction_balance_statistics(
  p_from_date TIMESTAMPTZ DEFAULT NULL,
  p_to_date   TIMESTAMPTZ DEFAULT NULL,
  p_type      VARCHAR(20) DEFAULT NULL
)
RETURNS TABLE (
  payment_method_id   BIGINT,
  payment_method_name TEXT,
  incomes             NUMERIC,
  expenses            NUMERIC,
  withdrawals         NUMERIC,
  adjustments         NUMERIC,
  balance             NUMERIC
) AS $$
  SELECT
    t.payment_method_id,
    pm.name,
    COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN t.type = 'withdrawal' THEN t.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN t.type = 'adjustment' THEN t.amount ELSE 0 END), 0),
    COALESCE(SUM(
      CASE t.type
        WHEN 'income'     THEN t.amount
        WHEN 'adjustment' THEN t.amount
        WHEN 'expense'    THEN -t.amount
        WHEN 'withdrawal' THEN -t.amount
        ELSE 0
      END
    ), 0)
  FROM transactions t
  LEFT JOIN payment_methods pm ON pm.id = t.payment_method_id
  WHERE (p_from_date IS NULL OR t.created_at >= p_from_date)
    AND (p_to_date   IS NULL OR t.created_at <= p_to_date)
    AND (p_type      IS NULL OR p_type = '' OR t.type = p_type)
  GROUP BY t.payment_method_id, pm.name
  ORDER BY pm.name NULLS FIRST;
$$ LANGUAGE SQL STABLE;

$$ LANGUAGE SQL STABLE;

-- =========================================================
-- DAILY SALES CLOSURES (cierre de caja diario — solo ventas cantina)
-- =========================================================

CREATE TABLE daily_sales_closures (
    id                       BIGSERIAL PRIMARY KEY,
    business_date            DATE NOT NULL UNIQUE,
    period_start             TIMESTAMPTZ NOT NULL,
    period_end               TIMESTAMPTZ NOT NULL,
    closed_at                TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_by_user_uid       UUID NOT NULL,
    total_sales              NUMERIC(10, 2) NOT NULL DEFAULT 0,
    orders_closed_count      INTEGER NOT NULL DEFAULT 0,
    transactions_count       INTEGER NOT NULL DEFAULT 0,
    total_discount           NUMERIC(10, 2) NOT NULL DEFAULT 0,
    zero_amount_orders_count INTEGER NOT NULL DEFAULT 0,
    discounted_orders_count  INTEGER NOT NULL DEFAULT 0,
    open_orders_count        INTEGER NOT NULL DEFAULT 0,
    open_orders_total        NUMERIC(10, 2) NOT NULL DEFAULT 0,
    notes                    TEXT,
    revision_count           INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_daily_sales_closures_business_date
    ON daily_sales_closures(business_date DESC);

CREATE TABLE daily_sales_closure_payment_methods (
    id                  BIGSERIAL PRIMARY KEY,
    closure_id          BIGINT NOT NULL REFERENCES daily_sales_closures(id) ON DELETE CASCADE,
    payment_method_id   BIGINT REFERENCES payment_methods(id),
    payment_method_name TEXT NOT NULL,
    total_amount        NUMERIC(10, 2) NOT NULL DEFAULT 0,
    transaction_count   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_daily_sales_closure_pm_closure_id
    ON daily_sales_closure_payment_methods(closure_id);

CREATE TABLE daily_sales_closure_products (
    id            BIGSERIAL PRIMARY KEY,
    closure_id    BIGINT NOT NULL REFERENCES daily_sales_closures(id) ON DELETE CASCADE,
    product_id    BIGINT NOT NULL REFERENCES products(id),
    product_name  TEXT NOT NULL,
    category_id   BIGINT REFERENCES product_categories(id),
    category_name TEXT,
    quantity_sold INTEGER NOT NULL DEFAULT 0,
    total_amount  NUMERIC(10, 2) NOT NULL DEFAULT 0
);

CREATE INDEX idx_daily_sales_closure_products_closure_id
    ON daily_sales_closure_products(closure_id);

CREATE TABLE daily_sales_closure_categories (
    id            BIGSERIAL PRIMARY KEY,
    closure_id    BIGINT NOT NULL REFERENCES daily_sales_closures(id) ON DELETE CASCADE,
    category_id   BIGINT REFERENCES product_categories(id),
    category_name TEXT NOT NULL,
    quantity_sold INTEGER NOT NULL DEFAULT 0,
    total_amount  NUMERIC(10, 2) NOT NULL DEFAULT 0
);

CREATE INDEX idx_daily_sales_closure_categories_closure_id
    ON daily_sales_closure_categories(closure_id);

-- =========================================================
-- MONTHLY SALES CLOSURES (agrega cierres diarios del mes)
-- =========================================================

CREATE TABLE monthly_sales_closures (
    id                       BIGSERIAL PRIMARY KEY,
    year_month               VARCHAR(7) NOT NULL UNIQUE,
    period_start             DATE NOT NULL,
    period_end               DATE NOT NULL,
    closed_at                TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_by_user_uid       UUID NOT NULL,
    daily_closures_count     INTEGER NOT NULL DEFAULT 0,
    days_in_month            INTEGER NOT NULL DEFAULT 0,
    missing_days_count       INTEGER NOT NULL DEFAULT 0,
    missing_business_dates   DATE[] NOT NULL DEFAULT '{}',
    total_sales              NUMERIC(10, 2) NOT NULL DEFAULT 0,
    orders_closed_count      INTEGER NOT NULL DEFAULT 0,
    transactions_count       INTEGER NOT NULL DEFAULT 0,
    total_discount           NUMERIC(10, 2) NOT NULL DEFAULT 0,
    zero_amount_orders_count INTEGER NOT NULL DEFAULT 0,
    discounted_orders_count  INTEGER NOT NULL DEFAULT 0,
    open_orders_count        INTEGER NOT NULL DEFAULT 0,
    open_orders_total        NUMERIC(10, 2) NOT NULL DEFAULT 0,
    notes                    TEXT,
    revision_count           INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_monthly_sales_closures_year_month
    ON monthly_sales_closures(year_month DESC);

CREATE TABLE monthly_sales_closure_payment_methods (
    id                  BIGSERIAL PRIMARY KEY,
    closure_id          BIGINT NOT NULL REFERENCES monthly_sales_closures(id) ON DELETE CASCADE,
    payment_method_id   BIGINT REFERENCES payment_methods(id),
    payment_method_name TEXT NOT NULL,
    total_amount        NUMERIC(10, 2) NOT NULL DEFAULT 0,
    transaction_count   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE monthly_sales_closure_products (
    id            BIGSERIAL PRIMARY KEY,
    closure_id    BIGINT NOT NULL REFERENCES monthly_sales_closures(id) ON DELETE CASCADE,
    product_id    BIGINT NOT NULL REFERENCES products(id),
    product_name  TEXT NOT NULL,
    category_id   BIGINT REFERENCES product_categories(id),
    category_name TEXT,
    quantity_sold INTEGER NOT NULL DEFAULT 0,
    total_amount  NUMERIC(10, 2) NOT NULL DEFAULT 0
);

CREATE TABLE monthly_sales_closure_categories (
    id            BIGSERIAL PRIMARY KEY,
    closure_id    BIGINT NOT NULL REFERENCES monthly_sales_closures(id) ON DELETE CASCADE,
    category_id   BIGINT REFERENCES product_categories(id),
    category_name TEXT NOT NULL,
    quantity_sold INTEGER NOT NULL DEFAULT 0,
    total_amount  NUMERIC(10, 2) NOT NULL DEFAULT 0
);

CREATE TABLE monthly_sales_closure_days (
    id               BIGSERIAL PRIMARY KEY,
    closure_id       BIGINT NOT NULL REFERENCES monthly_sales_closures(id) ON DELETE CASCADE,
    daily_closure_id BIGINT NOT NULL REFERENCES daily_sales_closures(id),
    business_date    DATE NOT NULL
);

CREATE INDEX idx_monthly_sales_closure_days_closure_id
    ON monthly_sales_closure_days(closure_id);

-- =========================================================
-- STOCK_MOVEMENTS (historial de stock del buffet)
-- =========================================================

CREATE TABLE stock_movements (
  id            BIGSERIAL PRIMARY KEY,
  product_id    BIGINT NOT NULL REFERENCES products(id),
  movement_type VARCHAR(20) NOT NULL
                CHECK (movement_type IN ('purchase', 'sale', 'adjustment')),
  quantity      INTEGER NOT NULL,
  unit_cost     NUMERIC(10, 2),
  notes         TEXT,
  purchase_id   BIGINT REFERENCES purchases(id),
  user_uid      UUID NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_stock_movements_purchase_id ON stock_movements(purchase_id);

CREATE OR REPLACE FUNCTION stock_movement_statistics(
  p_from_date TIMESTAMPTZ DEFAULT NULL,
  p_to_date TIMESTAMPTZ DEFAULT NULL,
  p_category_id BIGINT DEFAULT NULL
)
RETURNS TABLE (
  product_id BIGINT,
  movement_type VARCHAR,
  total_quantity BIGINT,
  product_name TEXT,
  uses_stock BOOLEAN,
  category_id BIGINT,
  category_name TEXT
) AS $$
SELECT
  p.id,
  sm.movement_type,
  SUM(sm.quantity)::BIGINT,
  p.name,
  p.uses_stock,
  c.id,
  c.name
FROM stock_movements sm
JOIN products p ON p.id = sm.product_id
LEFT JOIN product_categories c ON c.id = p.category_id
WHERE (p_from_date IS NULL OR sm.created_at >= p_from_date)
  AND (p_to_date IS NULL OR sm.created_at <= p_to_date)
  AND (p_category_id IS NULL OR c.id = p_category_id)
GROUP BY p.id, sm.movement_type, p.name, p.uses_stock, c.id, c.name
ORDER BY p.name;
$$ LANGUAGE SQL STABLE;

-- =========================================================
-- SUPPLIERS (proveedores)
-- =========================================================

CREATE TABLE suppliers (
    id            BIGSERIAL PRIMARY KEY,
    name          VARCHAR(255) NOT NULL,
    contact_email VARCHAR(255),
    phone         VARCHAR(50),
    notes         TEXT,
    status        VARCHAR(20) NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'inactive')),
    user_uid      UUID NOT NULL,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================
-- PURCHASES (compras a proveedores)
-- =========================================================

CREATE TABLE purchases (
    id                BIGSERIAL PRIMARY KEY,
    supplier_id       BIGINT NOT NULL REFERENCES suppliers(id),
    user_uid          UUID NOT NULL,
    total_amount      NUMERIC(10, 2) NOT NULL DEFAULT 0,
    status            VARCHAR(20) NOT NULL DEFAULT 'completed'
                      CHECK (status IN ('pending', 'completed', 'cancelled')),
    payment_method_id BIGINT REFERENCES payment_methods(id),
    transaction_id    BIGINT REFERENCES transactions(id),
    notes             TEXT,
    created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE purchase_items (
    id           BIGSERIAL PRIMARY KEY,
    purchase_id  BIGINT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    product_id   BIGINT NOT NULL REFERENCES products(id),
    quantity     INTEGER NOT NULL,
    unit_cost    NUMERIC(10, 2) NOT NULL
);

-- =========================================================
-- TOURNAMENTS (torneos de pádel)
-- =========================================================

CREATE TABLE tournaments (
    id          BIGSERIAL PRIMARY KEY,
    user_uid    UUID NOT NULL,
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    category_id SMALLINT REFERENCES categories(id),  -- categoría del torneo si is_category_specific o is_suma_13_damas
    is_puntuable        BOOLEAN NOT NULL DEFAULT FALSE,  -- si suma para ranking/puntos
    is_grand_prix       BOOLEAN NOT NULL DEFAULT FALSE,  -- torneo Grand Prix: puntos ×2 en ranking (solo si puntuable)
    is_category_specific BOOLEAN NOT NULL DEFAULT FALSE,  -- si el torneo es de una categoría específica (libre)
    is_suma_13_damas    BOOLEAN NOT NULL DEFAULT FALSE,  -- torneo damas: ambas mujeres y categorías suman >= 13
    -- standard = formato de siempre. master = 8 parejas, 2 zonas todos contra todos, semis cruzadas.
    format      VARCHAR(20) NOT NULL DEFAULT 'standard'
                 CHECK (format IN ('standard', 'master')),
    start_date  DATE,
    end_date    DATE,
    status      VARCHAR(20) NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft', 'schedule_review', 'in_progress', 'playoffs_ready', 'finished', 'cancelled')),
    -- 🔹 Flag para indicar si el tercer set es super tie-break (aplicado a todos los matches del torneo)
    has_super_tiebreak  BOOLEAN NOT NULL DEFAULT FALSE,
    -- 🔹 Duración de partidos de fase de grupos (minutos)
    match_duration      INTEGER NOT NULL DEFAULT 60,
    -- 🔹 Duración de todos los partidos de playoffs —16avos, octavos, cuartos, etc.— (minutos)
    match_duration_quarters_onwards INTEGER NOT NULL DEFAULT 60,
    -- 🔹 Precio de inscripción por jugador
    registration_fee    NUMERIC(10, 2) DEFAULT 0,
    -- Canchas usadas al generar horarios de fase de grupos (mismo conjunto que el scheduler: slots × canchas)
    group_schedule_court_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    promo_flyer_url       TEXT,  -- flier de promoción (Supabase Storage, bucket tournament_promo_flyers)
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================
-- TOURNAMENT_GROUP_SLOTS (días y slots disponibles para partidos de zona)
-- Se definen al crear el torneo: fecha, horario inicio/fin, cancha.
-- =========================================================

CREATE TABLE tournament_group_slots (
    id             BIGSERIAL PRIMARY KEY,
    tournament_id  BIGINT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    user_uid      UUID NOT NULL,
    slot_date     DATE NOT NULL,
    start_time    TIME NOT NULL,
    end_time      TIME NOT NULL,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tournament_group_slots_tournament_id ON tournament_group_slots(tournament_id);
CREATE INDEX idx_tournament_group_slots_slot_date ON tournament_group_slots(slot_date);

-- =========================================================
-- TOURNAMENT_TEAMS (parejas dentro de un torneo)
-- =========================================================

CREATE TABLE tournament_teams (
    id                  BIGSERIAL PRIMARY KEY,
    tournament_id       BIGINT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    user_uid            UUID NOT NULL,

    player1_id          BIGINT NOT NULL REFERENCES players(id),
    player2_id          BIGINT NOT NULL REFERENCES players(id),

    display_name        VARCHAR(120),      -- "Gómez / Pérez" opcional
    seed_number         INTEGER,
    notes               TEXT,
    display_order       INTEGER DEFAULT 0,  -- Orden de visualización de las parejas
    is_substitute       BOOLEAN NOT NULL DEFAULT FALSE,  -- Si es suplente, no se incluye en la generación del torneo
    schedule_notes      TEXT,              -- Notas sobre disponibilidad horaria
    schedule_restrictions_loaded BOOLEAN NOT NULL DEFAULT FALSE,  -- Si ya se consultó y cargó la disponibilidad horaria
    needs_same_day_close_matches BOOLEAN NOT NULL DEFAULT FALSE  -- Requiere sus 2 partidos de zona el mismo día y cercanos
);

-- =========================================================
-- TOURNAMENT_TEAM_SCHEDULE_RESTRICTIONS (restricciones de equipos)
-- =========================================================

-- =========================================================
-- TOURNAMENT_REGISTRATION_PAYMENTS (pagos de inscripciones por jugador)
-- =========================================================

CREATE TABLE tournament_registration_payments (
    id                      BIGSERIAL PRIMARY KEY,
    tournament_id           BIGINT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    tournament_team_id      BIGINT NOT NULL REFERENCES tournament_teams(id) ON DELETE CASCADE,
    player_id               BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    user_uid                UUID NOT NULL,
    
    has_paid                BOOLEAN NOT NULL DEFAULT FALSE,
    is_registration_free  BOOLEAN NOT NULL DEFAULT FALSE,
    payment_method_id       BIGINT REFERENCES payment_methods(id),
    
    notes                   TEXT,
    created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Un jugador solo puede tener un registro de pago por equipo/torneo
    CONSTRAINT unique_player_payment_per_team UNIQUE (tournament_team_id, player_id)
);

-- Índices para búsquedas rápidas
CREATE INDEX idx_tournament_registration_payments_tournament_id 
    ON tournament_registration_payments(tournament_id);
CREATE INDEX idx_tournament_registration_payments_team_id 
    ON tournament_registration_payments(tournament_team_id);
CREATE INDEX idx_tournament_registration_payments_player_id 
    ON tournament_registration_payments(player_id);

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_tournament_registration_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_tournament_registration_payments_updated_at
    BEFORE UPDATE ON tournament_registration_payments
    FOR EACH ROW
    EXECUTE FUNCTION update_tournament_registration_payments_updated_at();

-- Una fila por (equipo, slot): can_play indica si el equipo puede jugar en ese horario.
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

-- =========================================================
-- TOURNAMENT_GROUPS (ZONAS)
-- =========================================================

CREATE TABLE tournament_groups (
    id              BIGSERIAL PRIMARY KEY,
    tournament_id   BIGINT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    user_uid        UUID NOT NULL,
    name            VARCHAR(20) NOT NULL,  -- "Zona A"
    group_order     INTEGER NOT NULL DEFAULT 1
);

-- =========================================================
-- TOURNAMENT_GROUP_TEAMS (asignación equipo -> zona)
-- =========================================================

CREATE TABLE tournament_group_teams (
    id                  BIGSERIAL PRIMARY KEY,
    tournament_group_id BIGINT NOT NULL REFERENCES tournament_groups(id) ON DELETE CASCADE,
    team_id             BIGINT NOT NULL REFERENCES tournament_teams(id) ON DELETE CASCADE,
    user_uid            UUID NOT NULL,
    UNIQUE (tournament_group_id, team_id)
);

-- =========================================================
-- TOURNAMENT_MATCHES (partidos: zonas + playoffs)
-- =========================================================

CREATE TABLE tournament_matches (
    id                  BIGSERIAL PRIMARY KEY,
    tournament_id       BIGINT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    user_uid            UUID NOT NULL,

    phase               VARCHAR(20) NOT NULL DEFAULT 'group'
                        CHECK (phase IN ('group', 'playoff')),

    tournament_group_id BIGINT REFERENCES tournament_groups(id),

    team1_id            BIGINT REFERENCES tournament_teams(id),
    team2_id            BIGINT REFERENCES tournament_teams(id),

    court_id            BIGINT REFERENCES courts(id),
    match_date          DATE,
    start_time          TIME,
    end_time            TIME,

    -- 🔹 Orden del partido dentro de un grupo (para grupos de 4: 1-2 primera ronda, 3-4 segunda ronda)
    match_order         INTEGER,

    status              VARCHAR(20) NOT NULL DEFAULT 'scheduled'
                        CHECK (status IN ('scheduled', 'in_progress', 'finished', 'cancelled')),

    -- 🔹 Flag para indicar si el tercer set es super tie-break
    -- Se hereda del torneo, excepto para cuartos, semifinal y final (siempre false)
    has_super_tiebreak  BOOLEAN NOT NULL DEFAULT FALSE,

    -- 🔹 Resultados por set (games)
    set1_team1_games    INTEGER,
    set1_team2_games    INTEGER,

    set2_team1_games    INTEGER,
    set2_team2_games    INTEGER,

    set3_team1_games    INTEGER,
    set3_team2_games    INTEGER,

    super_tiebreak_team1_points INTEGER,
    super_tiebreak_team2_points INTEGER,

    -- 🔹 Totales (podés recalcularlos desde los sets)
    team1_sets          INTEGER DEFAULT 0,
    team2_sets          INTEGER DEFAULT 0,
    team1_games_total   INTEGER DEFAULT 0,
    team2_games_total   INTEGER DEFAULT 0,

    notes               TEXT,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================
-- TOURNAMENT_GROUP_STANDINGS (tabla de posiciones por zona)
-- =========================================================

CREATE TABLE tournament_group_standings (
    id                  BIGSERIAL PRIMARY KEY,
    tournament_group_id BIGINT NOT NULL REFERENCES tournament_groups(id) ON DELETE CASCADE,
    team_id             BIGINT NOT NULL REFERENCES tournament_teams(id) ON DELETE CASCADE,
    user_uid            UUID NOT NULL,

    matches_played      INTEGER NOT NULL DEFAULT 0,
    wins                INTEGER NOT NULL DEFAULT 0,
    losses              INTEGER NOT NULL DEFAULT 0,
    sets_won            INTEGER NOT NULL DEFAULT 0,
    sets_lost           INTEGER NOT NULL DEFAULT 0,
    games_won           INTEGER NOT NULL DEFAULT 0,
    games_lost          INTEGER NOT NULL DEFAULT 0,
    position            INTEGER,

    UNIQUE (tournament_group_id, team_id)
);

-- =========================================================
-- TOURNAMENT_PLAYOFFS (metadata de cuadro: 8vos, 4tos, semi, final)
-- =========================================================
-- Esta tabla NO duplica los partidos.
-- Apunta a tournament_matches (phase='playoff') y agrega:
-- - qué ronda es (octavos, cuartos, etc)
-- - posición en el cuadro
-- - de dónde salen los equipos (1A vs 2B, Ganador QF1, etc.)

CREATE TABLE tournament_playoffs (
    id            BIGSERIAL PRIMARY KEY,
    tournament_id BIGINT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    user_uid      UUID NOT NULL,

    match_id      BIGINT NOT NULL REFERENCES tournament_matches(id) ON DELETE CASCADE,

    round         VARCHAR(20) NOT NULL
                  CHECK (round IN ('16avos', 'octavos', 'cuartos', 'semifinal', 'final')),

    bracket_pos   INTEGER NOT NULL,    -- ej: 1..8 en octavos, 1..4 en cuartos, etc.

    -- Texto libre para saber de dónde vienen los equipos en el cuadro
    -- Ejemplos: '1A', '2B', 'Ganador QF1', 'Ganador SF1'
    source_team1  VARCHAR(50),
    source_team2  VARCHAR(50),

    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================
-- TOURNAMENT_RANKING_POINT_RULES (puntos por ronda, configurables)
-- =========================================================

CREATE TABLE tournament_ranking_point_rules (
    id              SMALLSERIAL PRIMARY KEY,
    round_reached   VARCHAR(20) NOT NULL UNIQUE
                    CHECK (round_reached IN ('groups', '16avos', 'octavos', 'cuartos', 'semifinal', 'final', 'champion')),
    points          SMALLINT NOT NULL CHECK (points >= 0),
    display_order   SMALLINT NOT NULL DEFAULT 0
);

INSERT INTO tournament_ranking_point_rules (round_reached, points, display_order) VALUES
  ('champion',  100, 7),
  ('final',      80, 6),
  ('semifinal',  60, 5),
  ('cuartos',    40, 4),
  ('octavos',    20, 3),
  ('16avos',     20, 2),
  ('groups',     10, 1)
ON CONFLICT (round_reached) DO NOTHING;

-- =========================================================
-- PLAYER_TOURNAMENT_POINTS (ranking anual puntuable por categoría)
-- =========================================================
-- Puntos por jugador por torneo finalizado (torneos puntuables).
-- La categoría es la del torneo; el año se toma del torneo para el ranking anual.

CREATE TABLE player_tournament_points (
    id              BIGSERIAL PRIMARY KEY,
    tournament_id   BIGINT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    player_id       BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    category_id     SMALLINT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    points          SMALLINT NOT NULL CHECK (points >= 0),
    round_reached   VARCHAR(20) NOT NULL
                    CHECK (round_reached IN ('groups', '16avos', 'octavos', 'cuartos', 'semifinal', 'final', 'champion')),
    year            SMALLINT NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tournament_id, player_id)
);

CREATE INDEX idx_player_tournament_points_category_year ON player_tournament_points(category_id, year);
CREATE INDEX idx_player_tournament_points_player_year ON player_tournament_points(player_id, year);

-- =========================================================
-- TOURNAMENT_REGISTRATION_NOTIFIED (invitación WhatsApp enviada)
-- =========================================================

CREATE TABLE tournament_registration_notified (
    id              BIGSERIAL PRIMARY KEY,
    tournament_id   BIGINT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    player_id       BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    user_uid        UUID NOT NULL,
    notified_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tournament_id, player_id)
);

CREATE INDEX idx_tournament_registration_notified_tournament
    ON tournament_registration_notified(tournament_id);

-- =========================================================
-- REGISTRATION_PRICING_SETTINGS (configuración global de cuotas)
-- =========================================================

CREATE TABLE registration_pricing_settings (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    puntuable_lower_category_discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 20
        CHECK (
            puntuable_lower_category_discount_percent >= 0
            AND puntuable_lower_category_discount_percent <= 100
        )
);

INSERT INTO registration_pricing_settings (id) VALUES (1);

-- =========================================================
-- WHATSAPP_MESSAGE_TEMPLATES (variantes de mensajes por tipo)
-- =========================================================

CREATE TABLE whatsapp_message_templates (
    id          BIGSERIAL PRIMARY KEY,
    kind        TEXT NOT NULL CHECK (kind IN ('tournament_invite', 'debt_reminder')),
    name        TEXT NOT NULL,
    body        TEXT NOT NULL,
    user_uid    UUID,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_whatsapp_message_templates_kind
    ON whatsapp_message_templates(kind);

INSERT INTO whatsapp_message_templates (kind, name, body) VALUES
    ('tournament_invite', 'Corto', 'Hola {nombre}! Ya está abierta la inscripción al *torneo de {categoria}*. Cupos limitados. Te anotás?'),
    ('tournament_invite', 'Directo', '{nombre}, se viene el *torneo de {categoria}* y todavía no te anotaste. Te sumás?'),
    ('tournament_invite', 'Amistoso', 'Hola {nombre}! Abrimos la inscripción para el *torneo de {categoria}*. Si querés jugar, avisanos y te anotamos.'),
    ('tournament_invite', 'Últimos cupos', 'Hola {nombre}! Quedan pocos lugares para el *torneo de {categoria}*. Te guardo uno?');

-- =========================================================
-- ROLES Y PERMISOS: correr scripts/add-roles-permissions.sql a continuación
-- (tablas, roles iniciales, RLS y custom_access_token_hook; es idempotente).
-- =========================================================

-- =========================================================
-- CLASES (profesor, horario fijo, sesión del día y cobro mensual)
-- =========================================================

CREATE TABLE class_professors (
    id                BIGSERIAL PRIMARY KEY,
    user_uid          UUID NOT NULL,
    name              VARCHAR(100) NOT NULL,
    phone             VARCHAR(30),
    payment_method_id BIGINT REFERENCES payment_methods(id),
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE class_professor_rates (
    id              BIGSERIAL PRIMARY KEY,
    user_uid        UUID NOT NULL,
    professor_id    BIGINT NOT NULL REFERENCES class_professors(id) ON DELETE CASCADE,
    weekly_count    SMALLINT NOT NULL CHECK (weekly_count >= 1),
    monthly_amount  NUMERIC(10, 2) NOT NULL CHECK (monthly_amount >= 0),
    UNIQUE (professor_id, weekly_count)
);

CREATE TABLE class_schedules (
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

CREATE TABLE class_enrollments (
    id           BIGSERIAL PRIMARY KEY,
    user_uid     UUID NOT NULL,
    schedule_id  BIGINT NOT NULL REFERENCES class_schedules(id) ON DELETE CASCADE,
    player_id    BIGINT NOT NULL REFERENCES players(id),
    started_on   DATE NOT NULL DEFAULT CURRENT_DATE,
    ended_on     DATE,
    CHECK (ended_on IS NULL OR ended_on >= started_on)
);

CREATE UNIQUE INDEX class_enrollments_one_open
    ON class_enrollments (schedule_id, player_id)
    WHERE ended_on IS NULL;

CREATE TABLE class_sessions (
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

CREATE INDEX idx_class_sessions_date ON class_sessions (session_date);
CREATE INDEX idx_class_sessions_court_date ON class_sessions (court_id, session_date);

CREATE TABLE class_session_players (
    id         BIGSERIAL PRIMARY KEY,
    user_uid   UUID NOT NULL,
    session_id BIGINT NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
    player_id  BIGINT NOT NULL REFERENCES players(id),
    UNIQUE (session_id, player_id)
);

CREATE TABLE class_charges (
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

CREATE INDEX idx_class_charges_month ON class_charges (year_month);

CREATE TABLE class_month_closures (
    id            BIGSERIAL PRIMARY KEY,
    user_uid      UUID NOT NULL,
    professor_id  BIGINT NOT NULL REFERENCES class_professors(id),
    year_month    CHAR(7) NOT NULL,
    closed_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_uid, professor_id, year_month)
);
