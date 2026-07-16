"use client";

import { useState } from "react";
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
import {
  crmFetch,
  usePipelines,
  usePipelineInvalidation,
  type Pipeline,
  type PipelineStage,
} from "@/lib/crm/client";
import { STAGE_KINDS } from "@/lib/services/crm/types";

export function PipelineSettingsClient({ orgId }: { orgId: string }) {
  const { data: pipelines, isLoading } = usePipelines(orgId);
  const invalidate = usePipelineInvalidation(orgId);

  const [newPipelineOpen, setNewPipelineOpen] = useState(false);
  const [stageDialog, setStageDialog] = useState<{
    pipeline: Pipeline;
    stage: PipelineStage | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      invalidate();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      return false;
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Pipeline settings</h1>
          <p className="text-sm text-muted-foreground">
            Stages, win probabilities, and pipelines for the deals board.
          </p>
        </div>
        <Button onClick={() => setNewPipelineOpen(true)}>New pipeline</Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        {(pipelines ?? []).map((pipeline) => (
          <Card key={pipeline.id}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2 text-base">
                {pipeline.name}
                {pipeline.is_default && <Badge variant="secondary">default</Badge>}
              </CardTitle>
              <div className="flex gap-1">
                {!pipeline.is_default && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      run(() =>
                        crmFetch(`pipelines/${pipeline.id}`, orgId, {
                          method: "PATCH",
                          body: JSON.stringify({ is_default: true }),
                        }),
                      )
                    }
                  >
                    Make default
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const name = prompt("Rename pipeline", pipeline.name);
                    if (name && name.trim()) {
                      run(() =>
                        crmFetch(`pipelines/${pipeline.id}`, orgId, {
                          method: "PATCH",
                          body: JSON.stringify({ name: name.trim() }),
                        }),
                      );
                    }
                  }}
                >
                  Rename
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (confirm(`Delete pipeline "${pipeline.name}"? Deals must be moved out first.`)) {
                      run(() => crmFetch(`pipelines/${pipeline.id}`, orgId, { method: "DELETE" }));
                    }
                  }}
                >
                  Delete
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {pipeline.stages.map((stage) => (
                <div
                  key={stage.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{stage.name}</span>
                    <Badge
                      variant={
                        stage.kind === "won"
                          ? "default"
                          : stage.kind === "lost"
                            ? "destructive"
                            : "outline"
                      }
                      className="text-xs"
                    >
                      {stage.kind}
                    </Badge>
                    {stage.kind === "open" && (
                      <span className="text-xs text-muted-foreground">{stage.probability}%</span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7"
                      onClick={() => setStageDialog({ pipeline, stage })}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7"
                      onClick={() => {
                        if (confirm(`Delete stage "${stage.name}"? Deals must be moved out first.`)) {
                          run(() => crmFetch(`stages/${stage.id}`, orgId, { method: "DELETE" }));
                        }
                      }}
                    >
                      ✕
                    </Button>
                  </div>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStageDialog({ pipeline, stage: null })}
              >
                Add stage
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* New pipeline */}
      <Dialog open={newPipelineOpen} onOpenChange={setNewPipelineOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New pipeline</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
              if (!name) return;
              const ok = await run(() =>
                crmFetch("pipelines", orgId, { method: "POST", body: JSON.stringify({ name }) }),
              );
              if (ok) setNewPipelineOpen(false);
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required placeholder="Enterprise, Renewals, Partner…" />
            </div>
            <p className="text-sm text-muted-foreground">
              Starts with the standard five stages — edit them afterwards.
            </p>
            <DialogFooter>
              <Button type="submit">Create pipeline</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add / edit stage */}
      <Dialog open={Boolean(stageDialog)} onOpenChange={(o) => !o && setStageDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {stageDialog?.stage ? "Edit stage" : `Add stage to ${stageDialog?.pipeline.name}`}
            </DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!stageDialog) return;
              const fd = new FormData(e.currentTarget);
              const values = {
                name: String(fd.get("name") ?? "").trim(),
                probability: Number(fd.get("probability") ?? 50),
                kind: String(fd.get("kind") ?? "open"),
                position: Number(fd.get("position") ?? stageDialog.pipeline.stages.length),
              };
              const ok = await run(() =>
                stageDialog.stage
                  ? crmFetch(`stages/${stageDialog.stage.id}`, orgId, {
                      method: "PATCH",
                      body: JSON.stringify(values),
                    })
                  : crmFetch("stages", orgId, {
                      method: "POST",
                      body: JSON.stringify({ ...values, pipeline_id: stageDialog.pipeline.id }),
                    }),
              );
              if (ok) setStageDialog(null);
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="stage-name">Name</Label>
              <Input
                id="stage-name"
                name="name"
                required
                defaultValue={stageDialog?.stage?.name ?? ""}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="stage-prob">Win %</Label>
                <Input
                  id="stage-prob"
                  name="probability"
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={stageDialog?.stage?.probability ?? 50}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stage-kind">Kind</Label>
                <select
                  id="stage-kind"
                  name="kind"
                  defaultValue={stageDialog?.stage?.kind ?? "open"}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  {STAGE_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stage-pos">Order</Label>
                <Input
                  id="stage-pos"
                  name="position"
                  type="number"
                  min={0}
                  defaultValue={stageDialog?.stage?.position ?? stageDialog?.pipeline.stages.length ?? 0}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit">{stageDialog?.stage ? "Save" : "Add stage"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
