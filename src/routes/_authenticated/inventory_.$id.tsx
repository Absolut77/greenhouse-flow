import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Pencil, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  LotStatusBadge,
  PRODUCT_TYPES,
  FLOWER_SIZES,
} from "./inventory";

type Lot = Tables<"inventory_lots">;
type Batch = Tables<"batches">;

const NONE = "__none__";

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
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
    if (data.batch_id) {
      const { data: b } = await supabase
        .from("batches")
        .select("*")
        .eq("id", data.batch_id)
        .maybeSingle();
      setBatch(b);
    } else {
      setBatch(null);
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
          <h1 className="text-2xl font-semibold">{lot.lot_number}</h1>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <LotStatusBadge status={lot.status} />
            <span>Créé le {new Date(lot.created_at).toLocaleDateString("fr-CA")}</span>
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
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="mr-1 h-4 w-4" /> Modifier
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
        </CardContent>
      </Card>

      {lot.batch_id && <PackagingBagsSection batchId={lot.batch_id} />}

      <EditLotDialog
        key={lot.id}
        lot={lot}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={load}
      />

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

function EditLotDialog({
  lot,
  open,
  onOpenChange,
  onSaved,
}: {
  lot: Lot;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [lotNumber, setLotNumber] = useState(lot.lot_number);
  const [batchId, setBatchId] = useState<string>(lot.batch_id ?? NONE);
  const [productType, setProductType] = useState<string>(lot.product_type ?? "");
  const [format, setFormat] = useState(lot.format ?? "");
  const [flowerSize, setFlowerSize] = useState<string>(lot.flower_size ?? NONE);
  const [quantity, setQuantity] = useState(lot.quantity_grams?.toString() ?? "");
  const [units, setUnits] = useState(lot.units?.toString() ?? "");
  const [location, setLocation] = useState(lot.location ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from("batches")
        .select("*")
        .order("created_at", { ascending: false });
      setBatches(data ?? []);
    })();
  }, [open]);

  const submit = async () => {
    if (!lotNumber.trim()) {
      toast.error("Le numéro de lot est obligatoire");
      return;
    }
    const q = Number(quantity);
    if (!quantity || Number.isNaN(q) || q <= 0) {
      toast.error("La quantité doit être supérieure à 0");
      return;
    }
    let u: number | null = null;
    if (units.trim()) {
      const n = Number(units);
      if (Number.isNaN(n) || n < 0) {
        toast.error("Nombre d'unités invalide");
        return;
      }
      u = n;
    }
    setSaving(true);
    const { error } = await supabase
      .from("inventory_lots")
      .update({
        lot_number: lotNumber.trim(),
        batch_id: batchId === NONE ? null : batchId,
        product_type: productType || null,
        format: format.trim() || null,
        flower_size: flowerSize === NONE ? null : flowerSize,
        quantity_grams: q,
        units: u,
        location: location.trim() || null,
      })
      .eq("id", lot.id);
    setSaving(false);
    if (error) {
      if (error.code === "23505") {
        toast.error("Ce numéro de lot existe déjà");
      } else {
        toast.error(error.message);
      }
      return;
    }
    toast.success("Lot mis à jour");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Modifier le lot</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Numéro de lot *</Label>
            <Input value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Batch liée</Label>
              <Select value={batchId} onValueChange={setBatchId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Aucune</SelectItem>
                  {batches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.batch_number}
                      {b.strain ? ` — ${b.strain}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Type de produit</Label>
              <Select value={productType} onValueChange={setProductType}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner" />
                </SelectTrigger>
                <SelectContent>
                  {PRODUCT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Format</Label>
              <Input value={format} onChange={(e) => setFormat(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Taille de fleur</Label>
              <Select value={flowerSize} onValueChange={setFlowerSize}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {FLOWER_SIZES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Quantité (g) *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Unités</Label>
              <Input
                type="number"
                min="0"
                value={units}
                onChange={(e) => setUnits(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Emplacement</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
