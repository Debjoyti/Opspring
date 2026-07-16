"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  Contact,
  Building2,
  Target,
  Handshake,
  ListChecks,
  CheckSquare,
  BarChart3,
  Package,
  FileText,
  Receipt,
  Mail,
  Zap,
  Repeat,
  Settings2,
  Sparkles,
  Users,
  ChevronDown,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

type Org = { id: string; name: string; slug: string };

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/crm", label: "CRM Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/crm/leads", label: "Leads", icon: Target },
  { href: "/dashboard/crm/deals", label: "Deals", icon: Handshake },
  { href: "/dashboard/crm/accounts", label: "Accounts", icon: Building2 },
  { href: "/dashboard/crm/contacts", label: "Contacts", icon: Contact },
  { href: "/dashboard/crm/activities", label: "Activities", icon: ListChecks },
  { href: "/dashboard/crm/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/dashboard/crm/products", label: "Products", icon: Package },
  { href: "/dashboard/crm/quotes", label: "Quotes", icon: FileText },
  { href: "/dashboard/crm/invoices", label: "Invoices", icon: Receipt },
  { href: "/dashboard/crm/templates", label: "Email Templates", icon: Mail },
  { href: "/dashboard/crm/cadences", label: "Cadences", icon: Repeat },
  { href: "/dashboard/crm/automations", label: "Automations", icon: Zap },
  { href: "/dashboard/crm/reports", label: "Reports", icon: BarChart3 },
  { href: "/dashboard/crm/settings", label: "Pipeline Settings", icon: Settings2 },
  { href: "/dashboard/assistant", label: "AI Assistant", icon: Sparkles },
  { href: "/dashboard/members", label: "Members", icon: Users },
];

export function Sidebar({
  organizations,
  orgRoles,
}: {
  organizations: Org[];
  orgRoles: Record<string, string>;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const requestedOrg = searchParams.get("org");
  const activeOrg =
    organizations.find((o) => o.id === requestedOrg) ?? organizations[0];
  const role = orgRoles[activeOrg.id];

  const withOrg = (href: string) => `${href}?org=${activeOrg.id}`;

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r bg-sidebar">
      <div className="border-b p-4">
        <div className="mb-3 text-lg font-semibold">Opspring</div>
        <div className="relative">
          <button
            onClick={() => setSwitcherOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-md border bg-background px-3 py-2 text-sm"
          >
            <span className="truncate">{activeOrg.name}</span>
            <ChevronDown className="size-4 shrink-0 opacity-60" />
          </button>
          {switcherOpen && (
            <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
              {organizations.map((org) => (
                <Link
                  key={org.id}
                  href={`${pathname}?org=${org.id}`}
                  onClick={() => setSwitcherOpen(false)}
                  className={cn(
                    "block px-3 py-2 text-sm hover:bg-accent",
                    org.id === activeOrg.id && "font-medium",
                  )}
                >
                  {org.name}
                </Link>
              ))}
              <Link
                href="/onboarding"
                className="block border-t px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
              >
                + New organization
              </Link>
            </div>
          )}
        </div>
        {role && (
          <div className="mt-2 text-xs capitalize text-muted-foreground">Role: {role}</div>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={withOrg(item.href)}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
