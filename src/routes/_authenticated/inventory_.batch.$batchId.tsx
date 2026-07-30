import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Download } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Tables } from "@/integrations/supabase/types";
import { exportXlsx } from "@/lib/export-xlsx";
import { fmtG, type StockCarton, type StockContainer } from "@/lib/containers";
import { MaterialBadge, materialLabel, materialOf, strainOf } from "@/lib/materials";
import { FORMAT_TYPE_CLASS, indexFormats, usePackagingFormats } from "@/lib/packaging-formats";
import { flowerSizeLabel } from "@/components/inventory/carton-builder";
import {
  ContainerTypeBadge,
  containerMaterialLot,
  containerSizeValue,
} from "@/components/inventory/containers-section";
import { FLOWER_SIZES, LotStatusBadge } from "@/routes/_authenticated/inventory";
import { isSubLot } from "@/lib/lot-display";

type Lot = Tables<"inventory_lots">;
type Batch = Tables<"batches">;

const NO_BATCH = "__none__";

export const Route = createFileRoute("/_authenticated/inventory_/batch/$batchId")({
  head: () => ({ meta: [{ title: "Stock de la batch — ONO Cannabis" }] }),
  component: BatchStockPage,
});

function BatchStockPage() {
  const { batchId } = Route.useParams();
  const navigate = useNavigate();
  const { formats } = usePackagingFormats(false);
  const formatsById = indexFormats(formats);

  const [batch, setBatch] = useState<Batch | null>(null);
  const [lots, setLots] = useState<Lot[] | null>(null);
  const [containers, setContainers] = useState<StockContainer[]>([]);
  const [cartons, setCartons] = useState<StockCarton[]>([]);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      let q = supabase.from("inventory_lots").select("*").order("created_at", { ascending: false });
      q = batchId === NO_BATCH ? q.is("batch_id", null) : q.eq("batch_id", batchId);
      const { data, error: err } = await q;
      if (cancelled) return;
      if (err) {
        setError(err.message);
        return;
      }
      const rows = data ?? [];
      setLots(rows);

      if (batchId !== NO_BATCH) {
        const { data: b } = await supabase
          .from("batches")
          .select("*")
          .eq("id", batchId)
          .maybeSingle();
        if (!cancelled) setBatch(b ?? null);
      }

      const ids = rows.map((r) => r.id);
      if (ids.length > 0) {
        const { data: cs } = await supabase
          .from("stock_containers")
          .select("*")
          .in("lot_id", ids)
          .order("container_code", { ascending: true });
        if (cancelled) return;
        const list = cs ?? [];
        setContainers(list);
        const cartonIds = Array.from(
          new Set(list.map((c) => c.carton_id).filter((x): x is string => !!x)),
        );
        if (cartonIds.length > 0) {
          const { data: ks } = await supabase
            .from("stock_cartons")
            .select("*")
            .in("id", cartonIds)
            .order("carton_code", { ascending: true });
          if (!cancelled) setCartons(ks ?? []);
        } else if (!cancelled) {
          setCartons([]);
        }
      } else if (!cancelled) {
        setContainers([]);
        setCartons([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [batchId]);

  const cartonCode = (id: string | null) =>
    (id ? cartons.find((k) => k.id === id)?.carton_code : null) ?? "—";

  const formatName = (id: string | null, fallbackText: string | null) =>
    (id ? formatsById[id]?.name : null) ?? fallbackText ?? null;

  // Poids d'un lot : `quantity_grams` sinon somme de ses sacs disponibles.
  const containerGrams = (lotId: string) =>
    containers
      .filter((c) => c.lot_id === lotId && (c.status ?? "available") === "available")
      .reduce((s, c) => s + Number(c.net_weight_grams ?? 0), 0);
  const gramsOf = (l: Lot) => Number(l.quantity_grams ?? 0) || containerGrams(l.id);
  const totals = (lots ?? [])
    .filter((l) => (l.status ?? "available") === "available")
    .reduce(
      (acc, l) => {
        const m = materialOf(l);
        const g = gramsOf(l);
        if (m === "flower") acc.flower += g;
        else if (m === "trim") acc.trim += g;
        else acc.unknown += g;
        return acc;
      },
      { flower: 0, trim: 0, unknown: 0 },
    );
  const availableLots = (lots ?? []).filter((l) => (l.status ?? "available") === "available");
  const formatNames = Array.from(
    new Set(
      availableLots.map((l) => formatName(l.format_id, l.format)).filter((x): x is string => !!x),
    ),
  ).sort();
  const strain =
    batch?.strain?.trim() ||
    (lots ?? []).map((l) => strainOf(l, batch)).find((s): s is string => !!s) ||
    null;
  const title = batchId === NO_BATCH ? "Lots sans batch" : (batch?.batch_number ?? "Batch");

  const sizeLabel = (v: string | null) =>
    v ? (FLOWER_SIZES.find((s) => s.value === v)?.label ?? flowerSizeLabel(v)) : "—";

  const FormatBadge = ({ id, text }: { id: string | null; text: string | null }) => {
    const name = formatName(id, text);
    if (!name) return <span className="text-muted-foreground">—</span>;
    const type = id ? formatsById[id]?.format_type : null;
    return (
      <Badge
        variant="outline"
        className={(type && FORMAT_TYPE_CLASS[type]) ?? "bg-muted text-muted-foreground"}
      >
        {name}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2"
            onClick={() => navigate({ to: "/inventory" })}
          >
            <ArrowLeft className="mr-1 h-4 w-4" /> Inventaire
          </Button>
          <h1 className="text-2xl font-semibold">
            {title}
            {strain && <span className="ml-2 text-xl font-normal text-emerald-400">{strain}</span>}
          </h1>
          {batch && (
            <Link
              to="/batches/$id"
              params={{ id: batch.id }}
              className="text-sm text-muted-foreground hover:underline"
            >
              Voir la fiche batch →
            </Link>
          )}
        </div>
        <Button
          variant="outline"
          disabled={containers.length === 0}
          onClick={() => {
            exportXlsx(`stock-${title}`, [
              {
                name: "Sacs",
                rows: containers.map((c) => ({
                  "Contenant / sac": c.container_code,
                  "Carton / Box": cartonCode(c.carton_id),
                  Type: c.container_type,
                  Matière: materialLabel(materialOf(containerMaterialLot(c))),
                  Taille: sizeLabel(containerSizeValue(c)),
                  Format: formatName(c.format_id, null) ?? "",
                  "Poids net (g)": c.net_weight_grams,
                  Unités: c.unit_count,
                  Emplacement: c.location ?? "",
                  Statut: c.status,
                })),
              },
            ]);
          }}
        >
          <Download className="mr-1 h-4 w-4" /> Exporter Excel
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Fleur restante</p>
          <p className="text-2xl font-semibold text-emerald-400 tabular-nums">
            {fmtG(totals.flower)} g
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Trim restante</p>
          <p className="text-2xl font-semibold text-lime-400 tabular-nums">{fmtG(totals.trim)} g</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Formats en stock</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {formatNames.length === 0 && <span className="text-muted-foreground">—</span>}
            {formatNames.map((n) => (
              <Badge key={n} variant="outline" className="bg-muted text-muted-foreground">
                {n}
              </Badge>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sacs / contenants ({containers.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contenant / sac</TableHead>
                <TableHead>Carton / Box</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Matière</TableHead>
                <TableHead>Taille</TableHead>
                <TableHead>Format</TableHead>
                <TableHead className="text-right">Poids net (g)</TableHead>
                <TableHead className="text-right">Unités</TableHead>
                <TableHead>Emplacement</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {containers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                    Aucun contenant enregistré.
                  </TableCell>
                </TableRow>
              )}
              {containers.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.container_code}</TableCell>
                  <TableCell className="text-muted-foreground">{cartonCode(c.carton_id)}</TableCell>

                  <TableCell>
                    <ContainerTypeBadge type={c.container_type} />
                  </TableCell>
                  <TableCell>
                    <MaterialBadge lot={containerMaterialLot(c)} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {sizeLabel(containerSizeValue(c))}
                  </TableCell>
                  <TableCell>
                    <FormatBadge id={c.format_id} text={null} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtG(Number(c.net_weight_grams ?? 0))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{c.unit_count ?? 0}</TableCell>
                  <TableCell className="text-muted-foreground">{c.location ?? "—"}</TableCell>
                  <TableCell>
                    <LotStatusBadge status={c.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
