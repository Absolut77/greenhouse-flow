import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow, format } from "date-fns";
import { fr } from "date-fns/locale";
import { Search, ShieldAlert, Loader2, Download } from "lucide-react";
import { exportXlsx, fmtDateTime } from "@/lib/export-xlsx";


import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/activity")({
  head: () => ({
    meta: [
      { title: "Journal d'activité — ONO Cannabis" },
      {
        name: "description",
        content:
          "Historique complet des actions effectuées dans ONO Cannabis : batches, inventaire, événements, timbres d'accise.",
      },
    ],
  }),
  component: ActivityPage,
});

type LogRow = {
  id: string;
  user_id: string | null;
  user_name: string | null;
  user_initials: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

const ENTITY_LABELS: Record<string, string> = {
  batches: "Batch",
  batch_stages: "Étape",
  inventory_lots: "Lot d'inventaire",
  events: "Événement",
  event_items: "Mouvement de stock",
  excise_reels: "Rouleau de timbres",
  stamp_movements: "Mouvement de timbres",
  samples: "Échantillon",
  weights: "Pesée",
  drying_logs: "Log de séchage",
};

const ACTION_LABELS: Record<string, string> = {
  create: "Création",
  update: "Modification",
  delete: "Suppression",
  status_change: "Changement de statut",
  stock_movement_add: "Ajout mouvement stock",
  stock_movement_remove: "Retrait mouvement stock",
  stock_movement_update: "Modif. mouvement stock",
  stamp_movement_add: "Ajout mouvement timbres",
  stamp_movement_remove: "Retrait mouvement timbres",
  stamp_movement_update: "Modif. mouvement timbres",
};

function actionVariant(action: string): string {
  if (action.startsWith("create") || action.endsWith("_add"))
    return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  if (action.startsWith("delete") || action.endsWith("_remove"))
    return "bg-red-500/15 text-red-400 border-red-500/30";
  if (action === "status_change")
    return "bg-amber-500/15 text-amber-400 border-amber-500/30";
  return "bg-sky-500/15 text-sky-400 border-sky-500/30";
}

function ActivityPage() {
  const { roles, loading: authLoading } = useAuth();
  const canView = roles.includes("admin") || roles.includes("supervisor");

  const [logs, setLogs] = useState<LogRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [limit, setLimit] = useState(200);

  useEffect(() => {
    if (!canView) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      let q = supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (dateFrom) q = q.gte("created_at", new Date(dateFrom).toISOString());
      if (dateTo) {
        const to = new Date(dateTo);
        to.setDate(to.getDate() + 1);
        q = q.lt("created_at", to.toISOString());
      }
      const { data, error } = await q;
      if (cancelled) return;
      if (error) setError(error.message);
      else setLogs((data ?? []) as LogRow[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [canView, limit, dateFrom, dateTo]);

  const users = useMemo(() => {
    if (!logs) return [] as { id: string; name: string }[];
    const map = new Map<string, string>();
    for (const l of logs) {
      const id = l.user_id ?? "system";
      if (!map.has(id)) map.set(id, l.user_name ?? "Système");
    }
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [logs]);

  const entities = useMemo(() => {
    if (!logs) return [] as string[];
    return Array.from(new Set(logs.map((l) => l.entity_type)));
  }, [logs]);

  const actions = useMemo(() => {
    if (!logs) return [] as string[];
    return Array.from(new Set(logs.map((l) => l.action)));
  }, [logs]);

  const filtered = useMemo(() => {
    if (!logs) return [];
    const s = search.trim().toLowerCase();
    return logs.filter((l) => {
      if (userFilter !== "all" && (l.user_id ?? "system") !== userFilter) return false;
      if (entityFilter !== "all" && l.entity_type !== entityFilter) return false;
      if (actionFilter !== "all" && l.action !== actionFilter) return false;
      if (s) {
        const hay = [
          l.user_name,
          l.entity_label,
          l.entity_type,
          l.action,
          JSON.stringify(l.details ?? {}),
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [logs, search, userFilter, entityFilter, actionFilter]);

  if (authLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!canView) {
    return (
      <div className="mx-auto max-w-lg pt-16">
        <Card className="p-8 text-center">
          <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Accès restreint</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Le journal d'activité est réservé aux rôles administrateur et
            superviseur.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Journal d'activité</h1>
          <p className="text-sm text-muted-foreground">
            Toutes les actions enregistrées dans l'application (append-only).
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={filtered.length === 0}
            onClick={() => {
              exportXlsx("journal_activite", [
                {
                  name: "Activité",
                  rows: filtered.map((l) => ({
                    "Date/heure": fmtDateTime(l.created_at),
                    Utilisateur: l.user_name ?? "Système",
                    Initiales: l.user_initials ?? "",
                    Action: ACTION_LABELS[l.action] ?? l.action,
                    Type: ENTITY_LABELS[l.entity_type] ?? l.entity_type,
                    Élément: l.entity_label ?? "",
                    Détails: l.details ? JSON.stringify(l.details) : "",
                  })),
                },
              ]);
            }}
          >
            <Download className="mr-1 h-4 w-4" /> Exporter Excel
          </Button>
          <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="100">100 lignes</SelectItem>
              <SelectItem value="200">200 lignes</SelectItem>
              <SelectItem value="500">500 lignes</SelectItem>
              <SelectItem value="1000">1000 lignes</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>


      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <div className="relative md:col-span-2">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher (élément, détails)..."
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={userFilter} onValueChange={setUserFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Utilisateur" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les utilisateurs</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={entityFilter} onValueChange={setEntityFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les types</SelectItem>
              {entities.map((e) => (
                <SelectItem key={e} value={e}>
                  {ENTITY_LABELS[e] ?? e}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les actions</SelectItem>
              {actions.map((a) => (
                <SelectItem key={a} value={a}>
                  {ACTION_LABELS[a] ?? a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="text-xs"
              title="Du"
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="text-xs"
              title="Au"
            />
          </div>
        </div>
        {(search ||
          userFilter !== "all" ||
          entityFilter !== "all" ||
          actionFilter !== "all" ||
          dateFrom ||
          dateTo) && (
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {filtered.length} résultat{filtered.length > 1 ? "s" : ""} sur{" "}
              {logs?.length ?? 0}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setSearch("");
                setUserFilter("all");
                setEntityFilter("all");
                setActionFilter("all");
                setDateFrom("");
                setDateTo("");
              }}
            >
              Réinitialiser
            </Button>
          </div>
        )}
      </Card>

      <Card>
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="p-6 text-sm text-destructive">Erreur : {error}</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            Aucune action ne correspond aux filtres.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">Date/heure</TableHead>
                <TableHead>Utilisateur</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Élément</TableHead>
                <TableHead>Détails</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="align-top">
                    <div className="text-xs">
                      {format(new Date(l.created_at), "yyyy-MM-dd HH:mm:ss")}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(l.created_at), {
                        addSuffix: true,
                        locale: fr,
                      })}
                    </div>
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="bg-primary/20 text-[10px] text-primary-foreground">
                          {l.user_initials ?? "??"}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs">
                        {l.user_name ?? (
                          <span className="text-muted-foreground italic">
                            Système
                          </span>
                        )}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="align-top">
                    <Badge
                      variant="outline"
                      className={actionVariant(l.action)}
                    >
                      {ACTION_LABELS[l.action] ?? l.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="align-top text-xs">
                    {ENTITY_LABELS[l.entity_type] ?? l.entity_type}
                  </TableCell>
                  <TableCell className="align-top text-xs font-medium">
                    {l.entity_label ?? (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="align-top">
                    <DetailsCell details={l.details} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function DetailsCell({ details }: { details: Record<string, unknown> | null }) {
  if (!details || Object.keys(details).length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const entries = Object.entries(details);
  const summary = entries
    .slice(0, 2)
    .map(([k, v]) => `${k}: ${stringifyVal(v)}`)
    .join(" · ");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="max-w-[280px] truncate text-left text-xs text-muted-foreground hover:text-foreground">
          {summary}
          {entries.length > 2 && <span> · +{entries.length - 2}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] max-h-[400px] overflow-auto">
        <pre className="whitespace-pre-wrap break-words text-[11px] leading-relaxed">
          {JSON.stringify(details, null, 2)}
        </pre>
      </PopoverContent>
    </Popover>
  );
}

function stringifyVal(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("from" in o || "to" in o) {
      return `${String(o.from ?? "∅")} → ${String(o.to ?? "∅")}`;
    }
    return JSON.stringify(v);
  }
  const s = String(v);
  return s.length > 40 ? s.slice(0, 40) + "…" : s;
}
