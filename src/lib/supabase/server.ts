import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Per-request client, scoped to the caller's session cookie. This is the
 * ONLY client normal app code should use — every query runs as the signed-in
 * user, so RLS is actually enforced on every request.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component render — the proxy already
            // refreshes the session cookie on the next request.
          }
        },
      },
    },
  );
}
