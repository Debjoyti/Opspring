"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { crmFetch, useTimeline, type TimelineEvent } from "@/lib/crm/client";
import { ACTIVITY_TYPES } from "@/lib/services/crm/types";

const KIND_BADGE: Record<string, string> = {
  call: "Call",
  email: "Email",
  meeting: "Meeting",
  note: "Note",
  task: "Task",
};

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Timeline dialog for any CRM record: merged notes + activities, newest
 * first, with quick-add for both. Opened from list rows via `entityId`.
 */
export function RecordTimeline({
  orgId,
  entityType,
  entityId,
  title,
  onClose,
}: {
  orgId: string;
  entityType: "lead" | "account" | "contact" | "deal";
  entityId: string | null;
  title: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data: events, isLoading } = useTimeline(orgId, entityType, entityId);
  const [noteBody, setNoteBody] = useState("");
  const [activityType, setActivityType] = useState<string>("call");
  const [activitySubject, setActivitySubject] = useState("");
  const [error, setError] = useState<string | null>(null);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["crm", "timeline", orgId, entityType, entityId] });

  const addNote = useMutation({
    mutationFn: () =>
      crmFetch("notes", orgId, {
        method: "POST",
        body: JSON.stringify({ entity_type: entityType, entity_id: entityId, body: noteBody }),
      }),
    onSuccess: () => {
      setNoteBody("");
      setError(null);
      invalidate();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Failed to add note"),
  });

  const addActivity = useMutation({
    mutationFn: () =>
      crmFetch("activities", orgId, {
        method: "POST",
        body: JSON.stringify({
          type: activityType,
          subject: activitySubject,
          related_type: entityType,
          related_id: entityId,
          done: activityType !== "task",
        }),
      }),
    onSuccess: () => {
      setActivitySubject("");
      setError(null);
      invalidate();
      qc.invalidateQueries({ queryKey: ["crm", "activities", orgId] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Failed to log activity"),
  });

  return (
    <Dialog open={Boolean(entityId)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (activitySubject.trim()) addActivity.mutate();
            }}
          >
            <select
              value={activityType}
              onChange={(e) => setActivityType(e.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm"
            >
              {ACTIVITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {KIND_BADGE[t]}
                </option>
              ))}
            </select>
            <input
              value={activitySubject}
              onChange={(e) => setActivitySubject(e.target.value)}
              placeholder="Log an activity…"
              className="h-9 flex-1 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
            />
            <Button type="submit" size="sm" disabled={addActivity.isPending}>
              Log
            </Button>
          </form>

          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (noteBody.trim()) addNote.mutate();
            }}
          >
            <Textarea
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              placeholder="Add a note…"
              rows={2}
            />
            <div className="flex justify-end">
              <Button type="submit" size="sm" variant="outline" disabled={addNote.isPending}>
                Add note
              </Button>
            </div>
          </form>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="space-y-3">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading timeline…</p>
            ) : (events ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              (events ?? []).map((event: TimelineEvent) => (
                <div key={`${event.kind}-${event.id}`} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{KIND_BADGE[event.type] ?? event.type}</Badge>
                      <span className="text-sm font-medium">{event.subject}</span>
                      {event.done === false && (
                        <Badge variant="outline" className="text-xs">
                          open
                        </Badge>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatWhen(event.created_at)}
                    </span>
                  </div>
                  {event.body && (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                      {event.body}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
