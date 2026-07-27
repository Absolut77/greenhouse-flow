import { useEffect, useState } from "react";
import { Plus, Loader2, Trash2, Pencil } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { formatZonedDate, toDateInputValue, todayInputValue, dateInputToTimestamp } from "@/lib/dates";
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
import { Textarea } from "@/components/ui/textarea";
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

type Movement = Tables<"stamp_movements">;
type Lot = Tables<"inventory_lots">;
type EventRow = Tables<"events">;

const NONE = "__none__";

const MOVEMENT_TYPES = [
  {
    value: "used",
    label: "Utilisé",
    className: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  },
  {
    value: "destroyed",
    label: "Détruit",
    className: "bg-red-500/15 text-red-400 border-red-500/30",
  },
  {
    value: "returned",
    label: "Retourné",
    className: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  },
];

export function StampMovementsSection({
  reelId,
  balance,
  movements,
  onChanged,
  readOnly,
}: {
  reelId: string;
  balance: number;
  movements: Movement[];
  onChanged: () => void;
  readOnly?: boolean;
}) {
  const [lotMap, setLotMap] = useState<Record<string, Lot>>({});
  const [eventMap, setEventMap] = useState<Record<string, EventRow>>({});
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Movement | null>(null);
  const [toDelete, setToDelete] = useState<Movement | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    (async () => {
      const lotIds = Array.from(
        new Set(movements.map((m) => m.lot_id).filter((x): x is string => !!x)),
      );
      const evIds = Array.from(
        new Set(movements.map((m) => m.event_id).filter((x): x is string => !!x)),
      );
      if (lotIds.length) {
        const { data } = await supabase
          .from("inventory_lots")
          .select("*")
          .in("id", lotIds);
        const m: Record<string, Lot> = {};
        (data ?? []).forEach((l) => (m[l.id] = l));
        setLotMap(m);
      } else setLotMap({});
      if (evIds.length) {
        const { data } = await supabase
          .from("events")
          .select("*")
          .in("id", evIds);
        const m: Record<string, EventRow> = {};
        (data ?? []).forEach((e) => (m[e.id] = e));
        setEventMap(m);
      } else setEventMap({});
    })();
  }, [movements]);

  const sorted = [...movements].sort(
    (a, b) => new Date(b.moved_at).getTime() - new Date(a.moved_at).getTime(),
  );

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    const { error } = await supabase
      .from("stamp_movements")
      .delete()
      .eq("id", toDelete.id);
    setDeleting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Mouvement supprimé");
    setToDelete(null);
    onChanged();
  };

  const typeBadge = (t: string | null) => {
    const v = MOVEMENT_TYPES.find((x) => x.value === t);
    if (!v) return <span className="text-muted-foreground">{t ?? "—"}</span>;
    return (
      <Badge variant="outline" className={v.className}>
        {v.label}
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Mouvements</CardTitle>
        {!readOnly && (
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Ajouter un mouvement
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {sorted.length === 0 && (
          <p className="text-sm italic text-muted-foreground">
            Aucun mouvement pour ce rouleau.
          </p>
        )}
        {sorted.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Quantité</TableHead>
                  <TableHead>Lot lié</TableHead>
                  <TableHead>Événement</TableHead>
                  <TableHead>Commentaires</TableHead>
                  {!readOnly && (
                    <TableHead className="w-24 text-right">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((m) => {
                  const lot = m.lot_id ? lotMap[m.lot_id] : null;
                  const ev = m.event_id ? eventMap[m.event_id] : null;
                  return (
                    <TableRow key={m.id}>
                      <TableCell>
                        {formatZonedDate(m.moved_at)}
                      </TableCell>
                      <TableCell>{typeBadge(m.movement_type)}</TableCell>
                      <TableCell className="text-right font-medium">
                        {m.quantity ?? "—"}
                      </TableCell>
                      <TableCell>
                        {lot ? (
                          <Link
                            to="/inventory/$id"
                            params={{ id: lot.id }}
                            className="hover:underline text-muted-foreground"
                          >
                            {lot.lot_number}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        {ev ? (
                          <Link
                            to="/events/$id"
                            params={{ id: ev.id }}
                            className="hover:underline text-muted-foreground"
                          >
                            {ev.event_number}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="max-w-xs truncate">
                        {m.comments ?? "—"}
                      </TableCell>
                      {!readOnly && (
                        <TableCell className="text-right">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setEditing(m)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setToDelete(m)}
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

      <MovementDialog
        reelId={reelId}
        balance={balance}
        open={open}
        editing={null}
        onOpenChange={setOpen}
        onSaved={onChanged}
      />
      <MovementDialog
        reelId={reelId}
        balance={balance}
        open={!!editing}
        editing={editing}
        onOpenChange={(o) => !o && setEditing(null)}
        onSaved={onChanged}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce mouvement ?</AlertDialogTitle>
            <AlertDialogDescription>
              La balance du rouleau sera automatiquement recalculée.
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

function MovementDialog({
  reelId,
  balance,
  open,
  editing,
  onOpenChange,
  onSaved,
}: {
  reelId: string;
  balance: number;
  open: boolean;
  editing: Movement | null;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<string>("used");
  const [quantity, setQuantity] = useState("");
  const [lotId, setLotId] = useState<string>(NONE);
  const [eventId, setEventId] = useState<string>(NONE);
  const [comments, setComments] = useState("");
  const [lots, setLots] = useState<Lot[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setType(editing.movement_type ?? "used");
      setQuantity(editing.quantity?.toString() ?? "");
      setLotId(editing.lot_id ?? NONE);
      setEventId(editing.event_id ?? NONE);
      setComments(editing.comments ?? "");
    } else {
      setType("used");
      setQuantity("");
      setLotId(NONE);
      setEventId(NONE);
      setComments("");
    }
    (async () => {
      const [{ data: ls }, { data: es }] = await Promise.all([
        supabase
          .from("inventory_lots")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase
          .from("events")
          .select("*")
          .order("created_at", { ascending: false }),
      ]);
      setLots(ls ?? []);
      setEvents(es ?? []);
    })();
  }, [open, editing]);

  const q = Number(quantity);
  const consumes = type === "used" || type === "destroyed";
  // Baseline balance for edit: add back this row's previous effect on balance.
  const baseline = (() => {
    if (!editing) return balance;
    const oldQ = editing.quantity ?? 0;
    if (editing.movement_type === "used" || editing.movement_type === "destroyed") {
      return balance + oldQ;
    }
    if (editing.movement_type === "returned") {
      return balance - oldQ;
    }
    return balance;
  })();
  const overBalance =
    consumes && !Number.isNaN(q) && q > 0 && q > baseline;

  const submit = async () => {
    if (!type) {
      toast.error("Sélectionne un type");
      return;
    }
    if (!quantity || Number.isNaN(q) || q <= 0) {
      toast.error("La quantité doit être supérieure à 0");
      return;
    }
    if (overBalance) {
      toast.error(
        `Balance insuffisante : disponible ${baseline}, demandé ${q}`,
      );
      return;
    }
    setSaving(true);
    const payload = {
      reel_id: reelId,
      movement_type: type,
      quantity: q,
      lot_id: lotId === NONE ? null : lotId,
      event_id: eventId === NONE ? null : eventId,
      comments: comments.trim() || null,
    };
    const { error } = editing
      ? await supabase
          .from("stamp_movements")
          .update(payload)
          .eq("id", editing.id)
      : await supabase.from("stamp_movements").insert(payload);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(editing ? "Mouvement mis à jour" : "Mouvement ajouté");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Modifier le mouvement" : "Nouveau mouvement"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <p className="text-xs text-muted-foreground">
            Balance disponible :{" "}
            <span className="font-medium">{baseline}</span>
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Type *</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MOVEMENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Quantité *</Label>
              <Input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Lot lié</Label>
              <Select value={lotId} onValueChange={setLotId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Aucun</SelectItem>
                  {lots.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.lot_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Événement lié</Label>
              <Select value={eventId} onValueChange={setEventId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Aucun</SelectItem>
                  {events.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.event_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Commentaires</Label>
            <Textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              rows={3}
            />
          </div>
          {overBalance && (
            <p className="text-xs text-destructive">
              La quantité demandée dépasse la balance disponible.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={saving || overBalance}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {editing ? "Enregistrer" : "Ajouter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
