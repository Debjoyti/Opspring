"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useCrmCreate,
  useCrmList,
  useCrmUpdate,
  useCrmDelete,
  usePipelines,
  type Pipeline,
  type PipelineStage,
} from "@/lib/crm/client";
import { RecordTimeline } from "@/components/crm/record-timeline";
import { DealItemsDialog } from "@/components/crm/deal-items-dialog";
import { formatCurrency } from "@/lib/format";

type Deal = {
  id: string;
  name: string;
  amount: number;
  currency: string;
  pipeline_id: string;
  stage_id: string;
  close_date: string | null;
  closed_at: string | null;
  lost_reason: string | null;
  stage: { id: string; name: string; kind: string; probability: number } | null;
  account: { id: string; name: string } | null;
};

export function DealsClient({ orgId }: { orgId: string }) {
  const { data: pipelines, isLoading: pipelinesLoading } = usePipelines(orgId);
  const { data, isLoading } = useCrmList<Deal>("deals", orgId);
  const create = useCrmCreate("deals", orgId);
  const update = useCrmUpdate("deals", orgId);
  const remove = useCrmDelete("deals", orgId);

  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [timelineDeal, setTimelineDeal] = useState<Deal | null>(null);
  const [itemsDeal, setItemsDeal] = useState<Deal | null>(null);
  const [lostPrompt, setLostPrompt] = useState<{ deal: Deal; stage: PipelineStage } | null>(null);
  const [lostReason, setLostReason] = useState("");

  const activePipeline: Pipeline | undefined = useMemo(() => {
    if (!pipelines || pipelines.length === 0) return undefined;
    return (
      pipelines.find((p) => p.id === pipelineId) ??
      pipelines.find((p) => p.is_default) ??
      pipelines[0]
    );
  }, [pipelines, pipelineId]);

  const stages = activePipeline?.stages ?? [];
  const deals = (data ?? []).filter((d) => d.pipeline_id === activePipeline?.id);
  const byStage = (stageId: string) => deals.filter((d) => d.stage_id === stageId);
  const stageValue = (stageId: string) =>
    byStage(stageId).reduce((sum, d) => sum + Number(d.amount ?? 0), 0);

  function moveToStage(deal: Deal, stage: PipelineStage) {
    if (stage.kind === "lost") {
      setLostReason("");
      setLostPrompt({ deal, stage });
      return;
    }
    update.mutate({ id: deal.id, values: { stage_id: stage.id } });
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await create.mutateAsync({
        name: String(fd.get("name")),
        amount: Number(fd.get("amount") || 0),
        currency: String(fd.get("currency") || "USD"),
        stage_id: String(fd.get("stage_id") || "") || undefined,
        pipeline_id: activePipeline?.id,
        close_date: String(fd.get("close_date") || ""),
      });
      setOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  if (pipelinesLoading) {
    return <p className="text-sm text-muted-foreground">Loading pipelines…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Deals</h1>
          {(pipelines ?? []).length > 1 && (
            <select
              value={activePipeline?.id ?? ""}
              onChange={(e) => setPipelineId(e.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm"
            >
              {(pipelines ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/crm/settings?org=${orgId}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Edit stages
          </Link>
          <Button onClick={() => setOpen(true)}>New deal</Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading pipeline…</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {stages.map((stage) => (
            <div key={stage.id} className="flex flex-col rounded-lg border bg-muted/30">
              <div className="border-b px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{stage.name}</span>
                  {stage.kind === "open" ? (
                    <span className="text-xs text-muted-foreground">{stage.probability}%</span>
                  ) : (
                    <Badge variant={stage.kind === "won" ? "default" : "destructive"} className="text-xs">
                      {stage.kind}
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {byStage(stage.id).length} · {formatCurrency(stageValue(stage.id))}
                </div>
              </div>
              <div className="flex-1 space-y-2 p-2">
                {byStage(stage.id).map((deal) => (
                  <div key={deal.id} className="rounded-md border bg-background p-2 text-sm shadow-sm">
                    <button
                      className="w-full text-left font-medium hover:underline"
                      onClick={() => setTimelineDeal(deal)}
                    >
                      {deal.name}
                    </button>
                    <div className="text-xs text-muted-foreground">
                      {formatCurrency(Number(deal.amount ?? 0), deal.currency)}
                      {deal.account ? ` · ${deal.account.name}` : ""}
                    </div>
                    {deal.lost_reason && (
                      <div className="mt-1 text-xs text-destructive">{deal.lost_reason}</div>
                    )}
                    <div className="mt-2 flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        title="Line items"
                        onClick={() => setItemsDeal(deal)}
                      >
                        Items
                      </Button>
                      <select
                        value={deal.stage_id}
                        onChange={(e) => {
                          const target = stages.find((s) => s.id === e.target.value);
                          if (target) moveToStage(deal, target);
                        }}
                        className="h-6 flex-1 rounded border border-input bg-transparent px-1 text-xs"
                      >
                        {stages.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => {
                          if (confirm("Delete this deal?")) remove.mutate(deal.id);
                        }}
                      >
                        ✕
                      </Button>
                    </div>
                  </div>
                ))}
                {byStage(stage.id).length === 0 && (
                  <p className="px-1 py-2 text-xs text-muted-foreground">No deals</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New deal</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="name">Deal name</Label>
              <Input id="name" name="name" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="amount">Amount</Label>
                <Input id="amount" name="amount" type="number" step="0.01" defaultValue={0} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="currency">Currency</Label>
                <Input id="currency" name="currency" defaultValue="USD" maxLength={3} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="stage_id">Stage</Label>
                <select
                  id="stage_id"
                  name="stage_id"
                  defaultValue={stages.find((s) => s.kind === "open")?.id ?? ""}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="close_date">Close date</Label>
                <Input id="close_date" name="close_date" type="date" />
              </div>
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <DialogFooter>
              <Button type="submit" disabled={create.isPending}>
                Create deal
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(lostPrompt)} onOpenChange={(o) => !o && setLostPrompt(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as lost</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!lostPrompt) return;
              update.mutate({
                id: lostPrompt.deal.id,
                values: { stage_id: lostPrompt.stage.id, lost_reason: lostReason || undefined },
              });
              setLostPrompt(null);
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="lost_reason">Why was this deal lost?</Label>
              <Input
                id="lost_reason"
                value={lostReason}
                onChange={(e) => setLostReason(e.target.value)}
                placeholder="Price, competitor, timing…"
              />
            </div>
            <DialogFooter>
              <Button type="submit" variant="destructive">
                Mark lost
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <RecordTimeline
        orgId={orgId}
        entityType="deal"
        entityId={timelineDeal?.id ?? null}
        title={timelineDeal?.name ?? "Deal"}
        onClose={() => setTimelineDeal(null)}
      />

      <DealItemsDialog
        orgId={orgId}
        dealId={itemsDeal?.id ?? null}
        dealName={itemsDeal?.name ?? "Deal"}
        currency={itemsDeal?.currency ?? "USD"}
        onClose={() => setItemsDeal(null)}
      />
    </div>
  );
}
