import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Boxes,
  Package,
  CalendarClock,
  Stamp,
  PackageCheck,
  FlaskConical,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "./batches";
import { EventStatusBadge } from "./events";
import { computeBalance } from "./stamps";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Tableau de bord — ONO Cannabis" },
      {
        name: "description",
        content:
          "Vue d'ensemble des opérations : batches en cours, stock réel bulk/samples/packagé, événements ouverts, timbres et alertes.",
      },
    ],
  }),
  component: Dashboard,
});

const LOW_STAMP_THRESHOLD = 500;
const LONG_BATCH_DAYS = 14;
const OPEN_EVENT_DAYS = 7;

type Metrics = {
  batchesInProgress: number;
  eventsOpen: number;
  bulkGrams: number;
  packagedUnits: number;
  packagedGrams: number;
  sampleGrams: number;
  retentionGrams: number;
  totalAvailableGrams: number;
  stampsAvailable: number;
  reelsAvailable: number;
};

type BatchRow = {
  id: string;
  batch_number: string;
  strain: string | null;
  harvest_date: string | null;
  status: string;
  created_at: string | null;
};

type EventRow = {
  id: string;
  event_number: string;
  event_type: string | null;
  status: string | null;
  created_at: string | null;
  related_batch_id: string | null;
};

type ReelRow = {
  id: string;
  serial_number: string;
  original_quantity: number | null;
  spoiled_at_reception: number;
  status: string | null;
};

type LogRow = {
  id: string;
  user_name: string | null;
  user_initials: string | null;
  action: string;
  entity_type: string;
  entity_label: string | null;
  created_at: string;
};

const ENTITY_LABELS: Record<string, string> = {
  batches: "Batch",
  batch_stages: "Étape",
  inventory_lots: "Lot",
  events: "Événement",
  event_items: "Mouvement stock",
  excise_reels: "Rouleau",
  stamp_movements: "Mouvement timbre",
  samples: "Échantillon",
  weights: "Pesée",
  drying_logs: "Séchage",
};

const ACTION_LABELS: Record<string, string> = {
  create: "a créé",
  update: "a modifié",
  delete: "a supprimé",
  status_change: "a changé le statut",
  stock_movement_add: "a ajouté un mouvement de stock",
  stock_movement_remove: "a retiré un mouvement de stock",
  stock_movement_update: "a modifié un mouvement de stock",
  stamp_movement_add: "a ajouté un mouvement de timbres",
  stamp_movement_remove: "a retiré un mouvement de timbres",
  stamp_movement_update: "a modifié un mouvement de timbres",
};

function eventTypeLabel(t: string | null) {
  if (!t) return "—";
  const map: Record<string, string> = {
    reception: "Réception",
    packaging: "Emballage",
    destruction: "Destruction",
    shipment: "Expédition",
    transfer: "Transfert",
    sampling: "Échantillonnage",
    return: "Retour",
    rework: "Rework",
    b2b: "B2B",
  };
  return map[t] ?? t;
}

