-- Si ya corriste add-court-reservations.sql: reemplaza apply_fixed_bookings y save_court_fixed_booking
-- para que los turnos fijos sean solo lunes a viernes (1–5).

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
