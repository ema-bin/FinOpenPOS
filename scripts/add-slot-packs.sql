-- Packs de turnos: créditos por participación de un jugador.
-- Correr en el editor SQL de Supabase (dev y prod). No borra turnos ni jugadores.
-- El medio cuyo nombre contiene "QR" pasa a descontar un crédito.

ALTER TABLE payment_methods
  ADD COLUMN IF NOT EXISTS consumes_slot_credit BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE payment_methods
SET consumes_slot_credit = TRUE
WHERE name ILIKE '%QR%'
  AND consumes_slot_credit = FALSE;

ALTER TABLE court_slots
  ADD COLUMN IF NOT EXISTS player1_id BIGINT REFERENCES players(id),
  ADD COLUMN IF NOT EXISTS player2_id BIGINT REFERENCES players(id),
  ADD COLUMN IF NOT EXISTS player3_id BIGINT REFERENCES players(id),
  ADD COLUMN IF NOT EXISTS player4_id BIGINT REFERENCES players(id);

CREATE TABLE IF NOT EXISTS slot_pack_definitions (
  id          BIGSERIAL PRIMARY KEY,
  user_uid    UUID NOT NULL,
  name        TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  credits     INTEGER NOT NULL CHECK (credits > 0),
  price       NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS slot_pack_definitions_name_idx
  ON slot_pack_definitions (lower(btrim(name)));

CREATE TABLE IF NOT EXISTS slot_packs (
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

CREATE INDEX IF NOT EXISTS slot_packs_player_idx ON slot_packs(player_id, sold_at, id);

ALTER TABLE slot_packs
  ADD COLUMN IF NOT EXISTS definition_id BIGINT REFERENCES slot_pack_definitions(id);

CREATE TABLE IF NOT EXISTS player_slot_balances (
  player_id   BIGINT PRIMARY KEY REFERENCES players(id),
  user_uid    UUID NOT NULL,
  balance     INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS slot_credit_movements (
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

CREATE INDEX IF NOT EXISTS slot_credit_movements_player_idx
  ON slot_credit_movements(player_id, created_at DESC);

CREATE INDEX IF NOT EXISTS slot_credit_movements_slot_idx
  ON slot_credit_movements(court_slot_id);

CREATE INDEX IF NOT EXISTS slot_credit_movements_pack_idx
  ON slot_credit_movements(pack_id)
  WHERE pack_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS slot_credit_one_open_seat
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
AS $$
  SELECT CASE
    WHEN p_patch ? p_key THEN NULLIF(p_patch ->> p_key, '')::bigint
    ELSE p_current
  END;
$$;

CREATE OR REPLACE FUNCTION slot_credit_lock_balance(p_player_id bigint)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

CREATE OR REPLACE FUNCTION slot_credit_refund(p_movement_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

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
AS $$
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
$$;

CREATE OR REPLACE FUNCTION save_court_slot(p_slot_id bigint, p_patch jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

CREATE OR REPLACE FUNCTION delete_court_slot(p_slot_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

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
AS $$
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
$$;

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
