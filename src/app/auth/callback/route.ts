import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function safeNext(next: string | null): string {
  // Only allow same-origin relative paths — blocks open-redirect via
  // "//evil.com" or "https://evil.com" in the `next` query param.
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=Authentication failed`);
}
