/**
 * Pure duplicate-detection helpers, shared by the duplicates API and tested
 * directly. Rows are grouped when they share a normalized email, a normalized
 * phone, or an exact (case-insensitive) display name.
 */

export type DedupeRow = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
};

export type DuplicateGroup = {
  field: "email" | "phone" | "name";
  value: string;
  ids: string[];
};

export function normalizeEmail(email: string | null | undefined): string | null {
  const trimmed = (email ?? "").trim().toLowerCase();
  return trimmed.includes("@") ? trimmed : null;
}

export function normalizePhone(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 7 ? digits : null;
}

export function findDuplicateGroups(rows: DedupeRow[]): DuplicateGroup[] {
  const byKey = new Map<string, { field: DuplicateGroup["field"]; value: string; ids: string[] }>();

  const add = (field: DuplicateGroup["field"], value: string | null, id: string) => {
    if (!value) return;
    const key = `${field}:${value}`;
    const group = byKey.get(key) ?? { field, value, ids: [] };
    group.ids.push(id);
    byKey.set(key, group);
  };

  for (const row of rows) {
    add("email", normalizeEmail(row.email), row.id);
    add("phone", normalizePhone(row.phone), row.id);
    add("name", row.name.trim().toLowerCase() || null, row.id);
  }

  const groups = [...byKey.values()].filter((g) => g.ids.length > 1);

  // A pair that matches on both email and name would show twice; keep the
  // highest-signal grouping (email > phone > name) for identical id sets.
  const seenIdSets = new Set<string>();
  const priority: DuplicateGroup["field"][] = ["email", "phone", "name"];
  groups.sort((a, b) => priority.indexOf(a.field) - priority.indexOf(b.field));
  return groups.filter((g) => {
    const key = [...g.ids].sort().join("|");
    if (seenIdSets.has(key)) return false;
    seenIdSets.add(key);
    return true;
  });
}

/**
 * Builds the field patch for a merge: for every mergeable column the primary
 * record is missing, take the first non-empty value from the duplicates.
 */
export function buildMergePatch(
  primary: Record<string, unknown>,
  duplicates: Record<string, unknown>[],
  fields: string[],
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const field of fields) {
    const current = primary[field];
    if (current !== null && current !== undefined && current !== "") continue;
    for (const dupe of duplicates) {
      const candidate = dupe[field];
      if (candidate !== null && candidate !== undefined && candidate !== "") {
        patch[field] = candidate;
        break;
      }
    }
  }
  // Union of tags across all records, if any record carries tags.
  const allTags = [primary, ...duplicates].flatMap((r) =>
    Array.isArray(r.tags) ? (r.tags as string[]) : [],
  );
  if (allTags.length > 0) patch.tags = [...new Set(allTags)];
  return patch;
}
