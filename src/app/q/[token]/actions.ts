"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Customer accept/decline for /q/<token>. Runs anonymously through the
 * SECURITY DEFINER crm_quote_respond() function — the token is the
 * credential, and only a 'sent' quote can be answered, exactly once.
 */
export async function respondToQuote(token: string, accept: boolean): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return;
  const supabase = await createClient();
  await supabase.rpc("crm_quote_respond", { p_token: token, p_accept: accept });
  revalidatePath(`/q/${token}`);
}
