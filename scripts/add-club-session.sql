-- Fase 3: el club entra en la sesión y las escrituras no aceptan otro club.
-- Correr después de scripts/add-club-id.sql.
-- Después, cada usuario tiene que volver a iniciar sesión.
-- El hook sigue en Authentication → Hooks → custom_access_token_hook.

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    claims      JSONB := event->'claims';
    v_user_id   UUID := (event->>'user_id')::UUID;
    v_role_id   BIGINT;
    v_is_system BOOLEAN;
    v_club_id   BIGINT;
    v_platform  BOOLEAN;
    v_write     TEXT[];
    v_read      TEXT[];
BEGIN
    SELECT ur.club_id, r.id, r.is_system
    INTO v_club_id, v_role_id, v_is_system
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = v_user_id;

    SELECT EXISTS (
        SELECT 1 FROM public.platform_admins WHERE user_id = v_user_id
    ) INTO v_platform;

    claims := jsonb_set(claims, '{app_club_id}', COALESCE(to_jsonb(v_club_id), 'null'::JSONB));
    claims := jsonb_set(claims, '{app_is_platform}', to_jsonb(COALESCE(v_platform, FALSE)));

    IF v_role_id IS NULL THEN
        claims := jsonb_set(claims, '{app_role_id}', 'null'::JSONB);
        claims := jsonb_set(claims, '{app_is_system}', 'false'::JSONB);
        claims := jsonb_set(claims, '{app_permissions}', '[]'::JSONB);
        claims := jsonb_set(claims, '{app_read_permissions}', '[]'::JSONB);
    ELSE
        SELECT
            COALESCE(array_agg(permission) FILTER (WHERE access = 'write'), '{}'),
            COALESCE(array_agg(permission) FILTER (WHERE access = 'read'), '{}')
        INTO v_write, v_read
        FROM public.role_permissions
        WHERE role_id = v_role_id;

        claims := jsonb_set(claims, '{app_role_id}', to_jsonb(v_role_id));
        claims := jsonb_set(claims, '{app_is_system}', to_jsonb(v_is_system));
        claims := jsonb_set(claims, '{app_permissions}', to_jsonb(v_write));
        claims := jsonb_set(claims, '{app_read_permissions}', to_jsonb(v_read));
    END IF;

    RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;
GRANT SELECT ON TABLE public.platform_admins TO supabase_auth_admin;

DROP POLICY IF EXISTS "auth admin reads platform_admins" ON platform_admins;
CREATE POLICY "auth admin reads platform_admins" ON platform_admins
    FOR SELECT TO supabase_auth_admin USING (TRUE);

-- Un usuario autenticado escribe siempre en su club.
-- El cron y el service role no tienen auth.uid() y siguen pudiendo escribir.
CREATE OR REPLACE FUNCTION public.enforce_actor_club()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_club bigint;
BEGIN
    IF auth.uid() IS NULL THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        END IF;
        RETURN NEW;
    END IF;

    SELECT club_id INTO v_club
    FROM public.user_roles
    WHERE user_id = auth.uid();

    IF v_club IS NULL THEN
        RAISE EXCEPTION 'Tu usuario no está asignado a un complejo.';
    END IF;

    IF TG_OP = 'INSERT' THEN
        NEW.club_id := v_club;
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF OLD.club_id IS DISTINCT FROM v_club THEN
            RAISE EXCEPTION 'not found';
        END IF;
        NEW.club_id := OLD.club_id;
        RETURN NEW;
    END IF;

    IF OLD.club_id IS DISTINCT FROM v_club THEN
        RAISE EXCEPTION 'not found';
    END IF;
    RETURN OLD;
END;
$$;

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
        EXECUTE format('DROP TRIGGER IF EXISTS enforce_actor_club ON %I', v_table);
        EXECUTE format(
            'CREATE TRIGGER enforce_actor_club BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION public.enforce_actor_club()',
            v_table
        );
    END LOOP;
END $$;
