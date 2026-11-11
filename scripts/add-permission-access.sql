-- =========================================================
-- LECTURA Y ESCRITURA POR PERMISO
-- Ejecutá este script en el SQL editor de Supabase.
-- Las filas que ya existen quedan en escritura, así nadie pierde acceso.
-- Después, cada usuario tiene que volver a iniciar sesión para que el
-- token traiga app_permissions (escritura) y app_read_permissions (lectura).
-- =========================================================

ALTER TABLE public.role_permissions
    ADD COLUMN IF NOT EXISTS access TEXT NOT NULL DEFAULT 'write';

ALTER TABLE public.role_permissions
    DROP CONSTRAINT IF EXISTS role_permissions_access_check;

ALTER TABLE public.role_permissions
    ADD CONSTRAINT role_permissions_access_check CHECK (access IN ('read', 'write'));

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    claims      JSONB := event->'claims';
    v_role_id   BIGINT;
    v_is_system BOOLEAN;
    v_write     TEXT[];
    v_read      TEXT[];
BEGIN
    SELECT r.id, r.is_system
    INTO v_role_id, v_is_system
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = (event->>'user_id')::UUID;

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
