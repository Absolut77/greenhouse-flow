import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Download } from "lucide-react";
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

type Lot = Tables<"inventory_lots">;
type Batch = Tables<"batches">;

// URL views group product/status filters into semantic buckets that match the dashboard cards.
const searchSchema = z.object({
  view: fallback(z.string(), "all").default("all"), // all | bulk | packaged | sample
  status: fallback(z.string(), "all").default("all"),
  type: fallback(z.string(), "all").default("all"),
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
  { value: "flower", label: "Flower" },
  { value: "trim", label: "Trim" },
  { value: "preroll", label: "Preroll" },
  { value: "sample", label: "Sample" },
];

export const FLOWER_SIZES = [
  { value: "big", label: "Big" },
  { value: "medium", label: "Medium" },
  { value: "small", label: "Small" },
  { value: "hand_trim", label: "Hand Trim" },
  { value: "mix", label: "Mix" },
];

const VIEW_LABEL: Record<string, string> = {
  all: "Tous les lots",
  bulk: "Bulk (flower + trim, disponibles)",
  packaged: "Packagé avec timbres (en stock)",
  sample: "Échantillons (par batch)",
  retention: "Rétention (bloqués — destruction après 3 ans)",
};

export const LOT_KIND_VARIANTS: Record<string, { label: string; className: string }> = {
  bulk: { label: "Bulk", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  packaged: { label: "Packagé", className: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
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
  const { view, status: statusFilter, type: typeFilter } = search;
  const { roles } = useAuth();
  const isViewerOnly = roles.length > 0 && roles.every((r) => r === "viewer");
  const [lots, setLots] = useState<Lot[] | null>(null);
  const [batches, setBatches] = useState<Record<string, Batch>>({});
  const [error, setError] = useState<string | null>(null);

  const setStatusFilter = (v: string) =>
    navigate({ to: "/inventory", search: { ...search, status: v, view: "all" } });
  const setTypeFilter = (v: string) =>
    navigate({ to: "/inventory", search: { ...search, type: v, view: "all" } });
  const setView = (v: string) =>
    navigate({ to: "/inventory", search: { view: v, status: "all", type: "all" } });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      let query = supabase
        .from("inventory_lots")
        .select("*")
        .order("created_at", { ascending: false });

      if (view === "bulk") {
        query = query.eq("status", "available").in("product_type", ["flower", "trim"]);
      } else if (view === "sample") {
        query = (query as any).eq("lot_kind", "sample");
      } else if (view === "retention") {
        query = (query as any).eq("lot_kind", "retention");
      } else if (view === "packaged") {
        query = query.eq("status", "available").not("parent_lot_id", "is", null);
      } else {
        if (statusFilter !== "all") query = query.eq("status", statusFilter);
        if (typeFilter !== "all") query = query.eq("product_type", typeFilter);
      }

      const { data, error } = await query;
      if (cancelled) return;
      if (error) {
        setError(error.message);
        return;
      }
      const rows = data ?? [];
      setLots(rows);
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
  }, [view, statusFilter, typeFilter]);

  const labelOf = (arr: { value: string; label: string }[], v: string | null) =>
    arr.find((x) => x.value === v)?.label ?? v ?? "—";

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
                    Format: l.format ?? "",
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
              <SelectItem value="packaged">Packagé avec timbres</SelectItem>
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
          </>
        )}
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Numéro de lot</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Format</TableHead>
                <TableHead>Taille</TableHead>
                <TableHead>Quantité (g)</TableHead>
                <TableHead>Unités</TableHead>
                <TableHead>Emplacement</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Créé le</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {error && (
                <TableRow>
                  <TableCell colSpan={10} className="text-destructive">
                    {error}
                  </TableCell>
                </TableRow>
              )}
              {!error && lots === null && (
                <>
                  {[...Array(3)].map((_, i) => (
                    <TableRow key={i}>
                      {[...Array(10)].map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </>
              )}
              {lots && lots.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={10}
                    className="text-center text-muted-foreground py-8"
                  >
                    Aucun lot pour le moment.
                  </TableCell>
                </TableRow>
              )}
              {lots?.map((l) => (
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
                  </TableCell>
                  <TableCell>
                    {l.batch_id && batches[l.batch_id] ? (
                      <Link
                        to="/batches/$id"
                        params={{ id: l.batch_id }}
                        className="hover:underline text-muted-foreground"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {batches[l.batch_id].batch_number}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{labelOf(PRODUCT_TYPES, l.product_type)}</TableCell>
                  <TableCell>{l.format ?? "—"}</TableCell>
                  <TableCell>{labelOf(FLOWER_SIZES, l.flower_size)}</TableCell>
                  <TableCell>{l.quantity_grams ?? "—"}</TableCell>
                  <TableCell>{l.units ?? "—"}</TableCell>
                  <TableCell>{l.location ?? "—"}</TableCell>
                  <TableCell>
                    <LotStatusBadge status={l.status} />
                  </TableCell>
                  <TableCell>
                    {new Date(l.created_at).toLocaleDateString("fr-CA")}
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
