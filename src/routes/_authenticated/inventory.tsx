import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Download, Upload } from "lucide-react";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { exportXlsx } from "@/lib/export-xlsx";

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
import { fmtG } from "@/lib/containers";
import { materialOf, strainOf } from "@/lib/materials";
import { FORMAT_TYPE_CLASS, indexFormats, usePackagingFormats } from "@/lib/packaging-formats";

type Lot = Tables<"inventory_lots">;
type Batch = Tables<"batches">;

// La liste est regroupée par batch : une ligne = une batch ayant du stock.
const searchSchema = z.object({
  batch: fallback(z.string(), "all").default("all"),
  strain: fallback(z.string(), "all").default("all"),
  material: fallback(z.string(), "all").default("all"), // all | flower | trim
  format: fallback(z.string(), "all").default("all"),
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

export type BatchStockGroup = {
  key: string; // batch id ou "__none__"
  batch: Batch | null;
  batchNumber: string;
  strain: string | null;
  lots: Lot[];
  flower: number;
  trim: number;
  unknown: number;
  units: number;
  formatIds: string[];
  formatLabels: string[];
  locations: string[];
  status: string;
};

const NO_BATCH = "__none__";

/**
 * Regroupe les lots par batch. Les totaux ne comptent que les lots disponibles.
 * `gramsOf` permet de retomber sur le poids des contenants quand le lot n'a pas
 * de `quantity_grams` renseigné.
 */
export function groupLotsByBatch(
  lots: Lot[],
  batches: Record<string, Batch>,
  formatName: (id: string | null, fallbackText: string | null) => string | null,
  gramsOf: (lot: Lot) => number = (l) => Number(l.quantity_grams ?? 0),
): BatchStockGroup[] {
  const map = new Map<string, Lot[]>();
  for (const l of lots) {
    const k = l.batch_id ?? NO_BATCH;
    map.set(k, [...(map.get(k) ?? []), l]);
  }
  const groups: BatchStockGroup[] = [];
  for (const [key, rows] of map) {
    const batch = key === NO_BATCH ? null : (batches[key] ?? null);
    const available = rows.filter((r) => (r.status ?? "available") === "available");
    const totals = { flower: 0, trim: 0, unknown: 0 };
    for (const r of available) {
      const g = gramsOf(r);
      const m = materialOf(r);
      if (m === "flower") totals.flower += g;
      else if (m === "trim") totals.trim += g;
      else totals.unknown += g;
    }
    const formatIds = Array.from(
      new Set(available.map((r) => r.format_id).filter((x): x is string => !!x)),
    );
    const formatLabels = Array.from(
      new Set(
        available
          .map((r) => formatName(r.format_id, r.format))
          .filter((x): x is string => !!x),
      ),
    ).sort();
    groups.push({
      key,
      batch,
      batchNumber: batch?.batch_number ?? (key === NO_BATCH ? "Sans batch" : "—"),
      strain:
        batch?.strain?.trim() ||
        rows.map((r) => strainOf(r, batch)).find((s): s is string => !!s) ||
        null,
      lots: rows,
      flower: totals.flower,
      trim: totals.trim,
      unknown: totals.unknown,
      units: available.reduce((s, r) => s + Number(r.units ?? 0), 0),
      formatIds,
      formatLabels,
      locations: Array.from(
        new Set(available.map((r) => r.location).filter((x): x is string => !!x)),
      ).sort(),
      status: available.length > 0 ? "available" : (rows[0]?.status ?? "—"),
    });
  }
  return groups.sort((a, b) => {
    if (a.key === NO_BATCH) return 1;
    if (b.key === NO_BATCH) return -1;
    return a.batchNumber.localeCompare(b.batchNumber, "fr", { numeric: true });
  });
}

function InventoryPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { batch: batchFilter, strain: strainFilter, material: materialFilter, format: formatFilter } = search;

  const { roles } = useAuth();
  const { formats } = usePackagingFormats(false);
  const formatsById = indexFormats(formats);
  const isViewerOnly = roles.length > 0 && roles.every((r) => r === "viewer");

  const [lots, setLots] = useState<Lot[] | null>(null);
  const [batches, setBatches] = useState<Record<string, Batch>>({});
  const [allBatches, setAllBatches] = useState<Batch[]>([]);
  const [lotGrams, setLotGrams] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  const patch = (p: Partial<typeof search>) =>
    navigate({ to: "/inventory", search: { ...search, ...p } });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      const [{ data, error: err }, { data: bs }, { data: cs }] = await Promise.all([
        supabase.from("inventory_lots").select("*").order("created_at", { ascending: false }),
        supabase.from("batches").select("*").order("batch_number", { ascending: true }),
        supabase.from("stock_containers").select("lot_id,net_weight_grams,status"),
      ]);
      if (cancelled) return;
      if (err) {
        setError(err.message);
        return;
      }
      const map: Record<string, Batch> = {};
      (bs ?? []).forEach((b) => (map[b.id] = b));
      const grams: Record<string, number> = {};
      (cs ?? []).forEach((c) => {
        if (!c.lot_id || (c.status ?? "available") !== "available") return;
        grams[c.lot_id] = (grams[c.lot_id] ?? 0) + Number(c.net_weight_grams ?? 0);
      });
      setBatches(map);
      setAllBatches(bs ?? []);
      setLotGrams(grams);
      setLots(data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const formatName = (id: string | null, fallbackText: string | null) =>
    (id ? formatsById[id]?.name : null) ?? fallbackText ?? null;

  const groups = useMemo(() => {
    if (!lots) return null;
    // Poids du lot : `quantity_grams` sinon somme des sacs disponibles.
    const gramsOf = (l: Lot) => Number(l.quantity_grams ?? 0) || (lotGrams[l.id] ?? 0);
    return groupLotsByBatch(lots, batches, formatName, gramsOf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lots, batches, formats, lotGrams]);

  const visibleGroups = useMemo(() => {
    if (!groups) return null;
    return groups.filter((g) => {
      if (batchFilter !== "all" && g.key !== batchFilter) return false;
      if (strainFilter !== "all" && (g.strain ?? "—") !== strainFilter) return false;
      if (materialFilter === "flower" && g.flower <= 0) return false;
      if (materialFilter === "trim" && g.trim <= 0) return false;
      if (formatFilter !== "all" && !g.formatIds.includes(formatFilter)) return false;
      // Batches entièrement expédiées/détruites : masquées sauf filtre batch explicite.
      if (batchFilter === "all" && g.status !== "available") return false;
      return true;
    });
  }, [groups, batchFilter, strainFilter, materialFilter, formatFilter]);

  const strains = useMemo(
    () =>
      Array.from(new Set((groups ?? []).map((g) => g.strain).filter((s): s is string => !!s))).sort(),
    [groups],
  );

  const totals = (visibleGroups ?? []).reduce(
    (acc, g) => ({ flower: acc.flower + g.flower, trim: acc.trim + g.trim, unknown: acc.unknown + g.unknown }),
    { flower: 0, trim: 0, unknown: 0 },
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Inventaire</h1>
          <p className="text-sm text-muted-foreground">
            Une ligne par batch ayant du stock. Cliquez pour voir tout le détail (lots, sacs, formats).
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={!visibleGroups || visibleGroups.length === 0}
            onClick={() => {
              if (!visibleGroups) return;
              // Export : feuille "Résumé par batch" + feuille "Détail lots".
              exportXlsx("inventaire", [
                {
                  name: "Résumé par batch",
                  rows: visibleGroups.map((g) => ({
                    Batch: g.batchNumber,
                    Variété: g.strain ?? "",
                    "Fleur (g)": g.flower,
                    "Trim (g)": g.trim,
                    "Non qualifié (g)": g.unknown,
                    Unités: g.units,
                    Formats: g.formatLabels.join(", "),
                    Emplacements: g.locations.join(", "),
                    Statut: g.status,
                  })),
                },
                {
                  name: "Détail lots",
                  rows: visibleGroups.flatMap((g) =>
                    g.lots.map((l) => ({
                      Batch: g.batchNumber,
                      "Numéro lot": l.lot_number,
                      Variété: strainOf(l, g.batch) ?? "",
                      Matière: materialOf(l) === "trim" ? "Trim" : materialOf(l) === "flower" ? "Fleur" : "",
                      Nature: l.lot_kind ?? "",
                      Format: formatName(l.format_id, l.format) ?? "",
                      "Quantité (g)": l.quantity_grams ?? "",
                      Unités: l.units ?? "",
                      Emplacement: l.location ?? "",
                      Statut: l.status ?? "",
                    })),
                  ),
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
          <span className="text-sm text-muted-foreground">Batch</span>
          <Select value={batchFilter} onValueChange={(v) => patch({ batch: v })}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes</SelectItem>
              <SelectItem value={NO_BATCH}>Sans batch</SelectItem>
              {allBatches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.batch_number}
                  {b.strain ? ` — ${b.strain}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Variété</span>
          <Select value={strainFilter} onValueChange={(v) => patch({ strain: v })}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes</SelectItem>
              {strains.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Matière</span>
          <Select value={materialFilter} onValueChange={(v) => patch({ material: v })}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Fleur + Trim</SelectItem>
              <SelectItem value="flower">A de la fleur</SelectItem>
              <SelectItem value="trim">A de la trim</SelectItem>
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
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Fleur disponible</p>
          <p className="text-2xl font-semibold text-emerald-400 tabular-nums">{fmtG(totals.flower)} g</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Trim disponible</p>
          <p className="text-2xl font-semibold text-lime-400 tabular-nums">{fmtG(totals.trim)} g</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Matière non qualifiée</p>
          <p className="text-2xl font-semibold text-muted-foreground tabular-nums">{fmtG(totals.unknown)} g</p>
        </Card>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Batch</TableHead>
                <TableHead>Variété</TableHead>
                <TableHead className="text-right">Fleur (g)</TableHead>
                <TableHead className="text-right">Trim (g)</TableHead>
                <TableHead className="text-right">Unités</TableHead>
                <TableHead>Formats</TableHead>
                <TableHead>Emplacements</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {error && (
                <TableRow>
                  <TableCell colSpan={8} className="text-destructive">
                    {error}
                  </TableCell>
                </TableRow>
              )}
              {!error && lots === null && (
                <>
                  {[...Array(3)].map((_, i) => (
                    <TableRow key={i}>
                      {[...Array(8)].map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </>
              )}
              {visibleGroups && visibleGroups.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    Aucun stock pour le moment.
                  </TableCell>
                </TableRow>
              )}
              {visibleGroups?.map((g) => (
                <TableRow
                  key={g.key}
                  className="cursor-pointer"
                  onClick={() =>
                    navigate({ to: "/inventory/batch/$batchId", params: { batchId: g.key } })
                  }
                >
                  <TableCell className="font-medium">
                    <Link
                      to="/inventory/batch/$batchId"
                      params={{ batchId: g.key }}
                      className="hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {g.batchNumber}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      {g.lots.length} lot{g.lots.length > 1 ? "s" : ""}
                    </span>
                  </TableCell>
                  <TableCell>
                    {g.strain ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-400">
                    {fmtG(g.flower)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-lime-400">
                    {fmtG(g.trim)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{g.units}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {g.formatIds.length === 0 && g.formatLabels.length === 0 && (
                        <span className="text-muted-foreground">—</span>
                      )}
                      {g.formatLabels.map((name) => {
                        const id = g.formatIds.find((fid) => formatsById[fid]?.name === name);
                        const type = id ? formatsById[id]?.format_type : null;
                        return (
                          <Badge
                            key={name}
                            variant="outline"
                            className={
                              (type && FORMAT_TYPE_CLASS[type]) ?? "bg-muted text-muted-foreground"
                            }
                          >
                            {name}
                          </Badge>
                        );
                      })}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {g.locations.length === 0
                      ? "—"
                      : g.locations.length <= 2
                        ? g.locations.join(", ")
                        : `${g.locations.length} emplacements`}
                  </TableCell>
                  <TableCell>
                    <LotStatusBadge status={g.status} />
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
