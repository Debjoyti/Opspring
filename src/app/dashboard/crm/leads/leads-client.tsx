"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  crmFetch,
  downloadCsvExport,
  useCrmCreate,
  useCrmDelete,
  useCrmList,
  useCrmUpdate,
} from "@/lib/crm/client";
import { RecordTimeline } from "@/components/crm/record-timeline";
import { LEAD_STATUSES } from "@/lib/services/crm/types";

type Lead = {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  source: string | null;
  status: string;
  score: number | null;
  score_reason: string | null;
  score_source: string | null;
  tags: string[];
  converted_deal_id: string | null;
};

type DuplicateGroup = {
  field: string;
  value: string;
  ids: string[];
  records: (Lead | undefined)[];
};

type SavedView = {
  id: string;
  resource: string;
  name: string;
  filters: { q?: string; status?: string; tag?: string };
};

type CadenceOption = { id: string; name: string; active: boolean };

function scoreVariant(score: number): string {
  if (score >= 70) return "bg-emerald-600 text-white";
  if (score >= 40) return "bg-amber-500 text-white";
  return "bg-muted text-muted-foreground";
}

const FIELDS = [
  { name: "name", label: "Name", required: true },
  { name: "company", label: "Company" },
  { name: "email", label: "Email", type: "email" },
  { name: "phone", label: "Phone", type: "tel" },
  { name: "title", label: "Job title" },
  { name: "source", label: "Source", placeholder: "Website, referral, event…" },
] as const;

