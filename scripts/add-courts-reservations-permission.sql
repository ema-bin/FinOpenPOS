-- Permiso courts.reservations (catálogo en src/lib/auth/permissions.ts).
-- No es obligatorio: también podés marcar "Reservas y turnos fijos" en Admin → Roles.
--
-- Este script solo agrega escritura al rol "Admin Canchas" si existe.
-- Cajero y otros roles no se tocan.

INSERT INTO role_permissions (role_id, permission, access)
SELECT r.id, 'courts.reservations', 'write'
FROM roles r
WHERE r.name = 'Admin Canchas'
ON CONFLICT (role_id, permission) DO NOTHING;
