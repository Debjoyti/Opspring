"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useClinicCalendar, type CalendarAppointment } from "@/lib/clinic/client";
import { cn } from "@/lib/utils";

/**
 * Practo times were exported as local clinic times and imported verbatim (UTC
 * on the wire), so all positioning/formatting here uses UTC accessors — the
 * calendar shows exactly the times the clinic entered, regardless of the
 * viewer's browser timezone.
 */
const dayKey = (iso: string) => iso.slice(0, 10);

function toDate(key: string): Date {
  return new Date(`${key}T00:00:00Z`);
}
function keyOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(key: string, days: number): string {
  const d = toDate(key);
  d.setUTCDate(d.getUTCDate() + days);
  return keyOf(d);
}
/** Monday of the week containing `key`. */
function weekStart(key: string): string {
  const d = toDate(key);
  const shift = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - shift);
  return keyOf(d);
}
function fmtTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const ampm = h >= 12 ? "pm" : "am";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hh}${ampm}` : `${hh}:${String(m).padStart(2, "0")}${ampm}`;
}
function fmtDayLabel(key: string): { dow: string; date: string } {
  const d = toDate(key);
  return {
    dow: d.toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" }),
    date: d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }),
  };
}
function fmtRangeLabel(startKey: string, days: number): string {
  const a = toDate(startKey);
  const b = toDate(addDays(startKey, days - 1));
  const opts = { day: "numeric", month: "short", timeZone: "UTC" } as const;
  const left = a.toLocaleDateString("en-IN", opts);
  const right = b.toLocaleDateString("en-IN", { ...opts, year: "numeric" });
  return days === 1 ? right : `${left} – ${right}`;
}

// Deterministic practitioner colors (left border + soft background).
const PALETTE = [
  "border-l-blue-500 bg-blue-500/10",
  "border-l-emerald-500 bg-emerald-500/10",
  "border-l-violet-500 bg-violet-500/10",
  "border-l-amber-500 bg-amber-500/10",
  "border-l-rose-500 bg-rose-500/10",
  "border-l-cyan-500 bg-cyan-500/10",
  "border-l-lime-600 bg-lime-600/10",
  "border-l-fuchsia-500 bg-fuchsia-500/10",
];
const DOT_PALETTE = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-lime-600",
  "bg-fuchsia-500",
];
function colorIndex(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % PALETTE.length;
}

export function AppointmentsCalendar({ orgId }: { orgId: string }) {
  const todayKey = keyOf(new Date());
  const [view, setView] = useState<"week" | "day">("week");
  const [anchor, setAnchor] = useState(todayKey);
  const [doctorFilter, setDoctorFilter] = useState("");
  const [selected, setSelected] = useState<CalendarAppointment | null>(null);

  const days = view === "week" ? 7 : 1;
  const startKey = view === "week" ? weekStart(anchor) : anchor;
  const endKey = addDays(startKey, days);

  const { data, isLoading } = useClinicCalendar(orgId, startKey, endKey);
  const all = useMemo(
    () => (data ?? []).filter((a) => a.appointment_at),
    [data],
  );

  const doctors = useMemo(
    () => [...new Set(all.map((a) => a.doctor ?? "Unassigned"))].sort(),
    [all],
  );
  const appointments = doctorFilter
    ? all.filter((a) => (a.doctor ?? "Unassigned") === doctorFilter)
    : all;

  const dayKeys = Array.from({ length: days }, (_, i) => addDays(startKey, i));

  // Hour range: fit the data, defaulting to a 9am–8pm clinic day.
  const hours = useMemo(() => {
    let min = 9;
    let max = 20;
    for (const a of appointments) {
      const h = new Date(a.appointment_at!).getUTCHours();
      if (h < min) min = h;
      if (h >= max) max = h + 1;
    }
    return Array.from({ length: max - min }, (_, i) => min + i);
  }, [appointments]);

  const byDayHour = useMemo(() => {
    const map = new Map<string, CalendarAppointment[]>();
    for (const a of appointments) {
      const k = `${dayKey(a.appointment_at!)}|${new Date(a.appointment_at!).getUTCHours()}`;
      const list = map.get(k) ?? [];
      list.push(a);
      map.set(k, list);
    }
    for (const list of map.values()) {
      list.sort((x, y) => (x.appointment_at! < y.appointment_at! ? -1 : 1));
    }
    return map;
  }, [appointments]);

  const cancelled = (a: CalendarAppointment) =>
    (a.status ?? "").toLowerCase() === "cancelled";

  const step = (dir: 1 | -1) => setAnchor(addDays(anchor, dir * days));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setAnchor(todayKey)}>
            Today
          </Button>
          <Button variant="ghost" size="sm" onClick={() => step(-1)} aria-label="Previous">
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => step(1)} aria-label="Next">
            <ChevronRight className="size-4" />
          </Button>
          <span className="text-sm font-medium">{fmtRangeLabel(startKey, days)}</span>
          <span className="text-sm text-muted-foreground">
            · {appointments.length} appointment{appointments.length === 1 ? "" : "s"}
            {isLoading ? "…" : ""}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={doctorFilter}
            onChange={(e) => setDoctorFilter(e.target.value)}
            className="h-8 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm"
          >
            <option value="">All practitioners</option>
            {doctors.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <div className="flex overflow-hidden rounded-md border">
            {(["week", "day"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "px-3 py-1.5 text-sm capitalize",
                  view === v ? "bg-primary text-primary-foreground" : "hover:bg-accent",
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Practitioner legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {doctors.map((d) => (
          <button
            key={d}
            onClick={() => setDoctorFilter(doctorFilter === d ? "" : d)}
            className={cn(
              "flex items-center gap-1.5 text-xs",
              doctorFilter && doctorFilter !== d ? "opacity-40" : "",
            )}
          >
            <span className={cn("size-2 rounded-full", DOT_PALETTE[colorIndex(d)])} />
            {d}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <div
          className="grid"
          style={{
            gridTemplateColumns: `56px repeat(${days}, minmax(${days === 1 ? "280px" : "130px"}, 1fr))`,
            minWidth: days === 1 ? undefined : 980,
          }}
        >
          {/* Header row */}
          <div className="border-b bg-muted/40" />
          {dayKeys.map((k) => {
            const { dow, date } = fmtDayLabel(k);
            const isToday = k === todayKey;
            return (
              <button
                key={k}
                onClick={() => {
                  setView("day");
                  setAnchor(k);
                }}
                className={cn(
                  "border-b border-l bg-muted/40 px-2 py-2 text-left",
                  isToday && "bg-primary/10",
                )}
                title="Open day view"
              >
                <div className={cn("text-xs uppercase text-muted-foreground", isToday && "text-primary")}>
                  {dow}
                </div>
                <div className={cn("text-sm font-medium", isToday && "text-primary")}>{date}</div>
              </button>
            );
          })}

          {/* Hour rows */}
          {hours.map((h) => (
            <div key={h} className="contents">
              <div className="border-b px-2 py-1 text-right text-xs text-muted-foreground">
                {h % 12 === 0 ? 12 : h % 12}
                {h >= 12 ? "pm" : "am"}
              </div>
              {dayKeys.map((k) => {
                const slot = byDayHour.get(`${k}|${h}`) ?? [];
                return (
                  <div
                    key={`${k}-${h}`}
                    className={cn(
                      "min-h-10 space-y-1 border-b border-l p-1",
                      k === todayKey && "bg-primary/[0.03]",
                    )}
                  >
                    {slot.map((a) => {
                      const doctor = a.doctor ?? "Unassigned";
                      return (
                        <button
                          key={a.id}
                          onClick={() => setSelected(a)}
                          className={cn(
                            "block w-full rounded-sm border-l-2 px-1.5 py-0.5 text-left text-xs leading-tight",
                            cancelled(a)
                              ? "border-l-destructive bg-destructive/10 text-muted-foreground line-through"
                              : PALETTE[colorIndex(doctor)],
                          )}
                          title={`${a.patient_name ?? "—"} · ${doctor}`}
                        >
                          <span className="font-medium">{fmtTime(a.appointment_at!)}</span>{" "}
                          <span className="truncate">{a.patient_name ?? "—"}</span>
                          {view === "day" && (
                            <span className="block text-muted-foreground">{doctor}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selected?.patient_name ?? "Appointment"}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Badge
                  variant={cancelled(selected) ? "destructive" : "secondary"}
                  className="capitalize"
                >
                  {selected.status ?? "—"}
                </Badge>
                <span className="text-muted-foreground">
                  {new Date(selected.appointment_at!).toLocaleString("en-IN", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "UTC",
                  })}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Practitioner: </span>
                {selected.doctor ?? "—"}
              </div>
              <div>
                <span className="text-muted-foreground">Patient #: </span>
                {selected.patient_number ?? "—"}
              </div>
              {selected.notes && (
                <div>
                  <span className="text-muted-foreground">Notes: </span>
                  {selected.notes}
                </div>
              )}
              {selected.checked_in_at && (
                <div className="text-xs text-muted-foreground">
                  Checked in {fmtTime(selected.checked_in_at)}
                  {selected.checked_out_at ? ` · out ${fmtTime(selected.checked_out_at)}` : ""}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
