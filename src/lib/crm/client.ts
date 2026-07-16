"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";

export type CrmResource =
  | "accounts"
  | "contacts"
  | "leads"
  | "deals"
  | "activities"
  | "notes"
  | "products"
  | "quotes"
  | "templates";

async function api<T>(
  path: string,
  orgId: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`/api/v1/crm/${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-org-id": orgId,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

/** One-off CRM API call (imports, converts, merges…) outside the hook system. */
export function crmFetch<T>(path: string, orgId: string, init?: RequestInit): Promise<T> {
  return api<T>(path, orgId, init);
}

const listKey = (resource: string, orgId: string): QueryKey => ["crm", resource, orgId];

export function useCrmList<T = Record<string, unknown>>(
  resource: CrmResource,
  orgId: string,
) {
  return useQuery({
    queryKey: listKey(resource, orgId),
    queryFn: () => api<{ data: T[] }>(resource, orgId).then((r) => r.data),
  });
}

export function useCrmCreate(resource: CrmResource, orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      api(resource, orgId, { method: "POST", body: JSON.stringify(values) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: listKey(resource, orgId) }),
  });
}

export function useCrmUpdate(resource: CrmResource, orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: string; values: Record<string, unknown> }) =>
      api(`${resource}/${id}`, orgId, { method: "PATCH", body: JSON.stringify(values) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: listKey(resource, orgId) }),
  });
}

export function useCrmDelete(resource: CrmResource, orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`${resource}/${id}`, orgId, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: listKey(resource, orgId) }),
  });
}

// Pipelines ---------------------------------------------------------------

export type PipelineStage = {
  id: string;
  name: string;
  position: number;
  probability: number;
  kind: "open" | "won" | "lost";
};

export type Pipeline = {
  id: string;
  name: string;
  is_default: boolean;
  position: number;
  stages: PipelineStage[];
};

export function usePipelines(orgId: string) {
  return useQuery({
    queryKey: listKey("pipelines", orgId),
    queryFn: () => api<{ data: Pipeline[] }>("pipelines", orgId).then((r) => r.data),
  });
}

/** Invalidate every pipeline-dependent query after structural changes. */
export function usePipelineInvalidation(orgId: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: listKey("pipelines", orgId) });
    qc.invalidateQueries({ queryKey: listKey("deals", orgId) });
  };
}

// Timeline ------------------------------------------------------------------

export type TimelineEvent = {
  id: string;
  kind: "activity" | "note";
  type: string;
  subject: string;
  body: string | null;
  done: boolean | null;
  due_at: string | null;
  created_at: string;
};

export function useTimeline(
  orgId: string,
  entityType: string,
  entityId: string | null,
) {
  return useQuery({
    queryKey: ["crm", "timeline", orgId, entityType, entityId],
    enabled: Boolean(entityId),
    queryFn: () =>
      api<{ data: TimelineEvent[] }>(
        `timeline?entity_type=${entityType}&entity_id=${entityId}`,
        orgId,
      ).then((r) => r.data),
  });
}

// Reports --------------------------------------------------------------------

export function useCrmReports<T>(orgId: string) {
  return useQuery({
    queryKey: ["crm", "reports", orgId],
    queryFn: () => api<{ data: T }>("reports", orgId).then((r) => r.data),
  });
}

// Downloads --------------------------------------------------------------------

/** Fetches a CSV export and triggers a browser download. */
export async function downloadCsvExport(resource: string, orgId: string): Promise<void> {
  const res = await fetch(`/api/v1/crm/export?resource=${resource}`, {
    headers: { "x-org-id": orgId },
  });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${resource}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
