"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useClinicList, type ClinicResource } from "@/lib/clinic/client";

export type Column<T> = { header: string; render: (row: T) => React.ReactNode; className?: string };

export function ClinicTable<T extends { id: string }>({
  orgId,
  resource,
  title,
  columns,
  searchable = true,
  searchPlaceholder,
  limit = 100,
  hideTitle = false,
}: {
  orgId: string;
  resource: ClinicResource;
  title: string;
  columns: Column<T>[];
  searchable?: boolean;
  searchPlaceholder?: string;
  limit?: number;
  // For pages that render their own heading (e.g. the appointments view toggle).
  hideTitle?: boolean;
}) {
  const [q, setQ] = useState("");
  const { data, isLoading } = useClinicList<T>(resource, orgId, { q, limit });
  const rows = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        {!hideTitle && <h1 className="text-2xl font-semibold">{title}</h1>}
        <span className="ml-auto text-sm text-muted-foreground">
          {data ? `${data.total.toLocaleString("en-IN")} total` : ""}
        </span>
      </div>

      {searchable && (
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={searchPlaceholder ?? "Search…"}
          className="max-w-md"
        />
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c.header} className={c.className}>{c.header}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-muted-foreground">Loading…</TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-muted-foreground">No records found.</TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  {columns.map((c) => (
                    <TableCell key={c.header} className={c.className}>{c.render(row)}</TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
