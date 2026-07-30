import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Download, Upload } from "lucide-react";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { exportXlsx, fmtDate } from "@/lib/export-xlsx";


import { supabase } from "@/integrations/supabase/client";
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
import { summarizeContainers, fmtG, type StockContainer } from "@/lib/containers";
import { MaterialBadge, materialOf, materialTotals, strainOf } from "@/lib/materials";
import { FORMAT_TYPE_CLASS, indexFormats, usePackagingFormats } from "@/lib/packaging-formats";




type Lot = Tables<"inventory_lots">;
type Batch = Tables<"batches">;

// URL views group product/status filters into semantic buckets that match the dashboard cards.
const searchSchema = z.object({
  view: fallback(z.string(), "all").default("all"), // all | bulk | packaged | sample
  status: fallback(z.string(), "all").default("all"),
  type: fallback(z.string(), "all").default("all"),
  format: fallback(z.string(), "all").default("all"),
  kind: fallback(z.string(), "all").default("all"),
  location: fallback(z.string(), "all").default("all"),
  batch: fallback(z.string(), "all").default("all"),
  material: fallback(z.string(), "all").default("all"), // all | flower | trim

});


export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({ meta: [{ title: "Inventaire — ONO Cannabis" }] }),
  validateSearch: zodValidator(searchSchema),
  component: InventoryPage,
});

export const STATUS_VARIANTS: Record<string, { label: string; className: string }> = {
  available: {
    label: "Disponible",
    className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  },
  reserved: {
    label: "Réservé",
    className: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  },
  shipped: {
    label: "Expédié",
    className: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  },
  destroyed: {
    label: "Détruit",
    className: "bg-red-500/15 text-red-400 border-red-500/30",
  },
};

export function LotStatusBadge({ status }: { status: string | null }) {
  const key = status ?? "";
  const v = STATUS_VARIANTS[key] ?? {
    label: status ?? "—",
    className: "bg-muted text-muted-foreground",
  };
  return (
    <Badge variant="outline" className={v.className}>
      {v.label}
    </Badge>
  );
}

export const PRODUCT_TYPES = [
  { value: "bulk", label: "Bulk" },
  { value: "flower", label: "Flower" },
  { value: "trim", label: "Trim" },
  { value: "preroll", label: "Preroll" },
  { value: "packaged", label: "Mastercase" },
  { value: "sample", label: "Sample" },
];


export const FLOWER_SIZES = [
  { value: "hand_trim", label: "Hand trim" },
  { value: "big", label: "Big" },
  { value: "medium", label: "Medium" },
  { value: "small", label: "Small" },
  { value: "trim", label: "Trim" },
];

const VIEW_LABEL: Record<string, string> = {
  all: "Tous les lots",
  bulk: "Bulk (flower + trim, disponibles)",
  packaged: "Mastercase avec timbres (en stock)",
  sample: "Échantillons (par batch)",
  retention: "Rétention (bloqués — destruction après 3 ans)",
};

