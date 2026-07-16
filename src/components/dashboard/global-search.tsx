"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { crmFetch } from "@/lib/crm/client";

type Org = { id: string };

type SearchHit = {
  type: "lead" | "contact" | "account" | "deal" | "product" | "quote";
  id: string;
  title: string;
  subtitle: string | null;
};

const TYPE_ROUTE: Record<SearchHit["type"], string> = {
  lead: "/dashboard/crm/leads",
  contact: "/dashboard/crm/contacts",
  account: "/dashboard/crm/accounts",
  deal: "/dashboard/crm/deals",
  product: "/dashboard/crm/products",
  quote: "/dashboard/crm/quotes",
};

export function GlobalSearch({ organizations }: { organizations: Org[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedOrg = searchParams.get("org");
  const orgId =
    organizations.find((o) => o.id === requestedOrg)?.id ?? organizations[0]?.id;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ctrl/Cmd+K opens search from anywhere in the dashboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function runSearch(q: string) {
    setQuery(q);
    if (debounce.current) clearTimeout(debounce.current);
    if (q.trim().length < 2) {
      setHits(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounce.current = setTimeout(async () => {
      try {
        const res = await crmFetch<{ data: SearchHit[] }>(
          `search?q=${encodeURIComponent(q)}`,
          orgId,
        );
        setHits(res.data);
      } catch {
        setHits([]);
      } finally {
        setLoading(false);
      }
    }, 250);
  }

  function openHit(hit: SearchHit) {
    setOpen(false);
    router.push(`${TYPE_ROUTE[hit.type]}?org=${orgId}`);
  }

  if (!orgId) return null;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-2 text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <Search className="size-3.5" />
        Search
        <kbd className="rounded border bg-muted px-1 text-[10px]">Ctrl K</kbd>
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            setQuery("");
            setHits(null);
          }
        }}
      >
        <DialogContent className="top-[20%] translate-y-0 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Search CRM</DialogTitle>
          </DialogHeader>
          <input
            autoFocus
            value={query}
            onChange={(e) => runSearch(e.target.value)}
            placeholder="Leads, contacts, accounts, deals, products, quotes…"
            className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
          />
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {loading && <p className="px-1 py-2 text-sm text-muted-foreground">Searching…</p>}
            {!loading && hits !== null && hits.length === 0 && (
              <p className="px-1 py-2 text-sm text-muted-foreground">No matches.</p>
            )}
            {!loading &&
              (hits ?? []).map((hit) => (
                <button
                  key={`${hit.type}-${hit.id}`}
                  onClick={() => openHit(hit)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
                >
                  <Badge variant="outline" className="w-16 justify-center text-xs capitalize">
                    {hit.type}
                  </Badge>
                  <span className="font-medium">{hit.title}</span>
                  {hit.subtitle && (
                    <span className="truncate text-xs text-muted-foreground">{hit.subtitle}</span>
                  )}
                </button>
              ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
