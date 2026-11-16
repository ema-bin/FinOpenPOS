"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import {
  allows,
  EMPTY_ACCESS,
  FULL_ACCESS,
  type EffectiveAccess,
  type Permission,
} from "@/lib/auth/permissions";
import { loadRolePermissions } from "@/lib/auth/load-role-permissions";
import { decodeJwtPayload, permissionsFromClaims } from "@/lib/auth/session-permissions";
import { isPlatformClaim } from "@/lib/clubs/session-club";

type PermissionsValue = {
  /** Todavía no se leyó la sesión: la UI muestra todo y el middleware ya bloquea la navegación. */
  loading: boolean;
  /** Escritura. Incluye la lectura. */
  can: (permission: Permission) => boolean;
  /** Lectura. La escritura también cuenta. */
  canRead: (permission: Permission) => boolean;
  /** Administra todos los complejos. No es un permiso del club. */
  isPlatform: boolean;
};

const PermissionsContext = createContext<PermissionsValue>({
  loading: true,
  can: () => false,
  canRead: () => false,
  isPlatform: false,
});

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const [access, setAccess] = useState<EffectiveAccess>(EMPTY_ACCESS);
  const [isPlatform, setIsPlatform] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    const apply = async (session: Session | null) => {
      const claims = session ? decodeJwtPayload(session.access_token) : null;
      const fromToken = permissionsFromClaims(claims);
      let next = fromToken;
      if (next === null && session) {
        next = await loadRolePermissions(supabase, session.user.id);
        if (next === null) next = FULL_ACCESS;
      }
      if (!active) return;
      setIsPlatform(isPlatformClaim(claims));
      setAccess(next ?? EMPTY_ACCESS);
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
      loading,
      can: (permission) => allows(access, permission, "write"),
      canRead: (permission) => allows(access, permission, "read"),
      isPlatform,
    }),
    [access, isPlatform, loading]
  );

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

export function usePermissions() {
  return useContext(PermissionsContext);
}
