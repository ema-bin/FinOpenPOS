import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { CookieOptions } from "@supabase/ssr";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { ALL_PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import { loadRolePermissions } from "@/lib/auth/load-role-permissions";
import { decideApiAccess } from "@/lib/auth/route-permissions";
import {
  decodeJwtPayload,
  permissionsFromClaims,
  redirectForPermissions,
} from "@/lib/auth/session-permissions";

/**
 * Permisos de la sesión. Viajan en el JWT (hook de Supabase), así que normalmente
 * no hay consulta a la DB. No verificamos la firma acá: getClaims/getUser pegan al
 * Auth server y el middleware, corriendo en Edge lejos de esa región, se queda sin
 * tiempo. Las rutas de API igual llaman a getUser(), que rechaza un token falso.
 * Si el token es anterior al hook, se leen de la DB; si esa lectura falla, se deja
 * pasar para no dejar a nadie afuera por un error de red.
 */
async function permissionsForSession(
  supabase: SupabaseClient,
  session: Session
): Promise<Permission[]> {
  const fromToken = permissionsFromClaims(decodeJwtPayload(session.access_token));
  if (fromToken !== null) return fromToken;

  const fromDb = await loadRolePermissions(supabase, session.user.id);
  if (fromDb === null) {
    console.error("No se pudieron leer los permisos; se permite el acceso para no bloquear.");
    return [...ALL_PERMISSIONS];
  }
  return fromDb;
}

function withSessionCookies(response: NextResponse, sessionResponse: NextResponse) {
  sessionResponse.cookies.getAll().forEach((cookie) => {
    response.cookies.set(cookie);
  });
  return response;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(
          cookiesToSet: Array<{
            name: string;
            value: string;
            options?: CookieOptions;
          }>
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
        
          supabaseResponse = NextResponse.next({
            request,
          });
        
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        }        
      },
    }
  )

  // Use getSession (cookie/JWT, no remote Auth round-trip). Middleware runs on Edge
  // near the user (e.g. gru1 from Argentina), not in vercel.json regions (pdx1).
  // getUser() hits Supabase Auth over the network and triggers MIDDLEWARE_INVOCATION_TIMEOUT.
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const user = session?.user
  const { pathname } = request.nextUrl

  if (pathname.startsWith("/api")) {
    const permissions = user && session ? await permissionsForSession(supabase, session) : []
    const decision = decideApiAccess(pathname, request.method, Boolean(user), permissions)
    if (decision === "allow") return supabaseResponse
    const status = decision === "unauthorized" ? 401 : 403
    const error = decision === "unauthorized" ? "Unauthorized" : "No tenés permiso para esto."
    return withSessionCookies(NextResponse.json({ error }, { status }), supabaseResponse)
  }

  if (
    !user &&
    !pathname.startsWith('/login') &&
    !pathname.startsWith('/auth')
  ) {
    // no user, potentially respond by redirecting the user to the login page
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && session) {
    const permissions = await permissionsForSession(supabase, session)
    const dest = redirectForPermissions(pathname, permissions)
    if (dest) {
      const url = request.nextUrl.clone()
      url.pathname = dest
      url.search = ''
      const redirectResponse = NextResponse.redirect(url)
      supabaseResponse.cookies.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie)
      })
      return redirectResponse
    }
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is. If you're
  // creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse
}