export const LOT_KIND_VARIANTS: Record<string, { label: string; className: string }> = {
  bulk: { label: "Bulk", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  packaged: { label: "Mastercase", className: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
  sample: { label: "Échantillon", className: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" },
  retention: { label: "Rétention 🔒", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
};

export function LotKindBadge({ kind }: { kind: string | null }) {
  const v = LOT_KIND_VARIANTS[kind ?? ""] ?? { label: kind ?? "—", className: "bg-muted text-muted-foreground" };
  return <Badge variant="outline" className={v.className}>{v.label}</Badge>;
}

function InventoryPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const {
    view,
    status: statusFilter,
    type: typeFilter,
    format: formatFilter,
    kind: kindFilter,
    location: locationFilter,
    batch: batchFilter,
    material: materialFilter,
  } = search;

  const { roles } = useAuth();
  const { formats } = usePackagingFormats(false);
  const formatsById = indexFormats(formats);
  const isViewerOnly = roles.length > 0 && roles.every((r) => r === "viewer");
  const [lots, setLots] = useState<Lot[] | null>(null);
  const [batches, setBatches] = useState<Record<string, Batch>>({});
  const [containers, setContainers] = useState<Record<string, StockContainer[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [allBatches, setAllBatches] = useState<Batch[]>([]);
  const [locations, setLocations] = useState<string[]>([]);

  const patch = (p: Partial<typeof search>) =>
    navigate({ to: "/inventory", search: { ...search, ...p, view: "all" } });
  const setStatusFilter = (v: string) => patch({ status: v });
  const setTypeFilter = (v: string) => patch({ type: v });
  const setView = (v: string) =>
    navigate({
      to: "/inventory",
      search: {
        view: v,
        status: "all",
        type: "all",
        format: "all",
        kind: "all",
        location: "all",
        batch: "all",
        material: "all",

      },
    });

  useEffect(() => {
    (async () => {
      const [{ data: bs }, { data: locs }] = await Promise.all([
        supabase.from("batches").select("*").order("batch_number", { ascending: true }),
        supabase.from("inventory_lots").select("location"),
      ]);
      setAllBatches(bs ?? []);
      setLocations(
        Array.from(
          new Set((locs ?? []).map((l) => l.location).filter((x): x is string => !!x)),
        ).sort(),
      );
    })();
  }, []);


  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      let query = supabase
        .from("inventory_lots")
        .select("*")
        .order("created_at", { ascending: false });

      if (view === "bulk") {
        query = (query as any).eq("status", "available").eq("lot_kind", "bulk");
      } else if (view === "sample") {
        query = (query as any).eq("lot_kind", "sample");
      } else if (view === "retention") {
        query = (query as any).eq("lot_kind", "retention");
      } else if (view === "packaged") {
        query = (query as any).eq("status", "available").eq("lot_kind", "packaged");
      } else {
        if (statusFilter !== "all") query = query.eq("status", statusFilter);
        if (typeFilter !== "all") query = query.eq("product_type", typeFilter);
        if (formatFilter !== "all") query = query.eq("format_id", formatFilter);
        if (kindFilter !== "all") query = query.eq("lot_kind", kindFilter);
        if (locationFilter !== "all") query = query.eq("location", locationFilter);
        if (batchFilter !== "all") query = query.eq("batch_id", batchFilter);
      }


      const { data, error } = await query;
      if (cancelled) return;
      if (error) {
        setError(error.message);
        return;
      }
      const rows = data ?? [];
      setLots(rows);
      const lotIds = rows.map((r) => r.id);
      if (lotIds.length > 0) {
        const { data: cs } = await supabase
          .from("stock_containers")
          .select("*")
          .in("lot_id", lotIds);
        if (!cancelled) {
          const grouped: Record<string, StockContainer[]> = {};
          (cs ?? []).forEach((c) => {
            grouped[c.lot_id] = [...(grouped[c.lot_id] ?? []), c];
          });
          setContainers(grouped);
        }
      } else {
        setContainers({});
      }
      const ids = Array.from(
        new Set(rows.map((r) => r.batch_id).filter((x): x is string => !!x)),
      );
      if (ids.length > 0) {
        const { data: bs } = await supabase
          .from("batches")
          .select("*")
          .in("id", ids);
        const map: Record<string, Batch> = {};
        (bs ?? []).forEach((b) => (map[b.id] = b));
        if (!cancelled) setBatches(map);
      } else {
        setBatches({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [view, statusFilter, typeFilter, formatFilter, kindFilter, locationFilter, batchFilter]);

  const labelOf = (arr: { value: string; label: string }[], v: string | null) =>
    arr.find((x) => x.value === v)?.label ?? v ?? "—";

  // Fleur et Trim ne sont jamais fusionnés : filtre client + totaux distincts.
  const visibleLots =
    lots === null
      ? null
      : materialFilter === "all"
        ? lots
        : lots.filter((l) => materialOf(l) === materialFilter);
  const totals = materialTotals(visibleLots ?? []);


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Inventaire</h1>
          <p className="text-sm text-muted-foreground">
            {VIEW_LABEL[view] ?? "Lots de produit, formats, emplacements et statuts."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={!lots || lots.length === 0}
            onClick={() => {
              if (!lots) return;
              exportXlsx("inventaire", [
                {
                  name: "Lots",
                  rows: lots.map((l) => ({
                    "Numéro lot": l.lot_number,
                    Batch: l.batch_id ? batches[l.batch_id]?.batch_number ?? "" : "",
                    Type: labelOf(PRODUCT_TYPES, l.product_type),
                    Format:
                      (l.format_id ? formatsById[l.format_id]?.name : null) ?? l.format ?? "",

                    Taille: labelOf(FLOWER_SIZES, l.flower_size),
                    "Quantité (g)": l.quantity_grams ?? "",
                    Unités: l.units ?? "",
                    Emplacement: l.location ?? "",
                    Statut: l.status ?? "",
                    "Créé le": fmtDate(l.created_at),
                  })),
                },
              ]);
            }}
          >
            <Download className="mr-1 h-4 w-4" /> Exporter Excel
          </Button>
          {roles.some((r) => r === "admin" || r === "supervisor") && (
            <Button variant="outline" onClick={() => navigate({ to: "/inventory/import" })}>
              <Upload className="mr-1 h-4 w-4" />
              Import bulk
            </Button>
          )}
          {!isViewerOnly && (
            <Button onClick={() => navigate({ to: "/inventory/new" })}>
              <Plus className="mr-1 h-4 w-4" />
              Nouveau lot
            </Button>
          )}

        </div>

      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Vue</span>
          <Select value={view} onValueChange={setView}>
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les lots</SelectItem>
              <SelectItem value="bulk">Bulk (flower + trim)</SelectItem>
              <SelectItem value="packaged">Mastercase avec timbres</SelectItem>
              <SelectItem value="sample">Échantillons</SelectItem>
              <SelectItem value="retention">Rétention 🔒</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {view === "all" && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Statut</span>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  <SelectItem value="available">Disponible</SelectItem>
                  <SelectItem value="reserved">Réservé</SelectItem>
                  <SelectItem value="shipped">Expédié</SelectItem>
                  <SelectItem value="destroyed">Détruit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Type</span>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  {PRODUCT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Format</span>
              <Select value={formatFilter} onValueChange={(v) => patch({ format: v })}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  {formats.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Nature</span>
              <Select value={kindFilter} onValueChange={(v) => patch({ kind: v })}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes</SelectItem>
                  {Object.entries(LOT_KIND_VARIANTS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Emplacement</span>
              <Select value={locationFilter} onValueChange={(v) => patch({ location: v })}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  {locations.map((loc) => (
                    <SelectItem key={loc} value={loc}>
                      {loc}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Batch</span>
              <Select value={batchFilter} onValueChange={(v) => patch({ batch: v })}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes</SelectItem>
                  {allBatches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.batch_number}
                      {b.strain ? ` — ${b.strain}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}

      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Fleur disponible
          </p>
          <p className="text-2xl font-semibold text-emerald-400 tabular-nums">
            {fmtG(totals.flower)} g
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Trim disponible
          </p>
          <p className="text-2xl font-semibold text-lime-400 tabular-nums">
            {fmtG(totals.trim)} g
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Matière non qualifiée
          </p>
          <p className="text-2xl font-semibold text-muted-foreground tabular-nums">
            {fmtG(totals.unknown)} g
          </p>
        </Card>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Numéro de lot</TableHead>
                <TableHead>Variété</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Format</TableHead>
                <TableHead>Nature</TableHead>
                <TableHead className="text-right">Quantité (g)</TableHead>
                <TableHead className="text-right">Unités</TableHead>
                <TableHead>Emplacement</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {error && (
                <TableRow>
                  <TableCell colSpan={9} className="text-destructive">
                    {error}
                  </TableCell>
                </TableRow>
              )}
              {!error && lots === null && (
                <>
                  {[...Array(3)].map((_, i) => (
                    <TableRow key={i}>
                      {[...Array(9)].map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </>
              )}
              {visibleLots && visibleLots.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="text-center text-muted-foreground py-8"
                  >
                    Aucun lot pour le moment.
                  </TableCell>
                </TableRow>
              )}
              {visibleLots?.map((l) => {
                const s = summarizeContainers(containers[l.id] ?? []);
                const batch = l.batch_id ? batches[l.batch_id] : null;
                const strain = strainOf(l, batch);
                return (
                  <TableRow
                    key={l.id}
                    className="cursor-pointer"
                    onClick={() =>
                      navigate({ to: "/inventory/$id", params: { id: l.id } })
                    }
                  >
                    <TableCell className="font-medium">
                      <Link
                        to="/inventory/$id"
                        params={{ id: l.id }}
                        className="hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {l.lot_number}
                      </Link>
                      {batch && (
                        <span className="block text-xs text-muted-foreground">
                          {batch.batch_number}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {strain ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <MaterialBadge lot={l} />
                    </TableCell>
                    <TableCell>
                      {l.format_id && formatsById[l.format_id] ? (
                        <Badge
                          variant="outline"
                          className={
                            FORMAT_TYPE_CLASS[formatsById[l.format_id].format_type] ??
                            "bg-muted text-muted-foreground"
                          }
                        >
                          {formatsById[l.format_id].name}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">{l.format ?? "—"}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <LotKindBadge kind={l.lot_kind} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtG(Number(l.quantity_grams ?? 0))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.total > 0 ? s.available : (l.units ?? 0)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {l.location ?? "—"}
                    </TableCell>
                    <TableCell>
                      <LotStatusBadge status={l.status} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

    </div>
  );
}

