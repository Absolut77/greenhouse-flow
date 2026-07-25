import { useEffect, useState } from "react";
import { Plus, Loader2, Trash2, Lock } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/use-auth";

type Lot = Tables<"inventory_lots">;
type EventItem = Tables<"event_items">;
type Format = Tables<"packaging_formats">;

export function PackagedLotsSection({
  eventId,
  eventStatus,
}: {
  eventId: string;
  eventStatus?: string | null;
}) {
  const { roles } = useAuth();
  const isViewerOnly = roles.length > 0 && roles.every((r) => r === "viewer");
  const locked = eventStatus === "completed" || eventStatus === "cancelled";
  const readOnly = isViewerOnly || locked;

  const [sourceItems, setSourceItems] = useState<EventItem[]>([]);
  const [sourceLots, setSourceLots] = useState<Record<string, Lot>>({});
  const [packagedLots, setPackagedLots] = useState<Lot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Lot | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setError(null);
    const { data: items, error: e1 } = await supabase
      .from("event_items")
      .select("*")
      .eq("event_id", eventId)
      .eq("direction", "out");
    if (e1) {
      setError(e1.message);
      return;
    }
    const outs = items ?? [];
    setSourceItems(outs);
    const lotIds = Array.from(
      new Set(outs.map((i) => i.inventory_lot_id).filter((x): x is string => !!x)),
    );
    if (lotIds.length) {
      const { data: ls } = await supabase
        .from("inventory_lots")
        .select("*")
        .in("id", lotIds);
      const m: Record<string, Lot> = {};
      (ls ?? []).forEach((l) => (m[l.id] = l));
      setSourceLots(m);
      const { data: children } = await supabase
        .from("inventory_lots")
        .select("*")
        .in("parent_lot_id", lotIds)
        .order("created_at", { ascending: false });
      setPackagedLots(children ?? []);
    } else {
      setSourceLots({});
      setPackagedLots([]);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    const { error } = await supabase.rpc("delete_packaged_lot", {
      _lot_id: toDelete.id,
    });
    setDeleting(false);
    if (error) {
      toast.error(`Suppression bloquée : ${error.message}`);
      return;
    }
    toast.success(
      `Lot fini supprimé — ${toDelete.quantity_grams ?? 0} g restitué(s) au lot source`,
    );
    setToDelete(null);
    load();
  };


  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Lots finis</CardTitle>
        {!readOnly && (
          <Button
            size="sm"
            onClick={() => setOpen(true)}
            disabled={sourceItems.length === 0}
          >
            <Plus className="mr-1 h-4 w-4" /> Créer un lot fini
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {locked && (
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            <Lock className="h-4 w-4" />
            Événement verrouillé — les lots finis ne peuvent plus être créés
            ou supprimés.
          </div>
        )}
        {!locked && sourceItems.length === 0 && (
          <p className="text-sm italic text-muted-foreground">
            Ajoute d'abord un item bulk en sortie (direction « Sortie ») pour
            créer un lot fini.
          </p>
        )}
        {error && <p className="text-destructive text-sm">{error}</p>}
        {!error && packagedLots === null && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement...
          </div>
        )}
        {packagedLots && packagedLots.length === 0 && sourceItems.length > 0 && (
          <p className="text-sm italic text-muted-foreground">
            Aucun lot fini créé pour cet événement.
          </p>
        )}
        {packagedLots && packagedLots.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lot fini</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead className="text-right">Poids (g)</TableHead>
                  <TableHead className="text-right">Unités</TableHead>
                  <TableHead>Créé le</TableHead>
                  {!readOnly && (
                    <TableHead className="w-16 text-right">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {packagedLots.map((l) => {
                  const source = l.parent_lot_id
                    ? sourceLots[l.parent_lot_id]
                    : null;
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">
                        <Link
                          to="/inventory/$id"
                          params={{ id: l.id }}
                          className="hover:underline"
                        >
                          {l.lot_number}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {source ? source.lot_number : "—"}
                      </TableCell>
                      <TableCell>{l.format ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        {l.quantity_grams ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {l.units ?? "—"}
                      </TableCell>
                      <TableCell>
                        {new Date(l.created_at).toLocaleDateString("fr-CA")}
                      </TableCell>
                      {!readOnly && (
                        <TableCell className="text-right">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setToDelete(l)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <PackagedLotDialog
        eventId={eventId}
        open={open}
        onOpenChange={setOpen}
        sourceItems={sourceItems}
        sourceLots={sourceLots}
        packagedLots={packagedLots ?? []}
        onSaved={load}
      />

      <AlertDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce lot fini ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le lot d'inventaire sera supprimé. Le stock du lot source n'est
              pas restitué automatiquement — ajuste l'item bulk si nécessaire.
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
    </Card>
  );
}

function PackagedLotDialog({
  eventId,
  open,
  onOpenChange,
  sourceItems,
  sourceLots,
  packagedLots,
  onSaved,
}: {
  eventId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sourceItems: EventItem[];
  sourceLots: Record<string, Lot>;
  packagedLots: Lot[];
  onSaved: () => void;
}) {
  const [formats, setFormats] = useState<Format[]>([]);
  const [sourceItemId, setSourceItemId] = useState<string>("");
  const [formatId, setFormatId] = useState<string>("");
  const [quantity, setQuantity] = useState("");
  const [units, setUnits] = useState("");
  const [lotNumber, setLotNumber] = useState("");
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSourceItemId("");
    setFormatId("");
    setQuantity("");
    setUnits("");
    setLotNumber("");
    setLocation("");
    (async () => {
      const { data } = await supabase
        .from("packaging_formats")
        .select("*")
        .eq("is_active", true)
        .order("name");
      setFormats(data ?? []);
    })();
  }, [open]);

  const selectedItem = sourceItems.find((i) => i.id === sourceItemId) ?? null;
  const selectedSourceLot =
    selectedItem && selectedItem.inventory_lot_id
      ? sourceLots[selectedItem.inventory_lot_id] ?? null
      : null;
  const selectedFormat = formats.find((f) => f.id === formatId) ?? null;

  // Total bulk out from this source in this event
  const totalOutForSource = selectedSourceLot
    ? sourceItems
        .filter((i) => i.inventory_lot_id === selectedSourceLot.id)
        .reduce((s, i) => s + (i.quantity_grams ?? 0), 0)
    : 0;
  const alreadyPackaged = selectedSourceLot
    ? packagedLots
        .filter((l) => l.parent_lot_id === selectedSourceLot.id)
        .reduce((s, l) => s + (l.quantity_grams ?? 0), 0)
    : 0;
  const remaining = totalOutForSource - alreadyPackaged;

  // Auto-suggest lot number
  useEffect(() => {
    if (!open || lotNumber) return;
    if (selectedSourceLot && selectedFormat) {
      const suffix = selectedFormat.name.replace(/\s+/g, "");
      const seq = String(
        packagedLots.filter((l) => l.parent_lot_id === selectedSourceLot.id)
          .length + 1,
      ).padStart(2, "0");
      setLotNumber(`${selectedSourceLot.lot_number}-${suffix}-${seq}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSourceLot?.id, selectedFormat?.id]);

  // Auto-fill units from quantity/format weight
  useEffect(() => {
    if (!selectedFormat?.net_weight_grams) return;
    const q = Number(quantity);
    if (!Number.isFinite(q) || q <= 0) return;
    if (units) return;
    const u = Math.floor(q / selectedFormat.net_weight_grams);
    if (u > 0) setUnits(String(u));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quantity, selectedFormat?.id]);

  const q = Number(quantity);
  const overRemaining =
    !Number.isNaN(q) && q > 0 && selectedSourceLot && q > remaining;

  const submit = async () => {
    if (!selectedItem || !selectedSourceLot) {
      toast.error("Sélectionne un lot source");
      return;
    }
    if (!selectedFormat) {
      toast.error("Sélectionne un format");
      return;
    }
    if (!quantity || Number.isNaN(q) || q <= 0) {
      toast.error("La quantité doit être supérieure à 0");
      return;
    }
    if (overRemaining) {
      toast.error(
        `Quantité insuffisante : disponible ${remaining} g, demandé ${q} g`,
      );
      return;
    }
    if (!lotNumber.trim()) {
      toast.error("Le numéro de lot est obligatoire");
      return;
    }
    const u = units ? Number(units) : null;
    if (u !== null && (Number.isNaN(u) || u < 0)) {
      toast.error("Nombre d'unités invalide");
      return;
    }
    setSaving(true);
    const payload = {
      lot_number: lotNumber.trim(),
      batch_id: selectedSourceLot.batch_id,
      parent_lot_id: selectedSourceLot.id,
      product_type: selectedSourceLot.product_type,
      flower_size: selectedSourceLot.flower_size,
      format: selectedFormat.name,
      quantity_grams: q,
      units: u,
      location: location.trim() || null,
      status: "available",
    };
    const { error } = await supabase.from("inventory_lots").insert(payload);
    setSaving(false);
    if (error) {
      if (error.code === "23505") {
        toast.error("Ce numéro de lot existe déjà");
      } else {
        toast.error(error.message);
      }
      return;
    }
    toast.success("Lot fini créé");
    onOpenChange(false);
    onSaved();
    // Silence unused var warning
    void eventId;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Créer un lot fini</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Lot source (bulk) *</Label>
            <Select value={sourceItemId} onValueChange={setSourceItemId}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner un item de sortie" />
              </SelectTrigger>
              <SelectContent>
                {sourceItems.map((i) => {
                  const l = i.inventory_lot_id
                    ? sourceLots[i.inventory_lot_id]
                    : null;
                  return (
                    <SelectItem key={i.id} value={i.id}>
                      {l ? l.lot_number : "Lot inconnu"} —{" "}
                      {i.quantity_grams ?? 0} g
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {selectedSourceLot && (
              <p className="text-xs text-muted-foreground">
                Sorti : <span className="font-medium">{totalOutForSource} g</span>{" "}
                • Déjà packagé :{" "}
                <span className="font-medium">{alreadyPackaged} g</span> •
                Restant :{" "}
                <span className="font-medium">{remaining} g</span>
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <Label>Format *</Label>
            <Select value={formatId} onValueChange={setFormatId}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner un format" />
              </SelectTrigger>
              <SelectContent>
                {formats.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                    {f.net_weight_grams ? ` (${f.net_weight_grams} g)` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Quantité totale (g) *</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
              {overRemaining && (
                <p className="text-xs text-destructive">
                  Dépasse le restant ({remaining} g)
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label>Unités / master cases</Label>
              <Input
                type="number"
                min="0"
                step="1"
                value={units}
                onChange={(e) => setUnits(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Numéro de lot fini *</Label>
            <Input
              value={lotNumber}
              onChange={(e) => setLotNumber(e.target.value)}
              placeholder="Généré automatiquement"
            />
          </div>
          <div className="grid gap-2">
            <Label>Emplacement</Label>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            onClick={submit}
            disabled={saving || !!overRemaining}
          >
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Créer le lot
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
