import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Thin CRUD helpers over the crm_* tables. Every call runs through the
 * caller's RLS-scoped Supabase client and always sets org_id explicitly, so
 * tenant isolation is enforced by RLS underneath, not trusted from app code.
 * Tables are passed as literals from the API routes (never user input).
 */
export type CrmTable =
  | "crm_accounts"
  | "crm_contacts"
  | "crm_leads"
  | "crm_deals"
  | "crm_activities"
  | "crm_pipelines"
  | "crm_pipeline_stages"
  | "crm_notes"
  | "crm_products"
  | "crm_deal_items"
  | "crm_quotes"
  | "crm_quote_items"
  | "crm_email_templates"
  | "crm_invoices"
  | "crm_invoice_items"
  | "crm_payments";

export async function listRows(
  supabase: SupabaseClient,
  table: CrmTable,
  orgId: string,
  options: {
    select?: string;
    order?: string;
    ascending?: boolean;
    // Extra equality filters (column names are always code literals).
    filters?: Record<string, string | number | boolean | null>;
    limit?: number;
  } = {},
) {
  const { select = "*", order = "created_at", ascending = false } = options;
  let query = supabase.from(table).select(select).eq("org_id", orgId);
  for (const [column, value] of Object.entries(options.filters ?? {})) {
    query = value === null ? query.is(column, null) : query.eq(column, value);
  }
  query = query.order(order, { ascending });
  if (options.limit) query = query.limit(options.limit);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getRow(
  supabase: SupabaseClient,
  table: CrmTable,
  orgId: string,
  id: string,
  select = "*",
) {
  const { data, error } = await supabase
    .from(table)
    .select(select)
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function insertRow(
  supabase: SupabaseClient,
  table: CrmTable,
  orgId: string,
  values: Record<string, unknown>,
) {
  const { data, error } = await supabase
    .from(table)
    .insert({ ...values, org_id: orgId })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateRow(
  supabase: SupabaseClient,
  table: CrmTable,
  orgId: string,
  id: string,
  values: Record<string, unknown>,
) {
  const { data, error } = await supabase
    .from(table)
    .update(values)
    .eq("org_id", orgId)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteRow(
  supabase: SupabaseClient,
  table: CrmTable,
  orgId: string,
  id: string,
) {
  const { error } = await supabase.from(table).delete().eq("org_id", orgId).eq("id", id);
  if (error) throw new Error(error.message);
}