export function LeadsClient({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useCrmList<Lead>("leads", orgId);
  const create = useCrmCreate("leads", orgId);
  const update = useCrmUpdate("leads", orgId);
  const remove = useCrmDelete("leads", orgId);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [convertLead, setConvertLead] = useState<Lead | null>(null);
  const [dupesOpen, setDupesOpen] = useState(false);
  const [dupeGroups, setDupeGroups] = useState<DuplicateGroup[] | null>(null);
  const [timelineLead, setTimelineLead] = useState<Lead | null>(null);
  const [busyMessage, setBusyMessage] = useState<string | null>(null);

  // Filters + saved views
  const [filterQ, setFilterQ] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [activeViewId, setActiveViewId] = useState("");

  const invalidateLeads = () => qc.invalidateQueries({ queryKey: ["crm", "leads", orgId] });

  const { data: views } = useQuery({
    queryKey: ["crm", "views", orgId],
    queryFn: () =>
      crmFetch<{ data: SavedView[] }>("views", orgId).then((r) =>
        r.data.filter((v) => v.resource === "leads"),
      ),
  });

  const { data: cadenceOptions } = useQuery({
    queryKey: ["crm", "cadences", orgId],
    queryFn: () =>
      crmFetch<{ data: CadenceOption[] }>("cadences", orgId).then((r) =>
        r.data.filter((c) => c.active),
      ),
  });

  const [enrollLead, setEnrollLead] = useState<Lead | null>(null);
  const doEnroll = useMutation({
    mutationFn: ({ cadenceId, leadId }: { cadenceId: string; leadId: string }) =>
      crmFetch(`cadences/${cadenceId}/enroll`, orgId, {
        method: "POST",
        body: JSON.stringify({ entity_type: "lead", entity_id: leadId }),
      }),
    onSuccess: () => {
      setEnrollLead(null);
      qc.invalidateQueries({ queryKey: ["crm", "cadences", orgId] });
      qc.invalidateQueries({ queryKey: ["crm", "activities", orgId] });
    },
    onError: (err) =>
      alert(err instanceof Error && err.message === "already_enrolled"
        ? "This lead is already enrolled in that cadence."
        : err instanceof Error ? err.message : "Enroll failed"),
  });
  const invalidateViews = () => qc.invalidateQueries({ queryKey: ["crm", "views", orgId] });

  function applyView(view: SavedView | null) {
    setActiveViewId(view?.id ?? "");
    setFilterQ(view?.filters.q ?? "");
    setFilterStatus(view?.filters.status ?? "");
    setFilterTag(view?.filters.tag ?? "");
  }

  async function saveCurrentView() {
    const name = prompt("Name this view", "My leads view");
    if (!name?.trim()) return;
    const filters: Record<string, string> = {};
    if (filterQ) filters.q = filterQ;
    if (filterStatus) filters.status = filterStatus;
    if (filterTag) filters.tag = filterTag;
    await crmFetch("views", orgId, {
      method: "POST",
      body: JSON.stringify({ resource: "leads", name: name.trim(), filters }),
    });
    invalidateViews();
  }

  async function deleteActiveView() {
    if (!activeViewId) return;
    await crmFetch(`views/${activeViewId}`, orgId, { method: "DELETE" });
    applyView(null);
    invalidateViews();
  }

  const doImport = useMutation({
    mutationFn: (csv: string) =>
      crmFetch<{ data: { imported: number; skipped: { line: number; reason: string }[] } }>(
        "leads/import",
        orgId,
        { method: "POST", body: JSON.stringify({ csv }) },
      ),
    onSuccess: (res) => {
      const { imported, skipped } = res.data;
      setImportResult(
        `Imported ${imported} lead${imported === 1 ? "" : "s"}.` +
          (skipped.length > 0
            ? ` Skipped ${skipped.length}: ${skipped
                .slice(0, 5)
                .map((s) => `line ${s.line} (${s.reason})`)
                .join(", ")}${skipped.length > 5 ? "…" : ""}`
            : ""),
      );
      invalidateLeads();
    },
    onError: (err) =>
      setImportResult(err instanceof Error ? err.message : "Import failed"),
  });

  const doConvert = useMutation({
    mutationFn: (input: { id: string; create_deal: boolean; deal_name?: string; deal_amount?: number }) =>
      crmFetch(`leads/${input.id}/convert`, orgId, {
        method: "POST",
        body: JSON.stringify({
          create_deal: input.create_deal,
          deal_name: input.deal_name,
          deal_amount: input.deal_amount,
        }),
      }),
    onSuccess: () => {
      setConvertLead(null);
      invalidateLeads();
      qc.invalidateQueries({ queryKey: ["crm", "deals", orgId] });
      qc.invalidateQueries({ queryKey: ["crm", "contacts", orgId] });
      qc.invalidateQueries({ queryKey: ["crm", "accounts", orgId] });
    },
  });

  async function runAction(label: string, action: () => Promise<unknown>) {
    setBusyMessage(label);
    try {
      await action();
      invalidateLeads();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusyMessage(null);
    }
  }

  async function openDuplicates() {
    setDupesOpen(true);
    setDupeGroups(null);
    const res = await crmFetch<{ data: DuplicateGroup[] }>("duplicates?resource=leads", orgId);
    setDupeGroups(res.data);
  }

  async function mergeGroup(group: DuplicateGroup, primaryId: string) {
    const duplicateIds = group.ids.filter((id) => id !== primaryId);
    await crmFetch("merge", orgId, {
      method: "POST",
      body: JSON.stringify({ resource: "leads", primary_id: primaryId, duplicate_ids: duplicateIds }),
    });
    invalidateLeads();
    const res = await crmFetch<{ data: DuplicateGroup[] }>("duplicates?resource=leads", orgId);
    setDupeGroups(res.data);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const fd = new FormData(e.currentTarget);
    const values: Record<string, unknown> = {};
    for (const field of FIELDS) values[field.name] = String(fd.get(field.name) ?? "");
    values.status = String(fd.get("status") ?? "new");
    values.tags = String(fd.get("tags") ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    try {
      if (editing) await update.mutateAsync({ id: editing.id, values });
      else await create.mutateAsync(values);
      setFormOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  const leads = useMemo(() => {
    const q = filterQ.trim().toLowerCase();
    const tag = filterTag.trim().toLowerCase();
    return (data ?? []).filter((lead) => {
      if (filterStatus && lead.status !== filterStatus) return false;
      if (tag && !(lead.tags ?? []).some((t) => t.toLowerCase().includes(tag))) return false;
      if (q) {
        const haystack = [lead.name, lead.company, lead.email, lead.title]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [data, filterQ, filterStatus, filterTag]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Leads</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={Boolean(busyMessage)}
            onClick={() =>
              runAction("Scoring…", () =>
                crmFetch("leads/score", orgId, { method: "POST", body: "{}" }),
              )
            }
          >
            Score unscored
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={Boolean(busyMessage)}
            onClick={() =>
              runAction("Assigning…", () =>
                crmFetch("leads/assign", orgId, { method: "POST", body: "{}" }),
              )
            }
          >
            Auto-assign
          </Button>
          <Button variant="outline" size="sm" onClick={openDuplicates}>
            Duplicates
          </Button>
          <Button variant="outline" size="sm" onClick={() => downloadCsvExport("leads", orgId)}>
            Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setImportResult(null);
              setImportOpen(true);
            }}
          >
            Import CSV
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setFormError(null);
              setFormOpen(true);
            }}
          >
            New lead
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={filterQ}
          onChange={(e) => setFilterQ(e.target.value)}
          placeholder="Filter by name, company, email…"
          className="h-8 w-56 text-sm"
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
        >
          <option value="">All statuses</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s[0].toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
        <Input
          value={filterTag}
          onChange={(e) => setFilterTag(e.target.value)}
          placeholder="Tag…"
          className="h-8 w-28 text-sm"
        />
        <div className="ml-auto flex items-center gap-2">
          <select
            value={activeViewId}
            onChange={(e) =>
              applyView((views ?? []).find((v) => v.id === e.target.value) ?? null)
            }
            className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="">Views…</option>
            {(views ?? []).map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" className="h-8" onClick={saveCurrentView}>
            Save view
          </Button>
          {activeViewId && (
            <Button variant="ghost" size="sm" className="h-8" onClick={deleteActiveView}>
              Delete view
            </Button>
          )}
        </div>
      </div>

      {busyMessage && <p className="text-sm text-muted-foreground">{busyMessage}</p>}
      {error && <p className="text-sm text-destructive">Failed to load leads.</p>}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead className="w-40 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : leads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  No leads yet. Create or import your first ones.
                </TableCell>
              </TableRow>
            ) : (
              leads.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell>
                    <button
                      className="font-medium hover:underline"
                      onClick={() => setTimelineLead(lead)}
                    >
                      {lead.name}
                    </button>
                    {lead.title && (
                      <div className="text-xs text-muted-foreground">{lead.title}</div>
                    )}
                  </TableCell>
                  <TableCell>{lead.company ?? "—"}</TableCell>
                  <TableCell>{lead.email ?? "—"}</TableCell>
                  <TableCell>
                    {lead.score !== null ? (
                      <span
                        title={lead.score_reason ?? undefined}
                        className={`inline-flex h-6 min-w-9 items-center justify-center rounded-full px-2 text-xs font-semibold ${scoreVariant(lead.score)}`}
                      >
                        {lead.score}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize">
                      {lead.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(lead.tags ?? []).map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {lead.status !== "converted" && (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => setEnrollLead(lead)}>
                            Enroll
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setConvertLead(lead)}>
                            Convert
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditing(lead);
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
                          if (confirm("Delete this lead?")) remove.mutate(lead.id);
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create / edit */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit lead" : "New lead"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            {FIELDS.map((field) => (
              <div key={field.name} className="space-y-1.5">
                <Label htmlFor={field.name}>{field.label}</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  type={"type" in field ? field.type : "text"}
                  required={"required" in field ? field.required : false}
                  placeholder={"placeholder" in field ? field.placeholder : undefined}
                  defaultValue={editing ? String(editing[field.name as keyof Lead] ?? "") : ""}
                />
              </div>
            ))}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="status">Status</Label>
                <select
                  id="status"
                  name="status"
                  defaultValue={editing?.status ?? "new"}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  {LEAD_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s[0].toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tags">Tags (comma-separated)</Label>
                <Input id="tags" name="tags" defaultValue={(editing?.tags ?? []).join(", ")} />
              </div>
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <DialogFooter>
              <Button type="submit" disabled={create.isPending || update.isPending}>
                {editing ? "Save changes" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Import */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import leads from CSV</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const csv = String(new FormData(e.currentTarget).get("csv") ?? "");
              if (csv.trim()) doImport.mutate(csv);
            }}
          >
            <p className="text-sm text-muted-foreground">
              Headers: <code>name</code> (required), <code>company</code>, <code>email</code>,{" "}
              <code>phone</code>, <code>title</code>, <code>source</code>, <code>status</code>,{" "}
              <code>tags</code> (semicolon-separated). Rows with an email already on a lead are
              skipped.
            </p>
            <Textarea name="csv" rows={8} placeholder={"name,company,email\nAda Lovelace,Analytical Engines,ada@example.com"} />
            <input
              type="file"
              accept=".csv,text/csv"
              className="text-sm"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                const form = e.currentTarget.form;
                if (!file || !form) return;
                const text = await file.text();
                const textarea = form.elements.namedItem("csv");
                if (textarea instanceof HTMLTextAreaElement) textarea.value = text;
              }}
            />
            {importResult && <p className="text-sm">{importResult}</p>}
            <DialogFooter>
              <Button type="submit" disabled={doImport.isPending}>
                {doImport.isPending ? "Importing…" : "Import"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Convert */}
      <Dialog open={Boolean(convertLead)} onOpenChange={(o) => !o && setConvertLead(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convert {convertLead?.name}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!convertLead) return;
              const fd = new FormData(e.currentTarget);
              doConvert.mutate({
                id: convertLead.id,
                create_deal: fd.get("create_deal") === "on",
                deal_name: String(fd.get("deal_name") ?? "") || undefined,
                deal_amount: Number(fd.get("deal_amount") || 0),
              });
            }}
          >
            <p className="text-sm text-muted-foreground">
              Creates a contact{convertLead?.company ? ` and links the “${convertLead.company}” account` : ""},
              marks the lead converted, and optionally opens a deal.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="create_deal" defaultChecked /> Create a deal
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="deal_name">Deal name</Label>
                <Input id="deal_name" name="deal_name" placeholder={`${convertLead?.name ?? ""} deal`} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="deal_amount">Amount</Label>
                <Input id="deal_amount" name="deal_amount" type="number" step="0.01" defaultValue={0} />
              </div>
            </div>
            {doConvert.isError && (
              <p className="text-sm text-destructive">
                {doConvert.error instanceof Error ? doConvert.error.message : "Convert failed"}
              </p>
            )}
            <DialogFooter>
              <Button type="submit" disabled={doConvert.isPending}>
                {doConvert.isPending ? "Converting…" : "Convert lead"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Duplicates */}
      <Dialog open={dupesOpen} onOpenChange={setDupesOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Duplicate leads</DialogTitle>
          </DialogHeader>
          {dupeGroups === null ? (
            <p className="text-sm text-muted-foreground">Scanning…</p>
          ) : dupeGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">No duplicates found. 🎉</p>
          ) : (
            <div className="space-y-4">
              {dupeGroups.map((group) => (
                <div key={`${group.field}:${group.value}`} className="rounded-md border p-3">
                  <div className="mb-2 text-sm">
                    Matching <span className="font-medium">{group.field}</span>:{" "}
                    <span className="text-muted-foreground">{group.value}</span>
                  </div>
                  <div className="space-y-1">
                    {group.records.filter(Boolean).map((record) => (
                      <div key={record!.id} className="flex items-center justify-between text-sm">
                        <span>
                          {record!.name}
                          {record!.email ? ` · ${record!.email}` : ""}
                          {record!.company ? ` · ${record!.company}` : ""}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7"
                          onClick={() => mergeGroup(group, record!.id)}
                        >
                          Keep this one
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Enroll in cadence */}
      <Dialog open={Boolean(enrollLead)} onOpenChange={(o) => !o && setEnrollLead(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enroll {enrollLead?.name} in a cadence</DialogTitle>
          </DialogHeader>
          {(cadenceOptions ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active cadences yet — create one on the Cadences screen.
            </p>
          ) : (
            <div className="space-y-1.5">
              {(cadenceOptions ?? []).map((cadence) => (
                <Button
                  key={cadence.id}
                  variant="outline"
                  className="w-full justify-start"
                  disabled={doEnroll.isPending}
                  onClick={() =>
                    enrollLead && doEnroll.mutate({ cadenceId: cadence.id, leadId: enrollLead.id })
                  }
                >
                  {cadence.name}
                </Button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <RecordTimeline
        orgId={orgId}
        entityType="lead"
        entityId={timelineLead?.id ?? null}
        title={timelineLead?.name ?? "Lead"}
        onClose={() => setTimelineLead(null)}
      />
    </div>
  );
}
