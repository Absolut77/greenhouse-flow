import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Pencil, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import {
  ContainersSection,
  containerMaterialLot,
} from "@/components/inventory/containers-section";
import { Badge } from "@/components/ui/badge";
import { fetchContainersForLots, type StockContainer } from "@/lib/containers";
import { usePackagingFormats, indexFormats } from "@/lib/packaging-formats";
import { formatZonedDate } from "@/lib/dates";
import { MaterialBadge, materialLabel, materialOf, strainOf } from "@/lib/materials";

import {
  LotStatusBadge,
  PRODUCT_TYPES,
  FLOWER_SIZES,
} from "./inventory";

type Lot = Tables<"inventory_lots">;
type Batch = Tables<"batches">;


export const Route = createFileRoute("/_authenticated/inventory_/$id")({
  head: () => ({ meta: [{ title: "Lot — ONO Cannabis" }] }),
  component: LotDetailPage,
});

function LotDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [lot, setLot] = useState<Lot | null>(null);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [containers, setContainers] = useState<StockContainer[]>([]);
  const { formats } = usePackagingFormats(false);
  const formatMap = indexFormats(formats);

  const load = async () => {
    setError(null);
    const { data, error } = await supabase
      .from("inventory_lots")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      setError(error.message);
      return;
    }
    if (!data) {
      setError("Lot introuvable");
      return;
    }
    setLot(data);

    // Batch liée : directe, sinon héritée du lot parent (lots issus de packaging).
    let batchId = data.batch_id;
    if (!batchId && data.parent_lot_id) {
      const { data: parent } = await supabase
        .from("inventory_lots")
        .select("batch_id")
        .eq("id", data.parent_lot_id)
        .maybeSingle();
      batchId = parent?.batch_id ?? null;
    }
    if (batchId) {
      const { data: b } = await supabase
        .from("batches")
        .select("*")
        .eq("id", batchId)
        .maybeSingle();
      setBatch(b ?? null);
    } else {
      setBatch(null);
    }

    try {
      setContainers(await fetchContainersForLots([data.id]));
    } catch {
      setContainers([]);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const changeStatus = async (next: string) => {
    if (!lot) return;
    setUpdating(true);
    const { data, error } = await supabase
      .from("inventory_lots")
      .update({ status: next })
      .eq("id", lot.id)
      .select()
      .single();
    setUpdating(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setLot(data);
    toast.success("Statut mis à jour");
  };

  const confirmDelete = async () => {
    if (!lot) return;
    setDeleting(true);
    const { error } = await supabase
      .from("inventory_lots")
      .delete()
      .eq("id", lot.id);
    setDeleting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Lot supprimé");
    navigate({ to: "/inventory" });
  };

  if (error) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/inventory">
            <ArrowLeft className="mr-1 h-4 w-4" /> Retour
          </Link>
        </Button>
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  if (!lot) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement...
      </div>
    );
  }

  const labelOf = (arr: { value: string; label: string }[], v: string | null) =>
    arr.find((x) => x.value === v)?.label ?? v ?? "—";

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/inventory">
            <ArrowLeft className="mr-1 h-4 w-4" /> Retour à l'inventaire
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">
            {lot.lot_number}
            {strainOf(lot, batch) && (
              <span className="ml-2 text-xl font-normal text-emerald-400">
                {strainOf(lot, batch)}
              </span>
            )}
          </h1>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <LotStatusBadge status={lot.status} />
            <MaterialBadge lot={lot} />
            <span>Créé le {formatZonedDate(lot.created_at)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={lot.status ?? ""}
            onValueChange={changeStatus}
            disabled={updating}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Changer statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="available">Disponible</SelectItem>
              <SelectItem value="reserved">Réservé</SelectItem>
              <SelectItem value="shipped">Expédié</SelectItem>
              <SelectItem value="destroyed">Détruit</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" asChild>
            <Link to="/inventory/$id/edit" params={{ id: lot.id }}>
              <Pencil className="mr-1 h-4 w-4" /> Modifier
            </Link>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="mr-1 h-4 w-4 text-destructive" /> Supprimer
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Informations</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Info label="Batch">
            {batch ? (
              <Link
                to="/batches/$id"
                params={{ id: batch.id }}
                className="hover:underline"
              >
                {batch.batch_number}
                {batch.strain ? ` — ${batch.strain}` : ""}
              </Link>
            ) : (
              "—"
            )}
          </Info>
          <Info label="Variété">{strainOf(lot, batch) ?? "—"}</Info>
          <Info label="Matière">{materialLabel(materialOf(lot))}</Info>
          <Info label="Type de produit">
            {labelOf(PRODUCT_TYPES, lot.product_type)}
          </Info>

          <Info label="Format">{lot.format ?? "—"}</Info>
          <Info label="Taille de fleur">
            {labelOf(FLOWER_SIZES, lot.flower_size)}
          </Info>
          <Info label="Quantité (g)">{lot.quantity_grams ?? "—"}</Info>
          <Info label="Unités">{lot.units ?? "—"}</Info>
          <Info label="Emplacement">{lot.location ?? "—"}</Info>
          <Info label="Lot parent">{lot.parent_lot_id ?? "—"}</Info>
          {batch && (batch as any).dry_cap_grams != null && (
            <Info label="Plafond batch (poids sec bulk packaging)">
              <span className="font-medium text-emerald-400">
                {Number((batch as any).dry_cap_grams).toFixed(2)} g
              </span>
              <span className="block text-xs text-muted-foreground">
                Total inventaire de la batch plafonné à cette valeur.
              </span>
            </Info>
          )}

        </CardContent>
      </Card>

      <ContainersSection
        lotId={lot.id}
        defaultType={(lot as any).lot_kind ?? "bulk"}
        onChanged={load}
      />

      {lot.batch_id && <PackagingBagsSection batchId={lot.batch_id} />}


      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce lot ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-sm">{children}</p>
    </div>
  );
}


