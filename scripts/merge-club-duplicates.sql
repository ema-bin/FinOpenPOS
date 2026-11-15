-- Fase 3: un medio de pago o una categoría de producto con el mismo nombre
-- queda una sola vez por club. Las filas que apuntaban al duplicado pasan al que se conserva.
-- Correr después de scripts/add-club-id.sql.
-- Los cargos de clase con el mismo alumno, profesor y mes se unifican solo si el monto coincide.

CREATE OR REPLACE FUNCTION public._repoint_and_drop(p_table regclass, p_keep bigint, p_drop bigint)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_fk record;
BEGIN
    FOR v_fk IN
        SELECT src.relname AS table_name, att.attname AS column_name
        FROM pg_constraint con
        JOIN pg_class src ON src.oid = con.conrelid
        JOIN pg_attribute att
          ON att.attrelid = con.conrelid
         AND att.attnum = con.conkey[1]
        WHERE con.contype = 'f'
          AND con.confrelid = p_table
          AND array_length(con.conkey, 1) = 1
    LOOP
        EXECUTE format(
            'UPDATE %I SET %I = $1 WHERE %I = $2',
            v_fk.table_name,
            v_fk.column_name,
            v_fk.column_name
        ) USING p_keep, p_drop;
    END LOOP;

    EXECUTE format('DELETE FROM %s WHERE id = $1', p_table) USING p_drop;
END;
$$;

DO $$
DECLARE
    v_group record;
    v_dup bigint;
BEGIN
    FOR v_group IN
        SELECT club_id, name, min(id) AS keep_id, array_agg(id ORDER BY id) AS ids
        FROM payment_methods
        GROUP BY club_id, name
        HAVING count(*) > 1
    LOOP
        FOREACH v_dup IN ARRAY v_group.ids LOOP
            IF v_dup = v_group.keep_id THEN
                CONTINUE;
            END IF;
            PERFORM public._repoint_and_drop('payment_methods'::regclass, v_group.keep_id, v_dup);
        END LOOP;
    END LOOP;

    FOR v_group IN
        SELECT club_id, name, min(id) AS keep_id, array_agg(id ORDER BY id) AS ids
        FROM product_categories
        GROUP BY club_id, name
        HAVING count(*) > 1
    LOOP
        FOREACH v_dup IN ARRAY v_group.ids LOOP
            IF v_dup = v_group.keep_id THEN
                CONTINUE;
            END IF;
            PERFORM public._repoint_and_drop('product_categories'::regclass, v_group.keep_id, v_dup);
        END LOOP;
    END LOOP;
END $$;

DO $$
DECLARE
    v_constraint record;
BEGIN
    FOR v_constraint IN
        SELECT conrelid::regclass AS rel, conname
        FROM pg_constraint
        WHERE contype = 'u'
          AND pg_get_constraintdef(oid) ILIKE '%user_uid%'
          AND conrelid IN ('payment_methods'::regclass, 'product_categories'::regclass)
    LOOP
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', v_constraint.rel, v_constraint.conname);
    END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS payment_methods_club_name_key
    ON payment_methods (club_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS product_categories_club_name_key
    ON product_categories (club_id, name);

DO $$
DECLARE
    v_group record;
    v_keep bigint;
    v_dup bigint;
BEGIN
    FOR v_group IN
        SELECT club_id, professor_id, year_month, min(id) AS keep_id, array_agg(id ORDER BY id) AS ids
        FROM class_month_closures
        GROUP BY club_id, professor_id, year_month
        HAVING count(*) > 1
    LOOP
        FOREACH v_dup IN ARRAY v_group.ids LOOP
            IF v_dup <> v_group.keep_id THEN
                DELETE FROM class_month_closures WHERE id = v_dup;
            END IF;
        END LOOP;
    END LOOP;

    FOR v_group IN
        SELECT club_id, player_id, professor_id, year_month,
               count(DISTINCT amount) AS amounts,
               count(DISTINCT status) AS statuses,
               min(id) AS keep_id,
               array_agg(id ORDER BY id) AS ids
        FROM class_charges
        GROUP BY club_id, player_id, professor_id, year_month
        HAVING count(*) > 1
    LOOP
        IF v_group.amounts > 1 OR v_group.statuses > 1 THEN
            RAISE EXCEPTION
                'Hay cargos de clase distintos para el mismo alumno, profesor y mes (club %, jugador %). No se unificaron.',
                v_group.club_id, v_group.player_id;
        END IF;
        v_keep := v_group.keep_id;
        FOREACH v_dup IN ARRAY v_group.ids LOOP
            IF v_dup <> v_keep THEN
                DELETE FROM class_charges WHERE id = v_dup;
            END IF;
        END LOOP;
    END LOOP;
END $$;

DO $$
DECLARE
    v_constraint record;
BEGIN
    FOR v_constraint IN
        SELECT conrelid::regclass AS rel, conname
        FROM pg_constraint
        WHERE contype = 'u'
          AND pg_get_constraintdef(oid) ILIKE '%user_uid%'
          AND conrelid IN ('class_charges'::regclass, 'class_month_closures'::regclass)
    LOOP
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', v_constraint.rel, v_constraint.conname);
    END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS class_charges_club_player_professor_month_key
    ON class_charges (club_id, player_id, professor_id, year_month);
CREATE UNIQUE INDEX IF NOT EXISTS class_month_closures_club_professor_month_key
    ON class_month_closures (club_id, professor_id, year_month);

DROP FUNCTION public._repoint_and_drop(regclass, bigint, bigint);
