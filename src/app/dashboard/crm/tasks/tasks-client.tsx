"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
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

type Activity = {
  id: string;
  type: string;
  subject: string;
  notes: string | null;
  due_at: string | null;
  done: boolean;
  created_at: string;
};

type Bucket = { title: string; empty: string; tasks: Activity[] };

function formatDue(iso: string | null): string {
  if (!iso) return "No due date";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function TasksClient({ orgId }: { orgId: string }) {
  const { data, isLoading } = useCrmList<Activity>("activities", orgId);
  const create = useCrmCreate("activities", orgId);
  const update = useCrmUpdate("activities", orgId);
  const remove = useCrmDelete("activities", orgId);
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Bucket boundaries are frozen at mount — fine for a view that's refetched
  // on every mutation; an impure Date.now() inside useMemo trips the compiler.
  const [now] = useState(() => Date.now());

  const buckets = useMemo<Bucket[]>(() => {
    const tasks = (data ?? []).filter((a) => a.type === "task");
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    const overdue: Activity[] = [];
    const today: Activity[] = [];
    const upcoming: Activity[] = [];
    const done: Activity[] = [];
    for (const task of tasks) {
      if (task.done) {
        done.push(task);
        continue;
      }
      const due = task.due_at ? new Date(task.due_at).getTime() : null;
      if (due !== null && due < now) overdue.push(task);
      else if (due !== null && due <= endOfToday.getTime()) today.push(task);
      else upcoming.push(task);
    }
    const byDue = (a: Activity, b: Activity) =>
      (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999");
    overdue.sort(byDue);
    today.sort(byDue);
    upcoming.sort(byDue);
    return [
      { title: "Overdue", empty: "Nothing overdue.", tasks: overdue },
      { title: "Due today", empty: "Nothing due today.", tasks: today },
      { title: "Upcoming", empty: "No upcoming tasks.", tasks: upcoming },
      { title: "Done", empty: "Nothing completed yet.", tasks: done.slice(0, 20) },
    ];
  }, [data, now]);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const fd = new FormData(e.currentTarget);
    const dueRaw = String(fd.get("due_at") ?? "");
    try {
      await create.mutateAsync({
        type: "task",
        subject: String(fd.get("subject") ?? ""),
        notes: String(fd.get("notes") ?? ""),
        due_at: dueRaw ? new Date(dueRaw).toISOString() : "",
        done: false,
      });
      setOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Tasks</h1>
        <Button onClick={() => setOpen(true)}>New task</Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading tasks…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {buckets.map((bucket) => (
            <div key={bucket.title} className="rounded-lg border bg-muted/30">
              <div className="flex items-center justify-between border-b px-3 py-2">
                <span className="text-sm font-medium">{bucket.title}</span>
                <Badge
                  variant={bucket.title === "Overdue" && bucket.tasks.length > 0 ? "destructive" : "secondary"}
                >
                  {bucket.tasks.length}
                </Badge>
              </div>
              <div className="space-y-2 p-2">
                {bucket.tasks.length === 0 ? (
                  <p className="px-1 py-2 text-xs text-muted-foreground">{bucket.empty}</p>
                ) : (
                  bucket.tasks.map((task) => (
                    <div key={task.id} className="rounded-md border bg-background p-2 text-sm shadow-sm">
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={task.done}
                          onChange={(e) =>
                            update.mutate({ id: task.id, values: { done: e.target.checked } })
                          }
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <div className={task.done ? "line-through opacity-60" : "font-medium"}>
                            {task.subject}
                          </div>
                          <div className="text-xs text-muted-foreground">{formatDue(task.due_at)}</div>
                          {task.notes && (
                            <div className="mt-1 truncate text-xs text-muted-foreground">{task.notes}</div>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1.5 text-xs"
                          onClick={() => {
                            if (confirm("Delete this task?")) remove.mutate(task.id);
                          }}
                        >
                          ✕
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New task</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="subject">Task</Label>
              <Input id="subject" name="subject" required placeholder="Follow up with…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="due_at">Due</Label>
              <Input id="due_at" name="due_at" type="datetime-local" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Input id="notes" name="notes" />
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <DialogFooter>
              <Button type="submit" disabled={create.isPending}>
                Create task
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
