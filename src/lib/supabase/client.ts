import { createBrowserClient } from "@supabase/ssr";

/** Browser client for Client Components. Anon key only, same RLS as server.ts. */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
