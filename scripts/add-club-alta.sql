-- Fase 6: alta de otro complejo y contexto del administrador de la plataforma.
-- Correr después de scripts/club-schedule-live.sql.
-- Después, cada usuario tiene que volver a iniciar sesión.
-- El hook sigue en Authentication → Hooks → custom_access_token_hook.

ALTER TYPE payment_scope ADD VALUE IF NOT EXISTS 'TOURNAMENT';

ALTER TABLE platform_admins
    ADD COLUMN IF NOT EXISTS active_club_id BIGINT REFERENCES clubs(id);

-- El mismo nombre puede existir en canchas, cantina, clases y torneos.
CREATE UNIQUE INDEX IF NOT EXISTS payment_methods_club_name_scope_key
    ON payment_methods (club_id, name, scope);
ALTER TABLE payment_methods DROP CONSTRAINT IF EXISTS payment_methods_club_name_key;
DROP INDEX IF EXISTS payment_methods_club_name_key;

-- Club que escribe y lee este usuario.
-- Si es admin de la plataforma y eligió un complejo, ese. Si no, el de su rol.
CREATE OR REPLACE FUNCTION public.actor_club_id()
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_context bigint;
BEGIN
    SELECT active_club_id INTO v_context
    FROM public.platform_admins
    WHERE user_id = auth.uid();

    IF FOUND AND v_context IS NOT NULL THEN
        RETURN v_context;
    END IF;

    RETURN (SELECT club_id FROM public.user_roles WHERE user_id = auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.actor_club_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.actor_club_id() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_access_club(p_club bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT p_club IS NOT NULL AND p_club = public.actor_club_id();
$$;

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

    v_club := public.actor_club_id();

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
    v_context   BIGINT;
    v_write     TEXT[];
    v_read      TEXT[];
BEGIN
    SELECT ur.club_id, r.id, r.is_system
    INTO v_club_id, v_role_id, v_is_system
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = v_user_id;

    SELECT active_club_id
    INTO v_context
    FROM public.platform_admins
    WHERE user_id = v_user_id;

    v_platform := FOUND;

    IF v_platform AND v_context IS NOT NULL THEN
        v_club_id := v_context;
        v_is_system := TRUE;
    END IF;

    claims := jsonb_set(claims, '{app_club_id}', COALESCE(to_jsonb(v_club_id), 'null'::JSONB));
    claims := jsonb_set(claims, '{app_is_platform}', to_jsonb(COALESCE(v_platform, FALSE)));

    IF v_role_id IS NULL AND NOT (v_platform AND v_context IS NOT NULL) THEN
        claims := jsonb_set(claims, '{app_role_id}', 'null'::JSONB);
        claims := jsonb_set(claims, '{app_is_system}', 'false'::JSONB);
        claims := jsonb_set(claims, '{app_permissions}', '[]'::JSONB);
        claims := jsonb_set(claims, '{app_read_permissions}', '[]'::JSONB);
    ELSIF v_role_id IS NULL THEN
        claims := jsonb_set(claims, '{app_role_id}', 'null'::JSONB);
        claims := jsonb_set(claims, '{app_is_system}', 'true'::JSONB);
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
        claims := jsonb_set(claims, '{app_is_system}', to_jsonb(COALESCE(v_is_system, FALSE)));
        claims := jsonb_set(claims, '{app_permissions}', to_jsonb(v_write));
        claims := jsonb_set(claims, '{app_read_permissions}', to_jsonb(v_read));
    END IF;

    RETURN jsonb_set(event, '{claims}', claims);
END;
$$;
