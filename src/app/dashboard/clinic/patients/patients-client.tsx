"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useClinicList, useClinicPatient } from "@/lib/clinic/client";
import { formatCurrency, formatDate } from "@/lib/format";

const inr = (n: number) => formatCurrency(n, "INR");

type Patient = {
  id: string;
  patient_number: string;
  name: string;
  mobile: string | null;
  email: string | null;
  gender: string | null;
  city: string | null;
  age: number | null;
};

export function PatientsClient({ orgId }: { orgId: string }) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Patient | null>(null);
  const { data, isLoading } = useClinicList<Patient>("patients", orgId, { q, limit: 100 });
  const detail = useClinicPatient(orgId, selected?.id ?? null);

  const patients = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Patients</h1>
        <span className="text-sm text-muted-foreground">
          {data ? `${data.total.toLocaleString("en-IN")} total` : ""}
        </span>
      </div>

      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by name, mobile, patient number, email…"
        className="max-w-md"
      />

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Patient #</TableHead>
              <TableHead>Mobile</TableHead>
              <TableHead>Gender</TableHead>
              <TableHead>City</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">Loading…</TableCell>
              </TableRow>
            ) : patients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  No patients found.
                </TableCell>
              </TableRow>
            ) : (
              patients.map((p) => (
                <TableRow key={p.id} className="cursor-pointer" onClick={() => setSelected(p)}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-muted-foreground">{p.patient_number}</TableCell>
                  <TableCell>{p.mobile ?? "—"}</TableCell>
                  <TableCell>{p.gender ?? "—"}</TableCell>
                  <TableCell>{p.city ?? "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selected?.name}</DialogTitle>
          </DialogHeader>
          {detail.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading history…</p>
          ) : detail.data ? (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Patient #" value={detail.data.patient.patient_number} />
                <Field label="Mobile" value={String(detail.data.patient.mobile ?? "—")} />
                <Field label="Gender" value={String(detail.data.patient.gender ?? "—")} />
                <Field label="City" value={String(detail.data.patient.city ?? "—")} />
                <Field label="Blood group" value={String(detail.data.patient.blood_group ?? "—")} />
                <Field label="Referred by" value={String(detail.data.patient.referred_by ?? "—")} />
              </div>
              {detail.data.patient.medical_history ? (
                <div>
                  <div className="text-xs font-medium text-muted-foreground">Medical history</div>
                  <p className="whitespace-pre-wrap">{String(detail.data.patient.medical_history)}</p>
                </div>
              ) : null}

              <Section title={`Treatments (${detail.data.treatments.length})`}>
                {detail.data.treatments.map((t) => (
                  <li key={t.id} className="flex items-center justify-between py-1">
                    <span className="truncate pr-2">
                      {t.treatment_name}
                      <span className="text-muted-foreground"> · {formatDate(t.treated_on)}</span>
                    </span>
                    <span className="shrink-0 font-medium">{inr(Number(t.amount ?? 0))}</span>
                  </li>
                ))}
              </Section>

              <Section title={`Payments (${detail.data.payments.length})`}>
                {detail.data.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-1">
                    <span className="truncate pr-2">
                      {p.treatment_name ?? "Payment"}
                      <span className="text-muted-foreground"> · {formatDate(p.paid_on)}</span>
                    </span>
                    <span className="shrink-0 font-medium">{inr(Number(p.amount_paid ?? 0))}</span>
                  </li>
                ))}
              </Section>

              <Section title={`Appointments (${detail.data.appointments.length})`}>
                {detail.data.appointments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between py-1">
                    <span>{formatDate(a.appointment_at)}{a.doctor ? ` · ${a.doctor}` : ""}</span>
                    {a.status ? <Badge variant="secondary" className="capitalize">{a.status}</Badge> : null}
                  </li>
                ))}
              </Section>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div>{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const items = Array.isArray(children) ? children : [children];
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-muted-foreground">{title}</div>
      {items.length === 0 ? (
        <p className="text-muted-foreground">None</p>
      ) : (
        <ul className="divide-y">{children}</ul>
      )}
    </div>
  );
}
