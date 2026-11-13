-- Reservas y turnos fijos sobre los turnos que ya existen.
-- Correr en el editor SQL de Supabase. No borra turnos, pagos ni jugadores.
-- Con el flag apagado la aplicación no usa estas columnas.

ALTER TABLE court_slots
  ADD COLUMN IF NOT EXISTS reservation_status TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS reserved_player_id BIGINT REFERENCES players(id),
  ADD COLUMN IF NOT EXISTS reservation_source TEXT,
  ADD COLUMN IF NOT EXISTS fixed_booking_id BIGINT,
  ADD COLUMN IF NOT EXISTS reservation_detached BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE court_slots DROP CONSTRAINT IF EXISTS court_slots_reservation_status_check;
ALTER TABLE court_slots
  ADD CONSTRAINT court_slots_reservation_status_check
  CHECK (reservation_status IN ('free', 'reserved'));

ALTER TABLE court_slots DROP CONSTRAINT IF EXISTS court_slots_reservation_source_check;
ALTER TABLE court_slots
  ADD CONSTRAINT court_slots_reservation_source_check
  CHECK (reservation_source IS NULL OR reservation_source IN ('manual', 'fixed'));

CREATE TABLE IF NOT EXISTS court_fixed_bookings (
  id               BIGSERIAL PRIMARY KEY,
  user_uid         UUID NOT NULL,
  player_id        BIGINT NOT NULL REFERENCES players(id),
  court_id         BIGINT NOT NULL REFERENCES courts(id),
  weekday          SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time       TIME NOT NULL,
  end_time         TIME NOT NULL,
  valid_from       DATE NOT NULL,
  valid_until      DATE,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  suspended_from   DATE,
  suspended_until  DATE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (valid_until IS NULL OR valid_until >= valid_from),
  CHECK (
    (suspended_from IS NULL AND suspended_until IS NULL)
    OR (suspended_from IS NOT NULL AND suspended_until IS NOT NULL AND suspended_until >= suspended_from)
  )
);

CREATE TABLE IF NOT EXISTS court_fixed_booking_exceptions (
  id                BIGSERIAL PRIMARY KEY,
  fixed_booking_id  BIGINT NOT NULL REFERENCES court_fixed_bookings(id) ON DELETE CASCADE,
  slot_date         DATE NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fixed_booking_id, slot_date)
);

CREATE TABLE IF NOT EXISTS court_reservation_runs (
  id          BIGSERIAL PRIMARY KEY,
  user_uid    UUID NOT NULL,
  week_start  DATE NOT NULL,
  week_end    DATE NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('running', 'ok', 'error')),
  summary     JSONB,
  error       TEXT,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

ALTER TABLE court_slots DROP CONSTRAINT IF EXISTS court_slots_fixed_booking_id_fkey;
ALTER TABLE court_slots
  ADD CONSTRAINT court_slots_fixed_booking_id_fkey
  FOREIGN KEY (fixed_booking_id) REFERENCES court_fixed_bookings(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION reservation_ranges_overlap(
  p_start_a time, p_end_a time, p_start_b time, p_end_b time
) RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  WITH mins AS (
    SELECT
      EXTRACT(HOUR FROM p_start_a)::int * 60 + EXTRACT(MINUTE FROM p_start_a)::int AS sa,
      EXTRACT(HOUR FROM p_end_a)::int * 60 + EXTRACT(MINUTE FROM p_end_a)::int AS ea,
      EXTRACT(HOUR FROM p_start_b)::int * 60 + EXTRACT(MINUTE FROM p_start_b)::int AS sb,
      EXTRACT(HOUR FROM p_end_b)::int * 60 + EXTRACT(MINUTE FROM p_end_b)::int AS eb
  ),
  norm AS (
    SELECT
      sa,
      CASE WHEN ea <= sa THEN ea + 1440 ELSE ea END AS ea,
      sb,
      CASE WHEN eb <= sb THEN eb + 1440 ELSE eb END AS eb
    FROM mins
  )
  SELECT sa < eb AND sb < ea FROM norm;
$$;

CREATE OR REPLACE FUNCTION court_slot_is_blocked(
  p_court_id bigint, p_date date, p_start time, p_end time
) RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM class_sessions cs
    WHERE cs.court_id = p_court_id
      AND cs.session_date = p_date
      AND cs.status = 'scheduled'
      AND reservation_ranges_overlap(p_start, p_end, cs.start_time, cs.end_time)
  ) OR EXISTS (
    SELECT 1 FROM tournament_matches tm
    WHERE tm.court_id = p_court_id
      AND tm.match_date = p_date
      AND tm.status IS DISTINCT FROM 'cancelled'
      AND tm.start_time IS NOT NULL
      AND tm.end_time IS NOT NULL
      AND reservation_ranges_overlap(p_start, p_end, tm.start_time, tm.end_time)
  );