function PackagingBagsSection({ batchId }: { batchId: string }) {
  const [bags, setBags] = useState<any[] | null>(null);
  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("packaging_bags")
        .select("*")
        .eq("batch_id", batchId)
        .order("created_at", { ascending: true });
      setBags(data ?? []);
    })();
  }, [batchId]);

  if (!bags) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement des sacs...
        </CardContent>
      </Card>
    );
  }
  if (bags.length === 0) return null;

  const totalNet = bags.reduce((s, b) => s + Number(b.net_weight_grams) * Number(b.bag_count), 0);
  const totalBags = bags.reduce((s, b) => s + Number(b.bag_count), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Détail des sacs ({totalBags} sacs — {totalNet.toFixed(2)} g)</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-muted-foreground">
              <th className="py-2 pr-3">Type de fleur</th>
              <th className="py-2 pr-3 text-right">Nb</th>
              <th className="py-2 pr-3 text-right">Net / sac (g)</th>
              <th className="py-2 pr-3 text-right">Brut / sac (g)</th>
              <th className="py-2 pr-3 text-right">Total net (g)</th>
              <th className="py-2 pr-3">Emplacement</th>
            </tr>
          </thead>
          <tbody>
            {bags.map((b) => (
              <tr key={b.id} className="border-b last:border-0">
                <td className="py-2 pr-3">{b.flower_type}</td>
                <td className="py-2 pr-3 text-right">{b.bag_count}</td>
                <td className="py-2 pr-3 text-right">{Number(b.net_weight_grams).toFixed(2)}</td>
                <td className="py-2 pr-3 text-right">
                  {b.gross_weight_grams != null ? Number(b.gross_weight_grams).toFixed(2) : "—"}
                </td>
                <td className="py-2 pr-3 text-right">
                  {(Number(b.net_weight_grams) * Number(b.bag_count)).toFixed(2)}
                </td>
                <td className="py-2 pr-3">{b.location ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
