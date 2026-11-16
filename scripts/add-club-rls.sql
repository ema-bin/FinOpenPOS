-- Fase 4: aunque una consulta olvide el filtro, no ve otro club.
-- Correr después de scripts/add-club-session.sql.
-- El service role sigue salteando RLS. Los cron recorren club por club desde la app.

CREATE OR REPLACE FUNCTION public.can_access_club(p_club bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_club IS NOT NULL AND (
    p_club = (SELECT ur.club_id FROM public.user_roles ur WHERE ur.user_id = auth.uid())
    OR (
      EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid())
      AND p_club = NULLIF(auth.jwt() ->> 'app_club_id', '')::bigint
    )
  );
$$;

REVOKE ALL ON FUNCTION public.can_access_club(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_club(bigint) TO authenticated, service_role;

DO $$
DECLARE
  v_table text;
  v_tables text[] := ARRAY[
    'payment_methods',
    'players',
    'advertisements',
    'partners',
    'product_categories',
    'products',
    'orders',
    'order_items',
    'courts',
    'court_slots',
    'court_slot_day_notes',
    'court_pricing',
    'slot_pack_definitions',
    'slot_packs',
    'player_slot_balances',
    'slot_credit_movements',
    'transactions',
    'daily_sales_closures',
    'daily_sales_closure_payment_methods',
    'daily_sales_closure_products',
    'daily_sales_closure_categories',
    'monthly_sales_closures',
    'monthly_sales_closure_payment_methods',
    'monthly_sales_closure_products',
    'monthly_sales_closure_categories',
    'monthly_sales_closure_days',
    'stock_movements',
    'suppliers',
    'purchases',
    'purchase_items',
    'tournaments',
    'tournament_group_slots',
    'tournament_teams',
    'tournament_registration_payments',
    'tournament_team_schedule_restrictions',
    'tournament_groups',
    'tournament_group_teams',
    'tournament_matches',
    'tournament_group_standings',
    'tournament_playoffs',
    'player_tournament_points',
    'tournament_registration_notified',
    'tournament_ranking_point_rules',
    'whatsapp_message_templates',
    'class_professors',
    'class_professor_rates',
    'class_schedules',
    'class_enrollments',
    'class_sessions',
    'class_session_players',
    'class_charges',
    'class_month_closures',
    'court_fixed_bookings',
    'court_fixed_booking_exceptions',
    'court_reservation_runs'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE format('DROP POLICY IF EXISTS club_isolation ON %I', v_table);
    EXECUTE format(
      'CREATE POLICY club_isolation ON %I FOR ALL TO authenticated USING (public.can_access_club(club_id)) WITH CHECK (public.can_access_club(club_id))',
      v_table
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS "authenticated read roles" ON roles;
CREATE POLICY "authenticated read roles" ON roles
  FOR SELECT TO authenticated
  USING (public.can_access_club(club_id));

DROP POLICY IF EXISTS "authenticated read role_permissions" ON role_permissions;
CREATE POLICY "authenticated read role_permissions" ON role_permissions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.roles r
      WHERE r.id = role_permissions.role_id
        AND public.can_access_club(r.club_id)
    )
  );

DROP POLICY IF EXISTS "platform admin reads club users" ON user_roles;
CREATE POLICY "platform admin reads club users" ON user_roles
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid())
    AND public.can_access_club(club_id)
  );

ALTER VIEW public.slot_pack_balances SET (security_invoker = true);

-- Los procesos que corrían como dueño de la tabla veían todos los clubes.
-- Como invocador, respetan las políticas. El service role sigue salteándolas.
DO $$
DECLARE
  v_fn record;
BEGIN
  FOR v_fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.proname IN (
        'slot_credit_lock_balance',
        'slot_credit_refund',
        'slot_credit_consume',
        'save_court_slot',
        'delete_court_slot',
        'grant_slot_pack',
        'save_slot_pack_definition',
        'adjust_slot_credits',
        'reserve_court_slot',
        'set_court_reservation_player',
        'cancel_court_reservation',
        'release_fixed_booking_slots',
        'apply_fixed_bookings',
        'save_court_fixed_booking',
        'deactivate_court_fixed_booking',
        'cancel_fixed_booking_date'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SECURITY INVOKER', v_fn.sig);
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.apply_fixed_bookings(date);

CREATE OR REPLACE FUNCTION public.apply_fixed_bookings(p_date date, p_club_id bigint DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
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
      AND (p_club_id IS NULL OR b.club_id = p_club_id)
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

REVOKE ALL ON FUNCTION public.apply_fixed_bookings(date, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_fixed_bookings(date, bigint) TO authenticated, service_role;
