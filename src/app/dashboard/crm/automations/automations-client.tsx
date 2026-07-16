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
import { crmFetch, usePipelines } from "@/lib/crm/client";
import type { AutomationAction, AutomationEvent } from "@/lib/services/crm/types";

type Rule = {
  id: string;
  name: string;
  enabled: boolean;
  trigger_event: AutomationEvent;
  condition_stage_id: string | null;
  actions: AutomationAction[];
};

type Run = {
  id: string;
  rule_name: string;
  trigger_event: string;
  entity_type: string;
  results: { type: string; ok: boolean; detail: string }[];
  created_at: string;
};

const EVENT_LABEL: Record<AutomationEvent, string> = {
  lead_created: "Lead created",
  deal_created: "Deal created",
  deal_stage_changed: "Deal enters stage",
  quote_accepted: "Quote accepted",
  invoice_paid: "Invoice paid",
};

function actionSummary(action: AutomationAction): string {
  if (action.type === "assign_round_robin") return "Assign owner (round robin)";
  if (action.type === "create_task")
    return `Create task “${action.subject}” (due in ${action.due_in_days}d)`;
  return `Add tags: ${action.tags.join(", ")}`;
}

export function AutomationsClient({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const { data: pipelines } = usePipelines(orgId);
  const { data: rules, isLoading } = useQuery({
    queryKey: ["crm", "automations", orgId],
    queryFn: () => crmFetch<{ data: Rule[] }>("automations", orgId).then((r) => r.data),
  });
  const { data: runs } = useQuery({
    queryKey: ["crm", "automation-runs", orgId],
    queryFn: () => crmFetch<{ data: Run[] }>("automations/runs", orgId).then((r) => r.data),
  });

  const [open, setOpen] = useState(false);
  const [event, setEvent] = useState<AutomationEvent>("lead_created");
  const [error, setError] = useState<string | null>(null);
  // Action builder state
  const [useAssign, setUseAssign] = useState(true);
  const [useTask, setUseTask] = useState(false);
  const [taskSubject, setTaskSubject] = useState("");
  const [taskDueDays, setTaskDueDays] = useState(3);
  const [useTags, setUseTags] = useState(false);
  const [tags, setTags] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["crm", "automations", orgId] });
    qc.invalidateQueries({ queryKey: ["crm", "automation-runs", orgId] });
  };

  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      crmFetch("automations", orgId, { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      setOpen(false);
      invalidate();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Failed to create rule"),
  });

  const toggle = useMutation({
    mutationFn: (rule: Rule) =>
      crmFetch(`automations/${rule.id}`, orgId, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !rule.enabled }),
      }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => crmFetch(`automations/${id}`, orgId, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  const stages = (pipelines ?? []).flatMap((p) =>
    p.stages.map((s) => ({ ...s, pipelineName: p.name })),
  );

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const actions: Record<string, unknown>[] = [];
    if (useAssign && event === "lead_created") actions.push({ type: "assign_round_robin" });
    if (useTask && taskSubject.trim()) {
      actions.push({ type: "create_task", subject: taskSubject.trim(), due_in_days: taskDueDays });
    }
    if (useTags && tags.trim()) {
      actions.push({
        type: "add_tags",
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      });
    }
    if (actions.length === 0) {
      setError("Pick at least one action.");
      return;
    }
    create.mutate({
      name: String(fd.get("name") ?? ""),
      trigger_event: event,
      condition_stage_id:
        event === "deal_stage_changed" ? String(fd.get("stage_id") ?? "") || undefined : undefined,
      actions,
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Automations</h1>
          <p className="text-sm text-muted-foreground">
            Rules run instantly when CRM events happen; every run is logged below.
          </p>
        </div>
        <Button
          onClick={() => {
            setError(null);
            setOpen(true);
          }}
        >
          New rule
        </Button>
      </div>

      <div className="space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {(rules ?? []).length === 0 && !isLoading && (
          <p className="text-sm text-muted-foreground">
            No rules yet. Try “when a lead is created → assign round robin + create a follow-up
            task”.
          </p>
        )}
        {(rules ?? []).map((rule) => {
          const stage = stages.find((s) => s.id === rule.condition_stage_id);
          return (
            <Card key={rule.id}>
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  {rule.name}
                  <Badge variant={rule.enabled ? "default" : "outline"}>
                    {rule.enabled ? "on" : "off"}
                  </Badge>
                </CardTitle>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => toggle.mutate(rule)}>
                    {rule.enabled ? "Disable" : "Enable"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (confirm("Delete this rule?")) remove.mutate(rule.id);
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="text-sm">
                <span className="font-medium">{EVENT_LABEL[rule.trigger_event]}</span>
                {stage && (
                  <span className="text-muted-foreground">
                    {" "}
                    “{stage.name}” ({stage.pipelineName})
                  </span>
                )}
                <span className="text-muted-foreground"> → </span>
                {rule.actions.map((a, i) => (
                  <span key={i}>
                    {i > 0 && <span className="text-muted-foreground"> + </span>}
                    {actionSummary(a)}
                  </span>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent runs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(runs ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing has fired yet.</p>
          )}
          {(runs ?? []).map((run) => (
            <div key={run.id} className="rounded-md border px-3 py-2 text-sm">
              <div className="flex items-center justify-between">
                <span>
                  <span className="font-medium">{run.rule_name}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {run.trigger_event.replaceAll("_", " ")} · {run.entity_type}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(run.created_at).toLocaleString()}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {run.results.map((result, i) => (
                  <Badge
                    key={i}
                    variant={result.ok ? "secondary" : "destructive"}
                    className="text-xs font-normal"
                    title={result.detail}
                  >
                    {result.type}: {result.ok ? "ok" : result.detail}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New automation rule</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required placeholder="New lead intake" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="event">When</Label>
              <select
                id="event"
                value={event}
                onChange={(e) => setEvent(e.target.value as AutomationEvent)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                {(Object.keys(EVENT_LABEL) as AutomationEvent[]).map((ev) => (
                  <option key={ev} value={ev}>
                    {EVENT_LABEL[ev]}
                  </option>
                ))}
              </select>
            </div>
            {event === "deal_stage_changed" && (
              <div className="space-y-1.5">
                <Label htmlFor="stage_id">Stage (optional — any stage if empty)</Label>
                <select
                  id="stage_id"
                  name="stage_id"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  <option value="">— any stage —</option>
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.pipelineName})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Then</Label>
              {event === "lead_created" && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={useAssign}
                    onChange={(e) => setUseAssign(e.target.checked)}
                  />
                  Assign owner (round robin)
                </label>
              )}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={useTask}
                  onChange={(e) => setUseTask(e.target.checked)}
                />
                Create a task
              </label>
              {useTask && (
                <div className="grid grid-cols-3 gap-2 pl-6">
                  <Input
                    className="col-span-2 h-8 text-xs"
                    placeholder="Task subject"
                    value={taskSubject}
                    onChange={(e) => setTaskSubject(e.target.value)}
                  />
                  <Input
                    className="h-8 text-xs"
                    type="number"
                    min={0}
                    max={365}
                    title="Due in days"
                    value={taskDueDays}
                    onChange={(e) => setTaskDueDays(Number(e.target.value))}
                  />
                </div>
              )}
              {event !== "quote_accepted" && event !== "invoice_paid" && (
                <>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={useTags}
                      onChange={(e) => setUseTags(e.target.checked)}
                    />
                    Add tags
                  </label>
                  {useTags && (
                    <Input
                      className="ml-6 h-8 w-64 text-xs"
                      placeholder="hot, inbound (comma-separated)"
                      value={tags}
                      onChange={(e) => setTags(e.target.value)}
                    />
                  )}
                </>
              )}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="submit" disabled={create.isPending}>
                Create rule
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
