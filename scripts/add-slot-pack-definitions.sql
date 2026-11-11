-- Packs definidos (5 turnos, 10 turnos) y la venta de esos packs a un jugador.
-- Correr después de add-slot-packs.sql. No modifica turnos ni créditos ya cargados.
-- Se puede volver a correr.

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

ALTER TABLE slot_packs
  ADD COLUMN IF NOT EXISTS definition_id BIGINT REFERENCES slot_pack_definitions(id);

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

REVOKE ALL ON FUNCTION save_slot_pack_definition(bigint, text, integer, numeric, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION grant_slot_pack(bigint, bigint, numeric, bigint, date, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION save_slot_pack_definition(bigint, text, integer, numeric, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION grant_slot_pack(bigint, bigint, numeric, bigint, date, text) TO authenticated, service_role;
GRANT SELECT ON slot_pack_definitions TO authenticated, service_role;
GRANT ALL ON slot_pack_definitions TO service_role;