function Dashboard() {
  const { roles } = useAuth();
  const canSeeActivity = roles.includes("admin") || roles.includes("supervisor");
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [batches, setBatches] = useState<BatchRow[] | null>(null);
  const [batchLastActivity, setBatchLastActivity] = useState<Record<string, string>>({});
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [batchesByEvent, setBatchesByEvent] = useState<Record<string, string>>({});
  const [lowReels, setLowReels] = useState<Array<ReelRow & { balance: number }>>([]);
  const [longBatches, setLongBatches] = useState<BatchRow[]>([]);
  const [staleOpenEvents, setStaleOpenEvents] = useState<EventRow[]>([]);
  const [logs, setLogs] = useState<LogRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [
        batchesInProgressC,
        eventsOpenC,
        reelsAvailableC,
        bulkLotsRes,
        packagedLotsRes,
        sampleLotsRes,
        reelsFullRes,
        stampMovementsRes,
        batchesRes,
        eventsRes,
        logsRes,
      ] = await Promise.all([
        supabase
          .from("batches")
          .select("id", { count: "exact", head: true })
          .eq("status", "in_progress"),
        supabase
          .from("events")
          .select("id", { count: "exact", head: true })
          .eq("status", "open"),
        supabase
          .from("excise_reels")
          .select("id", { count: "exact", head: true })
          .eq("status", "available"),
        supabase
          .from("inventory_lots")
          .select("quantity_grams, units, lot_kind" as any)
          .eq("status", "available"),
        // Placeholder to keep tuple structure — replaced by client-side split below
        Promise.resolve({ data: [] as any[] }),
        Promise.resolve({ data: [] as any[] }),
        supabase
          .from("excise_reels")
          .select("id,serial_number,original_quantity,spoiled_at_reception,status"),
        supabase
          .from("stamp_movements")
          .select("reel_id,movement_type,quantity"),
        supabase
          .from("batches")
          .select("id,batch_number,strain,harvest_date,status,created_at")
          .eq("status", "in_progress")
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("events")
          .select("id,event_number,event_type,status,created_at,related_batch_id")
          .eq("status", "open")
          .order("created_at", { ascending: false })
          .limit(20),
        canSeeActivity
          ? supabase
              .from("audit_logs")
              .select(
                "id,user_name,user_initials,action,entity_type,entity_label,created_at"
              )
              .order("created_at", { ascending: false })
              .limit(10)
          : Promise.resolve({ data: [] as LogRow[] }),
      ]);

      if (cancelled) return;

      const allAvailable = ((bulkLotsRes as any).data ?? []) as Array<{
        quantity_grams: number | null;
        units: number | null;
        lot_kind: string | null;
      }>;
      const sumG = (rows: typeof allAvailable) =>
        rows.reduce((a, l) => a + (Number(l.quantity_grams) || 0), 0);
      const sumU = (rows: typeof allAvailable) =>
        rows.reduce((a, l) => a + (Number(l.units) || 0), 0);
      const bulkRows = allAvailable.filter((l) => (l.lot_kind ?? "bulk") === "bulk");
      const packagedRows = allAvailable.filter((l) => l.lot_kind === "packaged");
      const sampleRows = allAvailable.filter((l) => l.lot_kind === "sample");
      const retentionRows = allAvailable.filter((l) => l.lot_kind === "retention");
      const bulkGrams = sumG(bulkRows);
      const packagedGrams = sumG(packagedRows);
      const packagedUnits = sumU(packagedRows);
      const sampleGrams = sumG(sampleRows);
      const retentionGrams = sumG(retentionRows);
      const totalAvailableGrams = bulkGrams + packagedGrams + sampleGrams + retentionGrams;

      // Compute stamps available: sum of balances across available reels
      const reelsAll = (reelsFullRes.data ?? []) as ReelRow[];
      const mvByReel = new Map<string, Array<{ movement_type: string; quantity: number }>>();
      (stampMovementsRes.data ?? []).forEach((m) => {
        const arr = mvByReel.get(m.reel_id) ?? [];
        arr.push({ movement_type: m.movement_type ?? "", quantity: m.quantity ?? 0 });
        mvByReel.set(m.reel_id, arr);
      });
      let stampsAvailable = 0;
      for (const r of reelsAll) {
        if (r.status !== "available") continue;
        const { balance } = computeBalance(r, mvByReel.get(r.id) ?? []);
        if (balance > 0) stampsAvailable += balance;
      }
      // Low balance reels for the alerts section
      const withBal = reelsAll
        .filter((r) => r.status === "available")
        .map((r) => ({ ...r, balance: computeBalance(r, mvByReel.get(r.id) ?? []).balance }))
        .filter((r) => r.balance > 0 && r.balance < LOW_STAMP_THRESHOLD)
        .sort((a, b) => a.balance - b.balance)
        .slice(0, 5);
      setLowReels(withBal);

      setMetrics({
        batchesInProgress: batchesInProgressC.count ?? 0,
        eventsOpen: eventsOpenC.count ?? 0,
        bulkGrams,
        packagedUnits,
        packagedGrams,
        sampleGrams,
        retentionGrams,
        totalAvailableGrams,
        stampsAvailable,
        reelsAvailable: reelsAvailableC.count ?? 0,
      });

      const batchList = (batchesRes.data ?? []) as BatchRow[];
      setBatches(batchList);

      // Long-running batches
      const cutoff = Date.now() - LONG_BATCH_DAYS * 24 * 3600 * 1000;
      setLongBatches(
        batchList.filter((b) => {
          const ref = b.created_at ? new Date(b.created_at).getTime() : 0;
          return ref && ref < cutoff;
        })
      );

      const evList = (eventsRes.data ?? []) as EventRow[];
      setEvents(evList);

      // Stale open events
      const evCutoff = Date.now() - OPEN_EVENT_DAYS * 24 * 3600 * 1000;
      setStaleOpenEvents(
        evList.filter((e) => e.created_at && new Date(e.created_at).getTime() < evCutoff)
      );

      // Fetch batch numbers for events
      const batchIds = Array.from(
        new Set(evList.map((e) => e.related_batch_id).filter(Boolean))
      ) as string[];
      if (batchIds.length) {
        const { data: bs } = await supabase
          .from("batches")
          .select("id,batch_number")
          .in("id", batchIds);
        if (!cancelled) {
          const map: Record<string, string> = {};
          (bs ?? []).forEach((b) => (map[b.id] = b.batch_number));
          setBatchesByEvent(map);
        }
      }

      if (canSeeActivity && batchList.length) {
        const ids = batchList.map((b) => b.id);
        const { data: acts } = await supabase
          .from("audit_logs")
          .select("entity_id,created_at")
          .eq("entity_type", "batches")
          .in("entity_id", ids)
          .order("created_at", { ascending: false })
          .limit(500);
        if (!cancelled && acts) {
          const map: Record<string, string> = {};
          for (const a of acts as { entity_id: string | null; created_at: string }[]) {
            if (a.entity_id && !map[a.entity_id]) map[a.entity_id] = a.created_at;
          }
          setBatchLastActivity(map);
        }
      }

      setLogs((logsRes.data ?? []) as LogRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [canSeeActivity]);

  const fmtG = (g?: number) =>
    g == null ? undefined : `${Math.round(g).toLocaleString("fr-CA")} g`;

  const statCards: Array<{
    label: string;
    value: string | number | undefined;
    sub?: string;
    icon: typeof Boxes;
    to: string;
    search?: Record<string, string>;
  }> = [
    {
      label: "Batches en cours",
      value: metrics?.batchesInProgress,
      icon: Boxes,
      to: "/batches",
      search: { status: "in_progress" },
    },
    {
      label: "Bulk (flower + trim)",
      value: fmtG(metrics?.bulkGrams),
      icon: Package,
      to: "/inventory",
      search: { view: "bulk" },
    },
    {
      label: "Packagé en stock",
      value: metrics?.packagedUnits != null
        ? metrics.packagedUnits.toLocaleString("fr-CA")
        : undefined,
      sub: metrics?.packagedGrams != null
        ? `${Math.round(metrics.packagedGrams).toLocaleString("fr-CA")} g`
        : undefined,
      icon: PackageCheck,
      to: "/inventory",
      search: { view: "packaged" },
    },
    {
      label: "Échantillons",
      value: fmtG(metrics?.sampleGrams),
      icon: FlaskConical,
      to: "/inventory",
      search: { view: "sample" },
    },
    {
      label: "Rétention 🔒",
      value: fmtG(metrics?.retentionGrams),
      icon: FlaskConical,
      to: "/inventory",
      search: { view: "retention" },
    },
    {
      label: "Total disponible",
      value: fmtG(metrics?.totalAvailableGrams),
      sub: "bulk + packagé + samples + rétention",
      icon: PackageCheck,
      to: "/inventory",
      search: { view: "all" },
    },
    {
      label: "Événements ouverts",
      value: metrics?.eventsOpen,
      icon: CalendarClock,
      to: "/events",
      search: { status: "open" },
    },
    {
      label: "Timbres disponibles",
      value: metrics?.stampsAvailable != null
        ? metrics.stampsAvailable.toLocaleString("fr-CA")
        : undefined,
      sub: metrics?.reelsAvailable != null
        ? `${metrics.reelsAvailable} rouleaux`
        : undefined,
      icon: Stamp,
      to: "/stamps",
      search: { status: "available" },
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Tableau de bord</h1>
        <p className="text-sm text-muted-foreground">
          Vue d'ensemble des opérations post-récolte.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {statCards.map((s) => (
          <Link
            key={s.label}
            to={s.to}
            search={s.search as never}
            className="block"
          >
            <Card className="transition-colors hover:border-primary/50 h-full">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {s.label}
                </CardTitle>
                <s.icon className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                {s.value === undefined ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-semibold">{s.value}</div>
                )}
                {s.sub && (
                  <div className="text-xs text-muted-foreground mt-1">{s.sub}</div>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {(lowReels.length > 0 || longBatches.length > 0 || staleOpenEvents.length > 0) && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Alertes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {lowReels.map((r) => (
              <div key={r.id} className="flex items-center justify-between">
                <span>
                  Rouleau{" "}
                  <Link
                    to="/stamps/$id"
                    params={{ id: r.id }}
                    className="font-medium text-primary hover:underline"
                  >
                    {r.serial_number}
                  </Link>{" "}
                  — balance faible
                </span>
                <Badge variant="outline" className="border-amber-500/50">
                  {r.balance} timbres
                </Badge>
              </div>
            ))}
            {longBatches.map((b) => (
              <div key={b.id} className="flex items-center justify-between">
                <span>
                  Batch{" "}
                  <Link
                    to="/batches/$id"
                    params={{ id: b.id }}
                    className="font-medium text-primary hover:underline"
                  >
                    {b.batch_number}
                  </Link>{" "}
                  ouverte depuis plus de {LONG_BATCH_DAYS} jours
                </span>
                {b.created_at && (
                  <Badge variant="outline" className="border-amber-500/50">
                    {formatDistanceToNow(new Date(b.created_at), {
                      locale: fr,
                      addSuffix: false,
                    })}
                  </Badge>
                )}
              </div>
            ))}
            {staleOpenEvents.map((e) => (
              <div key={e.id} className="flex items-center justify-between">
                <span>
                  Événement{" "}
                  <Link
                    to="/events/$id"
                    params={{ id: e.id }}
                    className="font-medium text-primary hover:underline"
                  >
                    {e.event_number}
                  </Link>{" "}
                  ouvert depuis plus de {OPEN_EVENT_DAYS} jours
                </span>
                {e.created_at && (
                  <Badge variant="outline" className="border-amber-500/50">
                    {formatDistanceToNow(new Date(e.created_at), {
                      locale: fr,
                      addSuffix: false,
                    })}
                  </Badge>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Batches en cours</CardTitle>
              <CardDescription>Production active en post-récolte</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/batches" search={{ status: "in_progress" }}>
                Tout voir <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {batches === null ? (
              <div className="p-4 space-y-2">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : batches.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Aucun batch en cours.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Numéro</TableHead>
                    <TableHead>Strain</TableHead>
                    <TableHead>Récolte</TableHead>
                    <TableHead>Activité</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.slice(0, 8).map((b) => (
                    <TableRow key={b.id} className="cursor-pointer">
                      <TableCell>
                        <Link
                          to="/batches/$id"
                          params={{ id: b.id }}
                          className="font-medium text-primary hover:underline"
                        >
                          {b.batch_number}
                        </Link>
                      </TableCell>
                      <TableCell>{b.strain ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {b.harvest_date
                          ? new Date(b.harvest_date).toLocaleDateString("fr-CA")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {(() => {
                          const ts = batchLastActivity[b.id] ?? b.created_at;
                          return ts
                            ? formatDistanceToNow(new Date(ts), {
                                locale: fr,
                                addSuffix: true,
                              })
                            : "—";
                        })()}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={b.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Événements ouverts</CardTitle>
              <CardDescription>
                Réception, emballage, destruction, expédition...
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/events" search={{ status: "open" }}>
                Tout voir <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {events === null ? (
              <div className="p-4 space-y-2">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : events.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Aucun événement ouvert.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Numéro</TableHead>
                    <TableHead>Batch</TableHead>
                    <TableHead>Créé</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.slice(0, 10).map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>{eventTypeLabel(e.event_type)}</TableCell>
                      <TableCell>
                        <Link
                          to="/events/$id"
                          params={{ id: e.id }}
                          className="font-medium text-primary hover:underline"
                        >
                          {e.event_number ?? "—"}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {e.related_batch_id
                          ? batchesByEvent[e.related_batch_id] ?? "…"
                          : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {e.created_at
                          ? formatDistanceToNow(new Date(e.created_at), {
                              locale: fr,
                              addSuffix: true,
                            })
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <EventStatusBadge status={e.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {canSeeActivity && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Activité récente</CardTitle>
              <CardDescription>Dernières actions enregistrées</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/activity">
                Journal complet <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {logs === null ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-4">
                Aucune activité pour l'instant.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {logs.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 py-2.5">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs">
                        {l.user_initials ?? "??"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0 text-sm">
                      <div className="truncate">
                        <span className="font-medium">
                          {l.user_name ?? "Système"}
                        </span>{" "}
                        <span className="text-muted-foreground">
                          {ACTION_LABELS[l.action] ?? l.action}
                        </span>{" "}
                        <Badge variant="outline" className="mx-1 text-xs">
                          {ENTITY_LABELS[l.entity_type] ?? l.entity_type}
                        </Badge>
                        {l.entity_label && (
                          <span className="font-medium">{l.entity_label}</span>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatDistanceToNow(new Date(l.created_at), {
                        locale: fr,
                        addSuffix: true,
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
