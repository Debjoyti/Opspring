"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCrmCreate, useCrmList, useCrmUpdate, useCrmDelete } from "@/lib/crm/client";
import { DEAL_STAGES, type DealStage } from "@/lib/services/crm/types";
import { formatCurrency } from "@/lib/format";

type Deal = {
  id: string;
  name: string;
  amount: number;
  currency: string;
  stage: DealStage;
  close_date: string | null;
};

const STAGE_LABEL: Record<DealStage, string> = {
  qualified: "Qualified",
  proposal: "Proposal",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
};

export function DealsClient({ orgId }: { orgId: string }) {
  const { data, isLoading } = useCrmList<Deal>("deals", orgId);
  const create = useCrmCreate("deals", orgId);
  const update = useCrmUpdate("deals", orgId);
  const remove = useCrmDelete("deals", orgId);

  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const deals = data ?? [];
  const byStage = (stage: DealStage) => deals.filter((d) => d.stage === stage);
  const stageValue = (stage: DealStage) =>
    byStage(stage).reduce((sum, d) => sum + Number(d.amount ?? 0), 0);

  function moveStage(deal: Deal, direction: 1 | -1) {
    const idx = DEAL_STAGES.indexOf(deal.stage);
    const next = DEAL_STAGES[idx + direction];
    if (next) update.mutate({ id: deal.id, values: { stage: next } });
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
        stage: String(fd.get("stage") || "qualified"),
        close_date: String(fd.get("close_date") || ""),
      });
      setOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Deals pipeline</h1>
        <Button onClick={() => setOpen(true)}>New deal</Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading pipeline…</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {DEAL_STAGES.map((stage) => (
            <div key={stage} className="flex flex-col rounded-lg border bg-muted/30">
              <div className="border-b px-3 py-2">
                <div className="text-sm font-medium">{STAGE_LABEL[stage]}</div>
                <div className="text-xs text-muted-foreground">
                  {byStage(stage).length} · {formatCurrency(stageValue(stage))}
                </div>
              </div>
              <div className="flex-1 space-y-2 p-2">
                {byStage(stage).map((deal) => {
                  const idx = DEAL_STAGES.indexOf(deal.stage);
                  return (
                    <div key={deal.id} className="rounded-md border bg-background p-2 text-sm shadow-sm">
                      <div className="font-medium">{deal.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatCurrency(Number(deal.amount ?? 0), deal.currency)}
                      </div>
                      <div className="mt-2 flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 px-2"
                          disabled={idx === 0}
                          onClick={() => moveStage(deal, -1)}
                        >
                          ←
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 px-2"
                          disabled={idx === DEAL_STAGES.length - 1}
                          onClick={() => moveStage(deal, 1)}
                        >
                          →
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-auto h-6 px-2 text-xs"
                          onClick={() => {
                            if (confirm("Delete this deal?")) remove.mutate(deal.id);
                          }}
                        >
                          ✕
                        </Button>
                      </div>
                    </div>
                  );
                })}
                {byStage(stage).length === 0 && (
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
                <Label htmlFor="stage">Stage</Label>
                <select
                  id="stage"
                  name="stage"
                  defaultValue="qualified"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  {DEAL_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {STAGE_LABEL[s]}
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
    </div>
  );
}
