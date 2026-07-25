import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { exportXlsx, fmtDate, fmtDateTime } from "@/lib/export-xlsx";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import type { Tables } from "@/integrations/supabase/types";

type Event = Tables<"events">;
type Batch = Tables<"batches">;

export const Route = createFileRoute("/_authenticated/events")({
  head: () => ({ meta: [{ title: "Événements — ONO Cannabis" }] }),
  component: EventsPage,
});

export const EVENT_TYPES = [
  { value: "packaging", label: "Packaging" },
  { value: "shipment", label: "Expédition" },
  { value: "b2b", label: "B2B" },
  { value: "sampling", label: "Échantillonnage" },
  { value: "return", label: "Retour" },
  { value: "destruction", label: "Destruction" },
  { value: "rework", label: "Rework" },
  { value: "transfer", label: "Transfert" },
];

export const EVENT_STATUS_VARIANTS: Record<
  string,
  { label: string; className: string }
> = {
  open: {
    label: "Ouvert",
    className: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  },
  completed: {
    label: "Complété",
    className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  },
  cancelled: {
    label: "Annulé",
    className: "bg-red-500/15 text-red-400 border-red-500/30",
  },
};

export function EventStatusBadge({ status }: { status: string | null }) {
  const key = status ?? "";
  const v = EVENT_STATUS_VARIANTS[key] ?? {
    label: status ?? "—",
    className: "bg-muted text-muted-foreground",
  };
  return (
    <Badge variant="outline" className={v.className}>
      {v.label}
    </Badge>
  );
}

