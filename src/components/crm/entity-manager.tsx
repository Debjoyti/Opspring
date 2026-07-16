"use client";

import { useState } from "react";
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
  useCrmCreate,
  useCrmDelete,
  useCrmList,
  useCrmUpdate,
  type CrmResource,
} from "@/lib/crm/client";

export type FieldOption = { value: string; label: string };

export type FieldDef = {
  name: string;
  label: string;
  type?: "text" | "email" | "tel" | "number" | "date" | "textarea" | "select" | "checkbox";
  options?: FieldOption[];
  required?: boolean;
  placeholder?: string;
  // Prefilled value for new records.
  defaultValue?: string;
  // Default for new records (checkbox fields only).
  defaultChecked?: boolean;
  // Hidden from the table but still editable in the form.
  hideInTable?: boolean;
};

export type ColumnDef<Row> = {
  header: string;
  render: (row: Row) => React.ReactNode;
};

type Row = Record<string, unknown> & { id: string };

export function EntityManager<T extends Row>({
  resource,
  orgId,
  title,
  fields,
  columns,
}: {
  resource: CrmResource;
  orgId: string;
  title: string;
  fields: FieldDef[];
  columns: ColumnDef<T>[];
}) {
  const { data, isLoading, error } = useCrmList<T>(resource, orgId);
  const create = useCrmCreate(resource, orgId);
  const update = useCrmUpdate(resource, orgId);
  const remove = useCrmDelete(resource, orgId);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setFormError(null);
    setOpen(true);
  }

  function openEdit(row: T) {
    setEditing(row);
    setFormError(null);
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const formData = new FormData(e.currentTarget);
    const values: Record<string, unknown> = {};
    for (const field of fields) {
      if (field.type === "checkbox") {
        values[field.name] = formData.get(field.name) === "on";
        continue;
      }
      const raw = formData.get(field.name);
      if (raw === null) continue;
      const str = String(raw);
      if (field.type === "number") values[field.name] = str === "" ? 0 : Number(str);
      else values[field.name] = str;
    }

    try {
      if (editing) await update.mutateAsync({ id: editing.id, values });
      else await create.mutateAsync(values);
      setOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  const rows = data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <Button onClick={openCreate}>New {title.replace(/s$/, "").toLowerCase()}</Button>
      </div>

      {error && <p className="text-sm text-destructive">Failed to load {title.toLowerCase()}.</p>}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c.header}>{c.header}</TableHead>
              ))}
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={columns.length + 1} className="text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length + 1} className="text-muted-foreground">
                  No {title.toLowerCase()} yet. Create your first one.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  {columns.map((c) => (
                    <TableCell key={c.header}>{c.render(row)}</TableCell>
                  ))}
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm("Delete this record?")) remove.mutate(row.id);
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit" : "New"} {title.replace(/s$/, "").toLowerCase()}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            {fields.map((field) => {
              const current = editing
                ? String(editing[field.name] ?? "")
                : (field.defaultValue ?? "");
              if (field.type === "checkbox") {
                const checked = editing
                  ? Boolean(editing[field.name])
                  : (field.defaultChecked ?? true);
                return (
                  <label key={field.name} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name={field.name}
                      defaultChecked={checked}
                    />
                    {field.label}
                  </label>
                );
              }
              return (
                <div key={field.name} className="space-y-1.5">
                  <Label htmlFor={field.name}>{field.label}</Label>
                  {field.type === "textarea" ? (
                    <Textarea
                      id={field.name}
                      name={field.name}
                      defaultValue={current}
                      placeholder={field.placeholder}
                    />
                  ) : field.type === "select" ? (
                    <select
                      id={field.name}
                      name={field.name}
                      defaultValue={current || field.options?.[0]?.value}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                    >
                      {field.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      id={field.name}
                      name={field.name}
                      type={field.type ?? "text"}
                      defaultValue={current}
                      required={field.required}
                      placeholder={field.placeholder}
                      step={field.type === "number" ? "0.01" : undefined}
                    />
                  )}
                </div>
              );
            })}
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <DialogFooter>
              <Button type="submit" disabled={create.isPending || update.isPending}>
                {editing ? "Save changes" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
