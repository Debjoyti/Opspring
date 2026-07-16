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
  | "activities";

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

const listKey = (resource: CrmResource, orgId: string): QueryKey => ["crm", resource, orgId];

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
