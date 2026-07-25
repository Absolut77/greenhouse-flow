import { useEffect, useState } from "react";
import { Plus, Loader2, Trash2, Pencil, Lock } from "lucide-react";
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
import { useAuth } from "@/hooks/use-auth";

type EventItem = Tables<"event_items">;
type Lot = Tables<"inventory_lots">;

export function EventItemsSection({
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

  const [items, setItems] = useState<EventItem[] | null>(null);
  const [availableLots, setAvailableLots] = useState<Lot[]>([]);
  const [lotMap, setLotMap] = useState<Record<string, Lot>>({});
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EventItem | null>(null);
  const [toDelete, setToDelete] = useState<EventItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setError(null);
    const [{ data: iData, error: iErr }, { data: lData }] = await Promise.all([
      supabase.from("event_items").select("*").eq("event_id", eventId),
      supabase
        .from("inventory_lots")
        .select("*")
        .eq("status", "available")
        .neq("lot_kind", "retention")
        .order("created_at", { ascending: false }),
    ]);
    if (iErr) {
      setError(iErr.message);
      return;
    }
    const rows = iData ?? [];
    setItems(rows);
    setAvailableLots(lData ?? []);
    const m: Record<string, Lot> = {};
    (lData ?? []).forEach((l) => (m[l.id] = l));
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
        {!readOnly && (
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Ajouter un item
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {locked && (
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            <Lock className="h-4 w-4" />
            Événement verrouillé — les items ne peuvent plus être modifiés.
          </div>
        )}
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
                  {!readOnly && (
                    <TableHead className="w-24 text-right">Actions</TableHead>
                  )}
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
                      {!readOnly && (
                        <TableCell className="text-right">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setEditing(it)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setToDelete(it)}
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

      <ItemDialog
        eventId={eventId}
        availableLots={availableLots}
        lotMap={lotMap}
        open={open}
        editing={null}
        onOpenChange={setOpen}
        onSaved={load}
      />
      <ItemDialog
        eventId={eventId}
        availableLots={availableLots}
        lotMap={lotMap}
        open={!!editing}
        editing={editing}
        onOpenChange={(o) => !o && setEditing(null)}
        onSaved={load}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cet item ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le stock du lot lié sera réajusté automatiquement.
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
  availableLots,
  lotMap,
  open,
  editing,
  onOpenChange,
  onSaved,
}: {
  eventId: string;
  availableLots: Lot[];
  lotMap: Record<string, Lot>;
  open: boolean;
  editing: EventItem | null;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [lotId, setLotId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [units, setUnits] = useState("");
  const [direction, setDirection] = useState<string>("out");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setLotId(editing.inventory_lot_id ?? "");
      setQuantity(editing.quantity_grams?.toString() ?? "");
      setUnits(editing.units?.toString() ?? "");
      setDirection(editing.direction ?? "out");
    } else {
      setLotId("");
      setQuantity("");
      setUnits("");
      setDirection("out");
    }
  }, [open, editing]);

  // In edit mode, ensure the currently linked lot appears in the select even if
  // no longer available.
  const currentLot =
    (lotId && (availableLots.find((l) => l.id === lotId) || lotMap[lotId])) ||
    null;
  const lotChoices = (() => {
    if (editing && currentLot && !availableLots.some((l) => l.id === currentLot.id)) {
      return [currentLot, ...availableLots];
    }
    return availableLots;
  })();

  const selectedLot = currentLot;
  // For edit: baseline stock excludes the current row's effect, since DB trigger
  // reverses OLD then applies NEW.
  const baseG = (() => {
    if (!selectedLot) return 0;
    let g = selectedLot.quantity_grams ?? 0;
    if (editing && editing.inventory_lot_id === selectedLot.id) {
      if (editing.direction === "out") g += editing.quantity_grams ?? 0;
      else if (editing.direction === "in") g -= editing.quantity_grams ?? 0;
    }
    return g;
  })();
  const baseU = (() => {
    if (!selectedLot) return 0;
    let u = selectedLot.units ?? 0;
    if (editing && editing.inventory_lot_id === selectedLot.id) {
      if (editing.direction === "out") u += editing.units ?? 0;
      else if (editing.direction === "in") u -= editing.units ?? 0;
    }
    return u;
  })();

  const q = Number(quantity);
  const u = units.trim() ? Number(units) : 0;
  const overStock =
    direction === "out" &&
    selectedLot &&
    ((!Number.isNaN(q) && q > baseG) ||
      (units.trim() && !Number.isNaN(u) && u > baseU));

  const submit = async () => {
    if (!lotId) {
      toast.error("Sélectionne un lot");
      return;
    }
    if (!quantity || Number.isNaN(q) || q <= 0) {
      toast.error("La quantité doit être supérieure à 0");
      return;
    }
    let uVal: number | null = null;
    if (units.trim()) {
      if (Number.isNaN(u) || u < 0) {
        toast.error("Nombre d'unités invalide");
        return;
      }
      uVal = u;
    }
    if (direction === "out" && selectedLot) {
      if (q > baseG) {
        toast.error(`Stock insuffisant : disponible ${baseG}g, demandé ${q}g`);
        return;
      }
      if (uVal != null && uVal > baseU) {
        toast.error(
          `Unités insuffisantes : disponibles ${baseU}, demandées ${uVal}`,
        );
        return;
      }
    }
    setSaving(true);
    const payload = {
      event_id: eventId,
      inventory_lot_id: lotId,
      quantity_grams: q,
      units: uVal,
      direction,
    };
    const { error } = editing
      ? await supabase.from("event_items").update(payload).eq("id", editing.id)
      : await supabase.from("event_items").insert(payload);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(editing ? "Item mis à jour, stock ajusté" : "Item ajouté, stock ajusté");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Modifier l'item" : "Nouvel item"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Lot *</Label>
            <Select value={lotId} onValueChange={setLotId}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner un lot" />
              </SelectTrigger>
              <SelectContent>
                {lotChoices.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.lot_number}
                    {l.product_type ? ` — ${l.product_type}` : ""}
                    {l.quantity_grams != null ? ` (${l.quantity_grams}g` : ""}
                    {l.units != null ? `, ${l.units} sacs)` : l.quantity_grams != null ? ")" : ""}
                  </SelectItem>
                ))}
                {lotChoices.length === 0 && (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    Aucun lot disponible
                  </div>
                )}
              </SelectContent>
            </Select>
            {selectedLot && (
              <p className="text-xs text-muted-foreground">
                Stock disponible : {baseG}g
                {selectedLot.units != null ? ` — ${baseU} sac${baseU > 1 ? "s" : ""}` : ""}
              </p>
            )}
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
            <Label>Direction</Label>
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <span className="font-medium">Sortie (out)</span>
              <span className="ml-2 text-xs text-muted-foreground">
                Le stock est extrait temporairement jusqu'à la clôture de l'événement.
              </span>
            </div>
          </div>
          {overStock && (
            <p className="text-xs text-destructive">
              La quantité demandée dépasse le stock disponible.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={saving || !!overStock}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {editing ? "Enregistrer" : "Ajouter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
