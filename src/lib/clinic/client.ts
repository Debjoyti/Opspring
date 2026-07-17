"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";

export type ClinicResource =
  | "patients"
  | "appointments"
  | "procedures"
  | "payments";

async function api<T>(path: string, orgId: string): Promise<T> {
  const res = await fetch(`/api/v1/clinic/${path}`, {
    headers: { "x-org-id": orgId },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export function useClinicList<T = Record<string, unknown>>(
  resource: ClinicResource,
  orgId: string,
  params: { q?: string; limit?: number; offset?: number } = {},
) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.limit) search.set("limit", String(params.limit));
  if (params.offset) search.set("offset", String(params.offset));
  const qs = search.toString();

  return useQuery({
    queryKey: ["clinic", resource, orgId, qs],
    queryFn: () => api<{ data: T[]; total: number }>(`${resource}${qs ? `?${qs}` : ""}`, orgId),
    placeholderData: keepPreviousData,
  });
}

export function useClinicPatient(orgId: string, patientId: string | null) {
  return useQuery({
    enabled: !!patientId,
    queryKey: ["clinic", "patient", orgId, patientId],
    queryFn: () => api<{ data: PatientDetail }>(`patients/${patientId}`, orgId).then((r) => r.data),
  });
}

export type PatientDetail = {
  patient: Record<string, unknown> & { id: string; name: string; patient_number: string };
  appointments: { id: string; appointment_at: string | null; doctor: string | null; status: string | null }[];
  treatments: { id: string; treatment_name: string; amount: number; doctor: string | null; treated_on: string | null }[];
  payments: { id: string; treatment_name: string | null; amount_paid: number; payment_mode: string | null; paid_on: string | null }[];
  notes: { id: string; type: string | null; description: string | null; doctor: string | null; noted_on: string | null }[];
};
