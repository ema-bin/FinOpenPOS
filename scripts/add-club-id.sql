-- Fase 2: club_id en las tablas de negocio.
-- Correr después de scripts/add-clubs.sql.
-- Las filas que ya existen quedan en el primer club.
-- user_uid no se toca. La app sigue filtrando por user_uid.
-- club_id tiene default de ese club para que los insert actuales no fallen.
-- No se parte categories: el catálogo de pádel sigue siendo compartido.
-- Los puntos del ranking sí son del club: una fila por ronda y por club.
-- Las claves que ya incluyen user_uid se dejan: cada usuario sigue teniendo
-- su medio de pago, su categoría y su cargo. Unificarlas por club rompería
-- la app de ahora, que todavía busca por user_uid.
-- Solo se abren las claves globales que impedirían el mismo dato en otro club:
-- cierre diario, cierre mensual y nombre de pack.

DO $$
DECLARE
  v_club bigint;
  v_table text;
  v_constraint record;
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
    'tournament_ranking_point_rules',
    'tournament_registration_notified',
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
  IF (SELECT count(*) FROM clubs) <> 1 THEN
    RAISE EXCEPTION 'Esta fase espera un solo club. Corré scripts/add-clubs.sql primero.';
  END IF;

  SELECT id INTO v_club FROM clubs ORDER BY id LIMIT 1;

  FOREACH v_table IN ARRAY v_tables LOOP
    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS club_id BIGINT REFERENCES clubs(id)',
      v_table
    );
    EXECUTE format('ALTER TABLE %I ALTER COLUMN club_id SET DEFAULT %s', v_table, v_club);
    EXECUTE format('UPDATE %I SET club_id = %s WHERE club_id IS NULL', v_table, v_club);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN club_id SET NOT NULL', v_table);
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I (club_id)',
      v_table || '_club_id_idx',
      v_table
    );
  END LOOP;

  ALTER TABLE daily_sales_closures DROP CONSTRAINT IF EXISTS daily_sales_closures_business_date_key;
  ALTER TABLE monthly_sales_closures DROP CONSTRAINT IF EXISTS monthly_sales_closures_year_month_key;
  DROP INDEX IF EXISTS slot_pack_definitions_name_idx;

  CREATE UNIQUE INDEX IF NOT EXISTS slot_pack_definitions_club_name_idx
    ON slot_pack_definitions (club_id, lower(btrim(name)));
  CREATE UNIQUE INDEX IF NOT EXISTS daily_sales_closures_club_date_key
    ON daily_sales_closures (club_id, business_date);
  CREATE UNIQUE INDEX IF NOT EXISTS monthly_sales_closures_club_month_key
    ON monthly_sales_closures (club_id, year_month);

  FOR v_constraint IN
    SELECT conname
    FROM pg_constraint
    WHERE contype = 'u'
      AND conrelid = 'tournament_ranking_point_rules'::regclass
      AND pg_get_constraintdef(oid) NOT ILIKE '%club_id%'
  LOOP
    EXECUTE format(
      'ALTER TABLE tournament_ranking_point_rules DROP CONSTRAINT %I',
      v_constraint.conname
    );
  END LOOP;

  CREATE UNIQUE INDEX IF NOT EXISTS tournament_ranking_point_rules_club_round_key
    ON tournament_ranking_point_rules (club_id, round_reached);
END $$;