$$;

CREATE OR REPLACE FUNCTION reservation_slot_is_standard(p_start time, p_end time)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (p_start, p_end) IN (
    (time '10:00', time '11:30'),
    (time '11:30', time '13:00'),
    (time '13:00', time '14:30'),
    (time '14:30', time '16:00'),
    (time '16:00', time '17:30'),
    (time '17:30', time '19:00'),
    (time '19:00', time '20:30'),
    (time '20:30', time '22:00'),
    (time '22:00', time '23:30'),
    (time '23:30', time '01:00')
  );
$$;

CREATE OR REPLACE FUNCTION reservation_require_actor()
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL AND COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  RETURN v_actor;
END;
$$;

CREATE OR REPLACE FUNCTION reservation_slot_has_record(p_slot court_slots)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_slot.was_played
    OR p_slot.player1_payment_method_id IS NOT NULL
    OR p_slot.player2_payment_method_id IS NOT NULL
    OR p_slot.player3_payment_method_id IS NOT NULL
    OR p_slot.player4_payment_method_id IS NOT NULL
    OR p_slot.player1_id IS NOT NULL
    OR p_slot.player2_id IS NOT NULL
    OR p_slot.player3_id IS NOT NULL
    OR p_slot.player4_id IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION reserve_court_slot(p_slot_id bigint, p_player_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot court_slots%ROWTYPE;
BEGIN
  PERFORM reservation_require_actor();
  IF NOT EXISTS (SELECT 1 FROM players WHERE id = p_player_id) THEN
    RAISE EXCEPTION 'RESERVATION:Elegí un jugador';
  END IF;

  SELECT * INTO v_slot FROM court_slots WHERE id = p_slot_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION:No se encontró el turno';
  END IF;
  IF v_slot.reservation_status = 'reserved' THEN
    RAISE EXCEPTION 'RESERVATION:Ese turno ya está reservado';
  END IF;
  IF court_slot_is_blocked(v_slot.court_id, v_slot.slot_date, v_slot.start_time, v_slot.end_time) THEN
    RAISE EXCEPTION 'RESERVATION:Ese horario está ocupado por una clase o un torneo';
  END IF;

  UPDATE court_slots
  SET reservation_status = 'reserved',
      reserved_player_id = p_player_id,
      reservation_source = 'manual',
      fixed_booking_id = NULL,
      reservation_detached = TRUE
  WHERE id = p_slot_id;
END;
$$;

CREATE OR REPLACE FUNCTION set_court_reservation_player(p_slot_id bigint, p_player_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot court_slots%ROWTYPE;
BEGIN
  PERFORM reservation_require_actor();
  IF NOT EXISTS (SELECT 1 FROM players WHERE id = p_player_id) THEN
    RAISE EXCEPTION 'RESERVATION:Elegí un jugador';
  END IF;

  SELECT * INTO v_slot FROM court_slots WHERE id = p_slot_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION:No se encontró el turno';
  END IF;
  IF v_slot.reservation_status <> 'reserved' THEN
    RAISE EXCEPTION 'RESERVATION:Ese turno no está reservado';
  END IF;

  IF v_slot.fixed_booking_id IS NOT NULL THEN
    INSERT INTO court_fixed_booking_exceptions (fixed_booking_id, slot_date)
    VALUES (v_slot.fixed_booking_id, v_slot.slot_date)
    ON CONFLICT (fixed_booking_id, slot_date) DO NOTHING;
  END IF;

  UPDATE court_slots
  SET reserved_player_id = p_player_id,
      reservation_source = 'manual',
      fixed_booking_id = NULL,
      reservation_detached = TRUE
  WHERE id = p_slot_id;
END;
$$;

CREATE OR REPLACE FUNCTION cancel_court_reservation(p_slot_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot court_slots%ROWTYPE;
BEGIN
  PERFORM reservation_require_actor();
  SELECT * INTO v_slot FROM court_slots WHERE id = p_slot_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION:No se encontró el turno';
  END IF;
  IF v_slot.reservation_status <> 'reserved' THEN
    RETURN;
  END IF;
  IF reservation_slot_has_record(v_slot) THEN
    RAISE EXCEPTION 'RESERVATION:Ese turno ya tiene juego o pagos y no se puede liberar';
  END IF;

  IF v_slot.fixed_booking_id IS NOT NULL THEN
    INSERT INTO court_fixed_booking_exceptions (fixed_booking_id, slot_date)
    VALUES (v_slot.fixed_booking_id, v_slot.slot_date)
    ON CONFLICT (fixed_booking_id, slot_date) DO NOTHING;
  END IF;

  UPDATE court_slots
  SET reservation_status = 'free',
      reserved_player_id = NULL,
      reservation_source = NULL,
      fixed_booking_id = NULL,
      reservation_detached = FALSE
  WHERE id = p_slot_id;
END;
$$;

CREATE OR REPLACE FUNCTION release_fixed_booking_slots(p_booking_id bigint, p_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE court_slots
  SET reservation_status = 'free',
      reserved_player_id = NULL,
      reservation_source = NULL,
      fixed_booking_id = NULL,
      reservation_detached = FALSE
  WHERE fixed_booking_id = p_booking_id
    AND reservation_source = 'fixed'
    AND reservation_detached = FALSE
    AND was_played = FALSE
    AND player1_payment_method_id IS NULL
    AND player2_payment_method_id IS NULL
    AND player3_payment_method_id IS NULL
    AND player4_payment_method_id IS NULL
    AND player1_id IS NULL
    AND player2_id IS NULL
    AND player3_id IS NULL
    AND player4_id IS NULL
    AND (p_date IS NULL OR slot_date = p_date)
    AND slot_date >= (timezone('America/Argentina/Buenos_Aires', now()))::date;
END;
$$;

CREATE OR REPLACE FUNCTION apply_fixed_bookings(p_date date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking court_fixed_bookings%ROWTYPE;
  v_slot court_slots%ROWTYPE;
  v_applied integer := 0;
  v_skipped integer := 0;
  v_conflicts jsonb := '[]'::jsonb;
  v_reason text;
BEGIN
  PERFORM reservation_require_actor();
  PERFORM pg_advisory_xact_lock(842170, (p_date - DATE '2000-01-01'));

  FOR v_booking IN
    SELECT * FROM court_fixed_bookings b
    WHERE b.is_active
      AND b.weekday BETWEEN 1 AND 5
      AND b.weekday = EXTRACT(DOW FROM p_date)::int
      AND b.valid_from <= p_date
      AND (b.valid_until IS NULL OR b.valid_until >= p_date)
      AND NOT (
        b.suspended_from IS NOT NULL
        AND p_date BETWEEN b.suspended_from AND b.suspended_until
      )
      AND NOT EXISTS (
        SELECT 1 FROM court_fixed_booking_exceptions e
        WHERE e.fixed_booking_id = b.id AND e.slot_date = p_date
      )
  LOOP
    v_reason := NULL;
    SELECT * INTO v_slot
    FROM court_slots
    WHERE court_id = v_booking.court_id
      AND slot_date = p_date
      AND start_time = v_booking.start_time
      AND end_time = v_booking.end_time
    FOR UPDATE;

    IF NOT FOUND THEN
      v_reason := 'sin turno generado';
    ELSIF court_slot_is_blocked(v_slot.court_id, v_slot.slot_date, v_slot.start_time, v_slot.end_time) THEN
      v_reason := 'clase o torneo';
    ELSIF reservation_slot_has_record(v_slot) OR v_slot.reservation_detached
      OR (v_slot.reservation_status = 'reserved' AND v_slot.reservation_source = 'manual')
      OR (
        v_slot.reservation_status = 'reserved'
        AND v_slot.fixed_booking_id IS DISTINCT FROM v_booking.id
      ) THEN
      v_reason := 'reserva o registro existente';
    END IF;

    IF v_reason IS NOT NULL THEN
      v_skipped := v_skipped + 1;
      v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
        'fixed_booking_id', v_booking.id,
        'court_id', v_booking.court_id,
        'reason', v_reason
      ));
      CONTINUE;
    END IF;

    IF v_slot.reservation_status = 'reserved' AND v_slot.fixed_booking_id = v_booking.id THEN
      IF v_slot.reserved_player_id IS DISTINCT FROM v_booking.player_id THEN
        UPDATE court_slots
        SET reserved_player_id = v_booking.player_id
        WHERE id = v_slot.id;
      END IF;
    ELSE
      UPDATE court_slots
      SET reservation_status = 'reserved',
          reserved_player_id = v_booking.player_id,
          reservation_source = 'fixed',
          fixed_booking_id = v_booking.id,
          reservation_detached = FALSE
      WHERE id = v_slot.id;
    END IF;
    v_applied := v_applied + 1;
  END LOOP;

  RETURN jsonb_build_object('applied', v_applied, 'skipped', v_skipped, 'conflicts', v_conflicts);
END;
$$;

CREATE OR REPLACE FUNCTION save_court_fixed_booking(
  p_id bigint,
  p_player_id bigint,
  p_court_id bigint,
  p_weekday smallint,
  p_start time,
  p_end time,
  p_valid_from date,
  p_valid_until date,
  p_is_active boolean,
  p_suspended_from date,
  p_suspended_until date
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_id bigint;
  v_day date;
  v_today date := (timezone('America/Argentina/Buenos_Aires', now()))::date;
  v_limit date;
  v_slot court_slots%ROWTYPE;
BEGIN
  v_actor := reservation_require_actor();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM players WHERE id = p_player_id) THEN
    RAISE EXCEPTION 'RESERVATION:Elegí un jugador';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM courts WHERE id = p_court_id AND is_active) THEN
    RAISE EXCEPTION 'RESERVATION:Elegí una cancha';
  END IF;
  IF p_weekday < 1 OR p_weekday > 5 THEN
    RAISE EXCEPTION 'RESERVATION:Los turnos fijos son de lunes a viernes';
  END IF;
  IF NOT reservation_slot_is_standard(p_start, p_end) THEN
    RAISE EXCEPTION 'RESERVATION:El horario tiene que coincidir con un turno de la grilla';
  END IF;
  IF p_valid_until IS NOT NULL AND p_valid_until < p_valid_from THEN
    RAISE EXCEPTION 'RESERVATION:La vigencia no es válida';
  END IF;
  IF (p_suspended_from IS NULL) <> (p_suspended_until IS NULL)
    OR (p_suspended_from IS NOT NULL AND p_suspended_until < p_suspended_from) THEN
    RAISE EXCEPTION 'RESERVATION:La suspensión tiene que tener desde y hasta';
  END IF;
  IF EXISTS (
    SELECT 1 FROM court_fixed_bookings
    WHERE court_id = p_court_id
      AND weekday = p_weekday
      AND start_time = p_start
      AND is_active
      AND (p_id IS NULL OR id <> p_id)
      AND daterange(valid_from, COALESCE(valid_until, DATE '9999-12-31'), '[]')
        && daterange(p_valid_from, COALESCE(p_valid_until, DATE '9999-12-31'), '[]')
  ) THEN
    RAISE EXCEPTION 'RESERVATION:Ya hay un turno fijo activo en ese horario';
  END IF;

  v_day := GREATEST(p_valid_from, v_today);
  v_limit := LEAST(COALESCE(p_valid_until, v_today + 70), v_today + 70);
  WHILE v_day <= v_limit LOOP
    IF EXTRACT(DOW FROM v_day)::int = p_weekday
      AND NOT (
        p_suspended_from IS NOT NULL AND v_day BETWEEN p_suspended_from AND p_suspended_until
      )
      AND NOT EXISTS (
        SELECT 1 FROM court_fixed_booking_exceptions e
        WHERE p_id IS NOT NULL AND e.fixed_booking_id = p_id AND e.slot_date = v_day
      ) THEN
      SELECT * INTO v_slot
      FROM court_slots
      WHERE court_id = p_court_id AND slot_date = v_day AND start_time = p_start AND end_time = p_end;
      IF FOUND AND (
        court_slot_is_blocked(v_slot.court_id, v_slot.slot_date, v_slot.start_time, v_slot.end_time)
        OR v_slot.reservation_detached
        OR (
          v_slot.reservation_status = 'reserved'
          AND v_slot.fixed_booking_id IS DISTINCT FROM p_id
        )
        OR reservation_slot_has_record(v_slot)
      ) THEN
        RAISE EXCEPTION 'RESERVATION:Hay un conflicto el % y no se cambió el turno fijo', to_char(v_day, 'DD/MM/YYYY');
      END IF;
    END IF;
    v_day := v_day + 1;
  END LOOP;

  IF p_id IS NULL THEN
    INSERT INTO court_fixed_bookings (
      user_uid, player_id, court_id, weekday, start_time, end_time,
      valid_from, valid_until, is_active, suspended_from, suspended_until
    ) VALUES (
      v_actor, p_player_id, p_court_id, p_weekday, p_start, p_end,
      p_valid_from, p_valid_until, COALESCE(p_is_active, TRUE), p_suspended_from, p_suspended_until
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE court_fixed_bookings
    SET player_id = p_player_id,
        court_id = p_court_id,
        weekday = p_weekday,
        start_time = p_start,
        end_time = p_end,
        valid_from = p_valid_from,
        valid_until = p_valid_until,
        is_active = COALESCE(p_is_active, is_active),
        suspended_from = p_suspended_from,
        suspended_until = p_suspended_until,
        updated_at = now()
    WHERE id = p_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'RESERVATION:No se encontró el turno fijo';
    END IF;
    PERFORM release_fixed_booking_slots(v_id, NULL);
  END IF;

  v_day := GREATEST(p_valid_from, v_today);
  WHILE v_day <= v_limit LOOP
    PERFORM apply_fixed_bookings(v_day);
    v_day := v_day + 1;
  END LOOP;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION deactivate_court_fixed_booking(p_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM reservation_require_actor();
  UPDATE court_fixed_bookings
  SET is_active = FALSE, updated_at = now()
  WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION:No se encontró el turno fijo';
  END IF;
  PERFORM release_fixed_booking_slots(p_id, NULL);
END;
$$;

CREATE OR REPLACE FUNCTION cancel_fixed_booking_date(p_id bigint, p_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot court_slots%ROWTYPE;
BEGIN
  PERFORM reservation_require_actor();
  IF NOT EXISTS (SELECT 1 FROM court_fixed_bookings WHERE id = p_id) THEN
    RAISE EXCEPTION 'RESERVATION:No se encontró el turno fijo';
  END IF;

  SELECT * INTO v_slot
  FROM court_slots
  WHERE fixed_booking_id = p_id AND slot_date = p_date
  FOR UPDATE;

  IF FOUND AND reservation_slot_has_record(v_slot) THEN
    RAISE EXCEPTION 'RESERVATION:Ese turno ya tiene juego o pagos y no se puede liberar';
  END IF;

  INSERT INTO court_fixed_booking_exceptions (fixed_booking_id, slot_date)
  VALUES (p_id, p_date)
  ON CONFLICT (fixed_booking_id, slot_date) DO NOTHING;

  PERFORM release_fixed_booking_slots(p_id, p_date);
END;
$$;

REVOKE ALL ON FUNCTION reservation_ranges_overlap(time, time, time, time) FROM PUBLIC;
REVOKE ALL ON FUNCTION court_slot_is_blocked(bigint, date, time, time) FROM PUBLIC;
REVOKE ALL ON FUNCTION reservation_slot_is_standard(time, time) FROM PUBLIC;
REVOKE ALL ON FUNCTION reservation_require_actor() FROM PUBLIC;
REVOKE ALL ON FUNCTION reservation_slot_has_record(court_slots) FROM PUBLIC;
REVOKE ALL ON FUNCTION reserve_court_slot(bigint, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION set_court_reservation_player(bigint, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION cancel_court_reservation(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION release_fixed_booking_slots(bigint, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION apply_fixed_bookings(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION save_court_fixed_booking(bigint, bigint, bigint, smallint, time, time, date, date, boolean, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION deactivate_court_fixed_booking(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION cancel_fixed_booking_date(bigint, date) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION reserve_court_slot(bigint, bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION set_court_reservation_player(bigint, bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION cancel_court_reservation(bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION apply_fixed_bookings(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION save_court_fixed_booking(bigint, bigint, bigint, smallint, time, time, date, date, boolean, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION deactivate_court_fixed_booking(bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION cancel_fixed_booking_date(bigint, date) TO authenticated, service_role;

GRANT SELECT ON court_fixed_bookings, court_fixed_booking_exceptions, court_reservation_runs TO authenticated, service_role;
GRANT INSERT, UPDATE ON court_reservation_runs TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE court_reservation_runs_id_seq TO authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM court_slots
    GROUP BY court_id, slot_date, start_time
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Hay turnos duplicados (cancha, fecha y hora). No se creó el índice único y no se borró ningún turno.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS court_slots_court_date_start_idx
  ON court_slots (court_id, slot_date, start_time);
