"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  useCrmCreate,
  useCrmDelete,
  useCrmList,
  useCrmUpdate,
} from "@/lib/crm/client";
import { MERGE_FIELDS } from "@/lib/services/crm/templates";

type Template = {
  id: string;
  name: string;
  subject: string;
  body: string;
};

type Lead = { id: string; name: string; status: string };
type Contact = { id: string; first_name: string; last_name: string | null };

type Rendered = {
  subject: string;
  body: string;
  to: string | null;
  missing: string[];
};

export function TemplatesClient({ orgId }: { orgId: string }) {
  const { data: templates, isLoading } = useCrmList<Template>("templates", orgId);
  const { data: leads } = useCrmList<Lead>("leads", orgId);
  const { data: contacts } = useCrmList<Contact>("contacts", orgId);
  const create = useCrmCreate("templates", orgId);
  const update = useCrmUpdate("templates", orgId);
  const remove = useCrmDelete("templates", orgId);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Template | null>(null);
  const [target, setTarget] = useState<string>(""); // "lead:<id>" | "contact:<id>"
  const [rendered, setRendered] = useState<Rendered | null>(null);

  const render = useMutation({
    mutationFn: ({ template, entityType, entityId }: { template: Template; entityType: string; entityId: string }) =>
      crmFetch<{ data: Rendered }>(`templates/${template.id}/render`, orgId, {
        method: "POST",
        body: JSON.stringify({ entity_type: entityType, entity_id: entityId }),
      }),
    onSuccess: (res) => setRendered(res.data),
    onError: (err) => alert(err instanceof Error ? err.message : "Preview failed"),
  });

  function preview(template: Template) {
    setSelected(template);
    setRendered(null);
    if (target) {
      const [entityType, entityId] = target.split(":");
      render.mutate({ template, entityType, entityId });
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const fd = new FormData(e.currentTarget);
    const values = {
      name: String(fd.get("name") ?? ""),
      subject: String(fd.get("subject") ?? ""),
      body: String(fd.get("body") ?? ""),
    };
    try {
      if (editing) await update.mutateAsync({ id: editing.id, values });
      else await create.mutateAsync(values);
      setFormOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Email templates</h1>
          <p className="text-sm text-muted-foreground">
            Merge fields: {MERGE_FIELDS.map((f) => `{{${f}}}`).join(" ")}
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setFormError(null);
            setFormOpen(true);
          }}
        >
          New template
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {(templates ?? []).length === 0 && !isLoading && (
            <p className="text-sm text-muted-foreground">No templates yet.</p>
          )}
          {(templates ?? []).map((template) => (
            <Card key={template.id} className={selected?.id === template.id ? "border-primary" : ""}>
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-base">{template.name}</CardTitle>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => preview(template)}>
                    Preview
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditing(template);
                      setFormError(null);
                      setFormOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (confirm("Delete this template?")) remove.mutate(template.id);
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-medium">{template.subject}</p>
                <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-muted-foreground">
                  {template.body}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="target">Render for</Label>
              <select
                id="target"
                value={target}
                onChange={(e) => {
                  setTarget(e.target.value);
                  setRendered(null);
                  if (selected && e.target.value) {
                    const [entityType, entityId] = e.target.value.split(":");
                    render.mutate({ template: selected, entityType, entityId });
                  }
                }}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option value="">— pick a lead or contact —</option>
                <optgroup label="Leads">
                  {(leads ?? [])
                    .filter((l) => l.status !== "converted")
                    .map((l) => (
                      <option key={l.id} value={`lead:${l.id}`}>
                        {l.name}
                      </option>
                    ))}
                </optgroup>
                <optgroup label="Contacts">
                  {(contacts ?? []).map((c) => (
                    <option key={c.id} value={`contact:${c.id}`}>
                      {[c.first_name, c.last_name].filter(Boolean).join(" ")}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            {!selected && (
              <p className="text-sm text-muted-foreground">
                Pick a template on the left, then a recipient.
              </p>
            )}
            {render.isPending && <p className="text-sm text-muted-foreground">Rendering…</p>}
            {rendered && (
              <div className="space-y-2">
                {rendered.missing.length > 0 && (
                  <p className="text-xs text-amber-600">
                    Missing fields rendered empty: {rendered.missing.join(", ")}
                  </p>
                )}
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">To: {rendered.to ?? "—"}</div>
                  <div className="mt-1 text-sm font-medium">{rendered.subject}</div>
                  <p className="mt-2 whitespace-pre-wrap text-sm">{rendered.body}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      navigator.clipboard.writeText(`Subject: ${rendered.subject}\n\n${rendered.body}`)
                    }
                  >
                    Copy
                  </Button>
                  {rendered.to && (
                    <a
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                      href={`mailto:${encodeURIComponent(rendered.to)}?subject=${encodeURIComponent(rendered.subject)}&body=${encodeURIComponent(rendered.body)}`}
                    >
                      Open in mail app
                    </a>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit template" : "New template"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required defaultValue={editing?.name ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                name="subject"
                required
                defaultValue={editing?.subject ?? ""}
                placeholder="Quick question, {{first_name}}"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="body">Body</Label>
              <Textarea
                id="body"
                name="body"
                required
                rows={8}
                defaultValue={editing?.body ?? ""}
                placeholder={"Hi {{first_name}},\n\nSaw that {{company}} is …"}
              />
              <p className="text-xs text-muted-foreground">
                Available: {MERGE_FIELDS.map((f) => `{{${f}}}`).join(" ")}
              </p>
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <DialogFooter>
              <Button type="submit" disabled={create.isPending || update.isPending}>
                {editing ? "Save changes" : "Create template"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

    </div>
  );
}
