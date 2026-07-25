import { useEffect, useState } from "react";
import { Plus, Loader2, Trash2 } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type EventItem = Tables<"event_items">;
type Lot = Tables<"inventory_lots">;

export function EventItemsSection({ eventId }: { eventId: string }) {
  const [items, setItems] = useState<EventItem[] | null>(null);
  const [lots, setLots] = useState<Lot[]>([]);
  const [lotMap, setLotMap] = useState<Record<string, Lot>>({});
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [toDelete, setToDelete] = useState<EventItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setError(null);
    const [{ data: iData, error: iErr }, { data: lData }] = await Promise.all([
      supabase
        .from("event_items")
        .select("*")
        .eq("event_id", eventId),
      supabase
        .from("inventory_lots")
        .select("*")
        .order("created_at", { ascending: false }),
    ]);
    if (iErr) {
      setError(iErr.message);
      return;
    }
    const rows = iData ?? [];
    setItems(rows);
    setLots(lData ?? []);
    const m: Record<string, Lot> = {};
    (lData ?? []).forEach((l) => (m[l.id] = l));
    // Also fetch lot info for referenced lots that might have been filtered out
    const missing = rows
      .map((r) => r.inventory_lot_id)
      .filter((id): id is string => !!id && !m[id]);
    if (missing.length > 0) {
      const { data: extra } = await supabase
        .from("inventory_lots")
        .select("*")
        .in("id", missing);
      (extra ?? []).forEach((l) => (m[l.id] = l));
    }
    setLotMap(m);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    const { error } = await supabase
      .from("event_items")
      .delete()
      .eq("id", toDelete.id);
    setDeleting(false);
    if (error) {
      toast.error(`Suppression impossible : ${error.message}`);
      return;
    }
    toast.success("Item supprimé, stock ajusté");
    setToDelete(null);
    load();
  };


  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Items</CardTitle>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Ajouter un item
        </Button>
      </CardHeader>
      <CardContent>
        {error && <p className="text-destructive text-sm">{error}</p>}
        {!error && items === null && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement...
          </div>
        )}
        {items && items.length === 0 && (
          <p className="text-sm italic text-muted-foreground">
            Aucun item pour cet événement.
          </p>
        )}
        {items && items.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lot</TableHead>
                  <TableHead>Quantité (g)</TableHead>
                  <TableHead>Unités</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead className="w-16 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => {
                  const lot = it.inventory_lot_id ? lotMap[it.inventory_lot_id] : null;
                  return (
                    <TableRow key={it.id}>
                      <TableCell className="font-medium">
                        {lot ? lot.lot_number : "—"}
                      </TableCell>
                      <TableCell>{it.quantity_grams ?? "—"}</TableCell>
                      <TableCell>{it.units ?? "—"}</TableCell>
                      <TableCell>
                        {it.direction === "in" && (
                          <Badge
                            variant="outline"
                            className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                          >
                            Entrée
                          </Badge>
                        )}
                        {it.direction === "out" && (
                          <Badge
                            variant="outline"
                            className="bg-amber-500/15 text-amber-400 border-amber-500/30"
                          >
                            Sortie
                          </Badge>
                        )}
                        {it.direction !== "in" && it.direction !== "out" && "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setToDelete(it)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <ItemDialog
        eventId={eventId}
        lots={lots}
        open={open}
        onOpenChange={setOpen}
        onSaved={load}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cet item ?</AlertDialogTitle>
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
    </Card>
  );
}

function ItemDialog({
  eventId,
  lots,
  open,
  onOpenChange,
  onSaved,
}: {
  eventId: string;
  lots: Lot[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [lotId, setLotId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [units, setUnits] = useState("");
  const [direction, setDirection] = useState<string>("out");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setLotId("");
      setQuantity("");
      setUnits("");
      setDirection("out");
    }
  }, [open]);

  const submit = async () => {
    if (!lotId) {
      toast.error("Sélectionne un lot");
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
    const { error } = await supabase.from("event_items").insert({
      event_id: eventId,
      inventory_lot_id: lotId,
      quantity_grams: q,
      units: u,
      direction,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Item ajouté");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nouvel item</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Lot *</Label>
            <Select value={lotId} onValueChange={setLotId}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner un lot" />
              </SelectTrigger>
              <SelectContent>
                {lots.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.lot_number}
                    {l.product_type ? ` — ${l.product_type}` : ""}
                    {l.quantity_grams != null ? ` (${l.quantity_grams}g)` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            <Label>Direction *</Label>
            <Select value={direction} onValueChange={setDirection}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="in">Entrée (in)</SelectItem>
                <SelectItem value="out">Sortie (out)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Ajouter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
