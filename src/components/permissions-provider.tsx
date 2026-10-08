"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { ALL_PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import { loadRolePermissions } from "@/lib/auth/load-role-permissions";
import { decodeJwtPayload, permissionsFromClaims } from "@/lib/auth/session-permissions";

type PermissionsValue = {
  permissions: Permission[];
  /** Todavía no se leyó la sesión: la UI muestra todo y el middleware ya bloquea la navegación. */
  loading: boolean;
  can: (permission: Permission) => boolean;
};

const PermissionsContext = createContext<PermissionsValue>({
  permissions: [],
  loading: true,
  can: () => false,
});

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    const apply = async (session: Session | null) => {
      const fromToken = permissionsFromClaims(
        session ? decodeJwtPayload(session.access_token) : null
      );
      let next = fromToken;
      if (next === null && session) {
        next = await loadRolePermissions(supabase, session.user.id);
        if (next === null) next = [...ALL_PERMISSIONS];
      }
      if (!active) return;
      setPermissions(next ?? []);
      setLoading(false);
    };

    supabase.auth.getSession().then(({ data }) => apply(data.session));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      apply(session);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<PermissionsValue>(
    () => ({
      permissions,
      loading,
      can: (permission) => permissions.includes(permission),
    }),
    [permissions, loading]
  );

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

export function usePermissions() {
  return useContext(PermissionsContext);
}
