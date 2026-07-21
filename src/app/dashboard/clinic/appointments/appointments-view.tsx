"use client";

import { useState } from "react";
import { CalendarDays, List } from "lucide-react";
import { cn } from "@/lib/utils";
import { AppointmentsCalendar } from "./appointments-calendar";
import { AppointmentsClient } from "./appointments-client";

export function AppointmentsView({ orgId }: { orgId: string }) {
  const [mode, setMode] = useState<"calendar" | "list">("calendar");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Appointments</h1>
        <div className="flex overflow-hidden rounded-md border">
          {(
            [
              { key: "calendar", label: "Calendar", icon: CalendarDays },
              { key: "list", label: "List", icon: List },
            ] as const
          ).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setMode(key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-sm",
                mode === key ? "bg-primary text-primary-foreground" : "hover:bg-accent",
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {mode === "calendar" ? <AppointmentsCalendar orgId={orgId} /> : <AppointmentsClient orgId={orgId} />}
    </div>
  );
}