function EventsPage() {
  const navigate = useNavigate();
  const { roles } = useAuth();
  const isViewerOnly = roles.length > 0 && roles.every((r) => r === "viewer");
  const [events, setEvents] = useState<Event[] | null>(null);
  const [batches, setBatches] = useState<Record<string, Batch>>({});
  const [creators, setCreators] = useState<
    Record<string, { full_name: string | null; email: string | null }>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      let query = supabase
        .from("events")
        .select("*")
        .order("created_at", { ascending: false });
      if (typeFilter !== "all") query = query.eq("event_type", typeFilter);
      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      const { data, error } = await query;
      if (cancelled) return;
      if (error) {
        setError(error.message);
        return;
      }
      const rows = data ?? [];
      setEvents(rows);
      const bIds = Array.from(
        new Set(rows.map((r) => r.related_batch_id).filter((x): x is string => !!x)),
      );
      const cIds = Array.from(
        new Set(rows.map((r) => r.created_by).filter((x): x is string => !!x)),
      );
      if (bIds.length > 0) {
        const { data: bs } = await supabase
          .from("batches")
          .select("*")
          .in("id", bIds);
        const m: Record<string, Batch> = {};
        (bs ?? []).forEach((b) => (m[b.id] = b));
        if (!cancelled) setBatches(m);
      } else setBatches({});
      if (cIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", cIds);
        const m: Record<string, { full_name: string | null; email: string | null }> = {};
        (profs ?? []).forEach((p) => (m[p.id] = { full_name: p.full_name, email: p.email }));
        if (!cancelled) setCreators(m);
      } else setCreators({});
    })();
    return () => {
      cancelled = true;
    };
  }, [typeFilter, statusFilter]);

  const typeLabel = (v: string | null) =>
    EVENT_TYPES.find((t) => t.value === v)?.label ?? v ?? "—";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Événements</h1>
          <p className="text-sm text-muted-foreground">
            Packaging, expéditions, retours, destructions et transferts.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={!events || events.length === 0}
            onClick={async () => {
              if (!events) return;
              const ids = events.map((e) => e.id);
              const { data: items } = await supabase
                .from("event_items")
                .select("*")
                .in("event_id", ids);
              const { data: lots } = await supabase
                .from("inventory_lots")
                .select("id, lot_number")
                .in(
                  "id",
                  Array.from(new Set((items ?? []).map((i) => i.lot_id).filter(Boolean))) as string[],
                );
              const lotMap = new Map((lots ?? []).map((l) => [l.id, l.lot_number]));
              const itemsByEvent = new Map<string, typeof items>();
              (items ?? []).forEach((i) => {
                const arr = itemsByEvent.get(i.event_id) ?? [];
                arr.push(i);
                itemsByEvent.set(i.event_id, arr);
              });
              exportXlsx("evenements", [
                {
                  name: "Événements",
                  rows: events.map((e) => {
                    const its = itemsByEvent.get(e.id) ?? [];
                    const gIn = its.filter((i) => i.direction === "in").reduce((s, i) => s + (Number(i.quantity_grams) || 0), 0);
                    const gOut = its.filter((i) => i.direction === "out").reduce((s, i) => s + (Number(i.quantity_grams) || 0), 0);
                    return {
                      Numéro: e.event_number,
                      Type: typeLabel(e.event_type),
                      Statut: e.status ?? "",
                      Batch: e.related_batch_id ? batches[e.related_batch_id]?.batch_number ?? "" : "",
                      "Créé le": fmtDateTime(e.created_at),
                      "Complété le": fmtDateTime(e.completed_at),
                      "Créé par":
                        e.created_by
                          ? creators[e.created_by]?.full_name ?? creators[e.created_by]?.email ?? ""
                          : "",
                      "Nb items": its.length,
                      "Total entrée (g)": gIn || "",
                      "Total sortie (g)": gOut || "",
                    };
                  }),
                },
                {
                  name: "Items",
                  rows: (items ?? []).map((i) => {
                    const ev = events.find((e) => e.id === i.event_id);
                    return {
                      Événement: ev?.event_number ?? "",
                      "Type événement": typeLabel(ev?.event_type ?? null),
                      Direction: i.direction,
                      Lot: i.lot_id ? lotMap.get(i.lot_id) ?? "" : "",
                      "Quantité (g)": i.quantity_grams ?? "",
                      Unités: i.units ?? "",
                      Note: i.note ?? "",
                      "Date": fmtDate(i.created_at),
                    };
                  }),
                },
              ]);
            }}
          >
            <Download className="mr-1 h-4 w-4" /> Exporter Excel
          </Button>
          {!isViewerOnly && (
            <Button onClick={() => navigate({ to: "/events/new" })}>
              <Plus className="mr-1 h-4 w-4" /> Nouvel événement
            </Button>
          )}
        </div>

      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Type</span>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous</SelectItem>
              {EVENT_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Statut</span>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous</SelectItem>
              <SelectItem value="open">Ouvert</SelectItem>
              <SelectItem value="completed">Complété</SelectItem>
              <SelectItem value="cancelled">Annulé</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Numéro</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Créé le</TableHead>
                <TableHead>Complété le</TableHead>
                <TableHead>Créé par</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {error && (
                <TableRow>
                  <TableCell colSpan={7} className="text-destructive">
                    {error}
                  </TableCell>
                </TableRow>
              )}
              {!error && events === null && (
                <>
                  {[...Array(3)].map((_, i) => (
                    <TableRow key={i}>
                      {[...Array(7)].map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </>
              )}
              {events && events.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-muted-foreground py-8"
                  >
                    Aucun événement pour le moment.
                  </TableCell>
                </TableRow>
              )}
              {events?.map((e) => (
                <TableRow
                  key={e.id}
                  className="cursor-pointer"
                  onClick={() =>
                    navigate({ to: "/events/$id", params: { id: e.id } })
                  }
                >
                  <TableCell className="font-medium">
                    <Link
                      to="/events/$id"
                      params={{ id: e.id }}
                      className="hover:underline"
                      onClick={(ev) => ev.stopPropagation()}
                    >
                      {e.event_number}
                    </Link>
                  </TableCell>
                  <TableCell>{typeLabel(e.event_type)}</TableCell>
                  <TableCell>
                    <EventStatusBadge status={e.status} />
                  </TableCell>
                  <TableCell>
                    {e.related_batch_id && batches[e.related_batch_id] ? (
                      <Link
                        to="/batches/$id"
                        params={{ id: e.related_batch_id }}
                        className="hover:underline text-muted-foreground"
                        onClick={(ev) => ev.stopPropagation()}
                      >
                        {batches[e.related_batch_id].batch_number}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    {new Date(e.created_at).toLocaleDateString("fr-CA")}
                  </TableCell>
                  <TableCell>
                    {e.completed_at
                      ? new Date(e.completed_at).toLocaleDateString("fr-CA")
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {e.created_by
                      ? creators[e.created_by]?.full_name ??
                        creators[e.created_by]?.email ??
                        "—"
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
