/**
 * Merge-field rendering for email templates. Placeholders look like
 * {{first_name}} (case-insensitive, whitespace-tolerant). Unknown fields
 * render as empty and are reported so the UI can warn.
 */

export function renderTemplate(
  template: string,
  vars: Record<string, string | null | undefined>,
): { text: string; missing: string[] } {
  const normalized = new Map(
    Object.entries(vars).map(([key, value]) => [key.toLowerCase(), value ?? ""]),
  );
  const missing = new Set<string>();
  const text = template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, rawKey: string) => {
    const key = rawKey.toLowerCase();
    if (!normalized.has(key) || normalized.get(key) === "") {
      missing.add(key);
      return normalized.get(key) ?? "";
    }
    return normalized.get(key)!;
  });
  return { text, missing: [...missing] };
}

type MergeRecord = Record<string, unknown>;

/** Merge variables for a lead or contact row. */
export function buildMergeVars(
  entityType: "lead" | "contact",
  record: MergeRecord,
): Record<string, string> {
  const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  if (entityType === "lead") {
    const name = str(record.name).trim();
    return {
      name,
      first_name: name.split(/\s+/)[0] ?? "",
      last_name: name.split(/\s+/).slice(1).join(" "),
      company: str(record.company),
      email: str(record.email),
      phone: str(record.phone),
      title: str(record.title),
      source: str(record.source),
    };
  }
  const first = str(record.first_name).trim();
  const last = str(record.last_name).trim();
  return {
    name: [first, last].filter(Boolean).join(" "),
    first_name: first,
    last_name: last,
    company: str((record.account as MergeRecord | null)?.name),
    email: str(record.email),
    phone: str(record.phone),
    title: str(record.title),
    source: "",
  };
}

export const MERGE_FIELDS = [
  "name",
  "first_name",
  "last_name",
  "company",
  "email",
  "phone",
  "title",
  "source",
] as const;
