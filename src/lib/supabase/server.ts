import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { clubIdFromAuthCookies } from '@/lib/clubs/session-club'
import { scopeClubClient } from '@/lib/clubs/scope-club-client'

export function createClient() {
  const cookieStore = cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(
          cookiesToSet: Array<{
            name: string
            value: string
            options?: CookieOptions
          }>
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component – safe to ignore
          }
        },
      },
    }
  )

  const clubId = clubIdFromAuthCookies(cookieStore.getAll())
  return clubId == null ? supabase : scopeClubClient(supabase, clubId)
}
