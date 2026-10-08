-- =========================================================
-- ROLES Y PERMISOS
-- El catálogo de permisos vive en código (src/lib/auth/permissions.ts).
-- Acá se guardan los roles, qué permisos tiene cada uno y el rol de cada usuario.
-- El rol de sistema (Admin) tiene siempre todos los permisos; no necesita filas en role_permissions.
-- =========================================================

CREATE TABLE IF NOT EXISTS roles (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    description TEXT,
    is_system   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_single_system
    ON roles(is_system) WHERE is_system;

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id     BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission  TEXT NOT NULL,
    PRIMARY KEY (role_id, permission)
);

CREATE TABLE IF NOT EXISTS user_roles (
    user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role_id     BIGINT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    assigned_by UUID,
    assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role_id);

-- ---------------------------------------------------------
-- Roles iniciales
-- ---------------------------------------------------------

INSERT INTO roles (name, description, is_system) VALUES
    ('Admin', 'Acceso total', TRUE),
    ('Admin Canchas', 'Canchas (incluye precios) y torneos', FALSE),
    ('Cajero', 'Canchas, torneos y ventas', FALSE)
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permissions (role_id, permission)
SELECT r.id, p.permission
FROM roles r
JOIN (VALUES
    ('Admin Canchas', 'dashboard.view'),
    ('Admin Canchas', 'courts.operate'),
    ('Admin Canchas', 'courts.pricing'),
    ('Admin Canchas', 'tournaments.manage'),
    ('Cajero', 'dashboard.view'),
    ('Cajero', 'courts.operate'),
    ('Cajero', 'tournaments.manage'),
    ('Cajero', 'sales.operate'),
    ('Cajero', 'sales.cancel_discount'),
    ('Cajero', 'sales.reports')
) AS p(role_name, permission) ON p.role_name = r.name
ON CONFLICT DO NOTHING;

-- Todos los usuarios existentes quedan como Admin para que nadie pierda acceso.
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM auth.users u
CROSS JOIN roles r
WHERE r.is_system
ON CONFLICT (user_id) DO NOTHING;

-- ---------------------------------------------------------
-- RLS: sin políticas de escritura. Solo el backend con service role
-- (que saltea RLS) puede modificar roles y asignaciones; así un usuario
-- no puede darse permisos llamando a Supabase directamente.
-- ---------------------------------------------------------

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read roles" ON roles;
CREATE POLICY "authenticated read roles" ON roles
    FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "authenticated read role_permissions" ON role_permissions;
CREATE POLICY "authenticated read role_permissions" ON role_permissions
    FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "users read own role" ON user_roles;
CREATE POLICY "users read own role" ON user_roles
    FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ---------------------------------------------------------
-- Custom Access Token Hook: agrega el rol y los permisos al JWT.
-- Activarlo en Supabase Dashboard → Authentication → Hooks →
-- "Customize Access Token (JWT) Claims" → public.custom_access_token_hook
-- ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    claims      JSONB := event->'claims';
    v_role_id   BIGINT;
    v_is_system BOOLEAN;
    v_perms     TEXT[];
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
    ELSE
        SELECT COALESCE(array_agg(permission), '{}')
        INTO v_perms
        FROM public.role_permissions
        WHERE role_id = v_role_id;

        claims := jsonb_set(claims, '{app_role_id}', to_jsonb(v_role_id));
        claims := jsonb_set(claims, '{app_is_system}', to_jsonb(v_is_system));
        claims := jsonb_set(claims, '{app_permissions}', to_jsonb(v_perms));
    END IF;

    RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;
GRANT SELECT ON TABLE public.roles, public.role_permissions, public.user_roles TO supabase_auth_admin;

DROP POLICY IF EXISTS "auth admin reads roles" ON roles;
CREATE POLICY "auth admin reads roles" ON roles
    FOR SELECT TO supabase_auth_admin USING (TRUE);

DROP POLICY IF EXISTS "auth admin reads role_permissions" ON role_permissions;
CREATE POLICY "auth admin reads role_permissions" ON role_permissions
    FOR SELECT TO supabase_auth_admin USING (TRUE);

DROP POLICY IF EXISTS "auth admin reads user_roles" ON user_roles;
CREATE POLICY "auth admin reads user_roles" ON user_roles
    FOR SELECT TO supabase_auth_admin USING (TRUE);
