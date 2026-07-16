"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { crmFetch } from "@/lib/crm/client";
import { ACTIVITY_TYPES } from "@/lib/services/crm/types";

type Step = {
  id: string;
  position: number;
  day_offset: number;
  activity_type: string;
  subject: string;
};

type Cadence = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  steps: Step[];
  enrollments: { id: string }[];
};

type Enrollment = {
  id: string;
  entity_type: string;
  entity_name: string;
  created_at: string;
};

type DraftStep = { day_offset: number; activity_type: string; subject: string };

const TYPE_LABEL: Record<string, string> = {
  call: "Call",
  email: "Email",
  meeting: "Meeting",
  note: "Note",
  task: "Task",
};

export function CadencesClient({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const { data: cadences, isLoading } = useQuery({
    queryKey: ["crm", "cadences", orgId],
    queryFn: () => crmFetch<{ data: Cadence[] }>("cadences", orgId).then((r) => r.data),
  });

  const [open, setOpen] = useState(false);
  const [draftSteps, setDraftSteps] = useState<DraftStep[]>([
    { day_offset: 0, activity_type: "call", subject: "" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [enrollmentsFor, setEnrollmentsFor] = useState<Cadence | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["crm", "cadences", orgId] });

  const { data: enrollments } = useQuery({
    queryKey: ["crm", "cadence-enrollments", orgId, enrollmentsFor?.id],
    enabled: Boolean(enrollmentsFor),
    queryFn: () =>
      crmFetch<{ data: Enrollment[] }>(`cadences/${enrollmentsFor!.id}/enrollments`, orgId).then(
        (r) => r.data,
      ),
  });

  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      crmFetch("cadences", orgId, { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      setOpen(false);
      invalidate();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Failed to create cadence"),
  });

  const toggle = useMutation({
    mutationFn: (cadence: Cadence) =>
      crmFetch(`cadences/${cadence.id}`, orgId, {
        method: "PATCH",
        body: JSON.stringify({ active: !cadence.active }),
      }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => crmFetch(`cadences/${id}`, orgId, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  const unenroll = useMutation({
    mutationFn: (enrollmentId: string) =>
      crmFetch(`enrollments/${enrollmentId}`, orgId, { method: "DELETE" }),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["crm", "cadence-enrollments", orgId] });
      qc.invalidateQueries({ queryKey: ["crm", "activities", orgId] });
    },
  });

  function updateStep(idx: number, patch: Partial<DraftStep>) {
    setDraftSteps((steps) => steps.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const steps = draftSteps
      .filter((s) => s.subject.trim())
      .map((s, idx) => ({ ...s, position: idx }));
    if (steps.length === 0) {
      setError("Add at least one step with a subject.");
      return;
    }
    create.mutate({
      name: String(fd.get("name") ?? ""),
      description: String(fd.get("description") ?? ""),
      steps,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Cadences</h1>
          <p className="text-sm text-muted-foreground">
            Multi-step outreach sequences. Enrolling a lead or contact creates every step as a
            dated task up front.
          </p>
        </div>
        <Button
          onClick={() => {
            setError(null);
            setDraftSteps([{ day_offset: 0, activity_type: "call", subject: "" }]);
            setOpen(true);
          }}
        >
          New cadence
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {(cadences ?? []).length === 0 && !isLoading && (
        <p className="text-sm text-muted-foreground">
          No cadences yet. Try a 3-step intro sequence: day 0 call, day 2 email, day 5 follow-up.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {(cadences ?? []).map((cadence) => (
          <Card key={cadence.id}>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                {cadence.name}
                <Badge variant={cadence.active ? "default" : "outline"}>
                  {cadence.active ? "active" : "paused"}
                </Badge>
              </CardTitle>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => setEnrollmentsFor(cadence)}>
                  {cadence.enrollments.length} enrolled
                </Button>
                <Button variant="ghost" size="sm" onClick={() => toggle.mutate(cadence)}>
                  {cadence.active ? "Pause" : "Activate"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (confirm("Delete this cadence? Enrollments and their open tasks go too.")) {
                      remove.mutate(cadence.id);
                    }
                  }}
                >
                  Delete
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {cadence.description && (
                <p className="text-sm text-muted-foreground">{cadence.description}</p>
              )}
              {cadence.steps.map((step) => (
                <div key={step.id} className="flex items-center gap-2 text-sm">
                  <Badge variant="outline" className="w-14 justify-center text-xs">
                    day {step.day_offset}
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    {TYPE_LABEL[step.activity_type] ?? step.activity_type}
                  </Badge>
                  <span>{step.subject}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Builder */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>New cadence</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required placeholder="New lead intro" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Input id="description" name="description" />
            </div>
            <div className="space-y-2">
              <Label>Steps</Label>
              {draftSteps.map((step, idx) => (
                <div key={idx} className="grid grid-cols-12 items-center gap-1.5">
                  <Input
                    className="col-span-2 h-8 text-xs"
                    type="number"
                    min={0}
                    max={365}
                    title="Days after enrollment"
                    value={step.day_offset}
                    onChange={(e) => updateStep(idx, { day_offset: Number(e.target.value) })}
                  />
                  <select
                    value={step.activity_type}
                    onChange={(e) => updateStep(idx, { activity_type: e.target.value })}
                    className="col-span-3 h-8 rounded-md border border-input bg-transparent px-1 text-xs"
                  >
                    {ACTIVITY_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {TYPE_LABEL[t]}
                      </option>
                    ))}
                  </select>
                  <Input
                    className="col-span-6 h-8 text-xs"
                    placeholder="Subject"
                    value={step.subject}
                    onChange={(e) => updateStep(idx, { subject: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="col-span-1 h-8"
                    onClick={() => setDraftSteps((steps) => steps.filter((_, i) => i !== idx))}
                  >
                    ✕
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setDraftSteps((steps) => [
                    ...steps,
                    { day_offset: (steps[steps.length - 1]?.day_offset ?? 0) + 2, activity_type: "task", subject: "" },
                  ])
                }
              >
                Add step
              </Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="submit" disabled={create.isPending}>
                Create cadence
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Enrollments */}
      <Dialog open={Boolean(enrollmentsFor)} onOpenChange={(o) => !o && setEnrollmentsFor(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Enrollments · {enrollmentsFor?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            {(enrollments ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nobody enrolled yet — use “Enroll” on the Leads screen.
              </p>
            )}
            {(enrollments ?? []).map((enrollment) => (
              <div
                key={enrollment.id}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <span>
                  <span className="font-medium">{enrollment.entity_name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {enrollment.entity_type} · since{" "}
                    {new Date(enrollment.created_at).toLocaleDateString()}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7"
                  onClick={() => unenroll.mutate(enrollment.id)}
                >
                  Unenroll
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
