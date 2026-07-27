import { useEffect, useState } from "react";
import { Plus, Loader2, Trash2, Pencil, Lock } from "lucide-react";
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
import { useAuth } from "@/hooks/use-auth";
import { computeBalance } from "@/routes/_authenticated/stamps";

type Movement = Tables<"stamp_movements">;
type Reel = Tables<"excise_reels">;
type Lot = Tables<"inventory_lots">;

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
];

export function EventStampsSection({
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

  const [movements, setMovements] = useState<Movement[] | null>(null);
  const [reelMap, setReelMap] = useState<Record<string, Reel>>({});
  const [lotMap, setLotMap] = useState<Record<string, Lot>>({});
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Movement | null>(null);
  const [toDelete, setToDelete] = useState<Movement | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setError(null);
    const { data, error: err } = await supabase
      .from("stamp_movements")
      .select("*")
      .eq("event_id", eventId);
    if (err) {
      setError(err.message);
      return;
    }
    const rows = data ?? [];
    setMovements(rows);
    const reelIds = Array.from(new Set(rows.map((r) => r.reel_id).filter(Boolean)));
    const lotIds = Array.from(
      new Set(rows.map((r) => r.lot_id).filter((x): x is string => !!x)),
    );
    if (reelIds.length) {
      const { data: rs } = await supabase
        .from("excise_reels")
        .select("*")
        .in("id", reelIds);
      const m: Record<string, Reel> = {};
      (rs ?? []).forEach((r) => (m[r.id] = r));
      setReelMap(m);
    } else setReelMap({});
    if (lotIds.length) {
      const { data: ls } = await supabase
        .from("inventory_lots")
        .select("*")
        .in("id", lotIds);
      const m: Record<string, Lot> = {};
      (ls ?? []).forEach((l) => (m[l.id] = l));
      setLotMap(m);
    } else setLotMap({});
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

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
    load();
  };

  const typeBadge = (t: string | null) => {
    const v = MOVEMENT_TYPES.find((x) => x.value === t);
    if (!v)
      return <span className="text-muted-foreground">{t ?? "—"}</span>;
    return (
      <Badge variant="outline" className={v.className}>
        {v.label}
      </Badge>
    );
  };

  const sorted = (movements ?? []).slice().sort(
    (a, b) => new Date(b.moved_at).getTime() - new Date(a.moved_at).getTime(),
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Timbres d'accise</CardTitle>
        {!readOnly && (
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Ajouter un mouvement
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {locked && (
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            <Lock className="h-4 w-4" />
            Événement verrouillé — les mouvements de timbres ne peuvent plus
            être modifiés.
          </div>
        )}
        {error && <p className="text-destructive text-sm">{error}</p>}
        {!error && movements === null && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement...
          </div>
        )}
        {movements && movements.length === 0 && (
          <p className="text-sm italic text-muted-foreground">
            Aucun mouvement de timbres pour cet événement.
          </p>
        )}
        {sorted.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Rouleau</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Quantité</TableHead>
                  <TableHead>Lot lié</TableHead>
                  <TableHead>Commentaires</TableHead>
                  {!readOnly && (
                    <TableHead className="w-24 text-right">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((m) => {
                  const reel = reelMap[m.reel_id];
                  const lot = m.lot_id ? lotMap[m.lot_id] : null;
                  return (
                    <TableRow key={m.id}>
                      <TableCell>
                        {formatZonedDate(m.moved_at)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {reel ? (
                          <Link
                            to="/stamps/$id"
                            params={{ id: reel.id }}
                            className="hover:underline"
                          >
                            {reel.serial_number}
                          </Link>
                        ) : (
                          "—"
                        )}
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

      <StampDialog
        eventId={eventId}
        open={open}
        editing={null}
        onOpenChange={setOpen}
        onSaved={load}
      />
      <StampDialog
        eventId={eventId}
        open={!!editing}
        editing={editing}
        onOpenChange={(o) => !o && setEditing(null)}
        onSaved={load}
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

function StampDialog({
  eventId,
  open,
  editing,
  onOpenChange,
  onSaved,
}: {
  eventId: string;
  open: boolean;
  editing: Movement | null;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [reelId, setReelId] = useState<string>("");
  const [type, setType] = useState<string>("used");
  const [quantity, setQuantity] = useState("");
  const [lotId, setLotId] = useState<string>(NONE);
  const [comments, setComments] = useState("");
  const [movedAt, setMovedAt] = useState(todayInputValue());
  const [reels, setReels] = useState<Reel[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [reelMovements, setReelMovements] = useState<Movement[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setReelId(editing.reel_id);
      setType(editing.movement_type ?? "used");
      setQuantity(editing.quantity?.toString() ?? "");
      setLotId(editing.lot_id ?? NONE);
      setComments(editing.comments ?? "");
      setMovedAt(toDateInputValue(editing.moved_at));
    } else {
      setReelId("");
      setType("used");
      setQuantity("");
      setLotId(NONE);
      setComments("");
      setMovedAt(todayInputValue());
    }
    (async () => {
      const [{ data: rs }, { data: ls }] = await Promise.all([
        supabase
          .from("excise_reels")
          .select("*")
          .order("received_at", { ascending: false }),
        supabase
          .from("inventory_lots")
          .select("*")
          .order("created_at", { ascending: false }),
      ]);
      setReels(rs ?? []);
      setLots(ls ?? []);
    })();
  }, [open, editing]);

  // Load movements for the selected reel to compute available balance.
  useEffect(() => {
    if (!open || !reelId) {
      setReelMovements([]);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("stamp_movements")
        .select("*")
        .eq("reel_id", reelId);
      setReelMovements(data ?? []);
    })();
  }, [open, reelId]);

  const selectedReel = reels.find((r) => r.id === reelId) ?? null;
  const availableReels = reels.filter(
    (r) => r.status !== "depleted" || (editing && r.id === editing.reel_id),
  );

  const { balance } = selectedReel
    ? computeBalance(selectedReel, reelMovements)
    : { balance: 0 };

  // Baseline: add back this movement's effect if editing this same reel.
  const baseline = (() => {
    if (!selectedReel) return 0;
    if (editing && editing.reel_id === selectedReel.id) {
      const oldQ = editing.quantity ?? 0;
      if (
        editing.movement_type === "used" ||
        editing.movement_type === "destroyed"
      ) {
        return balance + oldQ;
      }
      if (editing.movement_type === "returned") {
        return balance - oldQ;
      }
    }
    return balance;
  })();

  const q = Number(quantity);
  const overBalance = !Number.isNaN(q) && q > 0 && q > baseline;

  const submit = async () => {
    if (!reelId) {
      toast.error("Sélectionne un rouleau");
      return;
    }
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
      event_id: eventId,
      movement_type: type,
      quantity: q,
      lot_id: lotId === NONE ? null : lotId,
      comments: comments.trim() || null,
      moved_at: dateInputToTimestamp(movedAt) ?? new Date().toISOString(),
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
            {editing ? "Modifier le mouvement" : "Nouveau mouvement de timbres"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Rouleau *</Label>
            <Select value={reelId} onValueChange={setReelId}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner un rouleau" />
              </SelectTrigger>
              <SelectContent>
                {availableReels.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.serial_number}
                    {r.province ? ` — ${r.province}` : ""}
                  </SelectItem>
                ))}
                {availableReels.length === 0 && (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    Aucun rouleau disponible
                  </div>
                )}
              </SelectContent>
            </Select>
            {selectedReel && (
              <p className="text-xs text-muted-foreground">
                Balance disponible :{" "}
                <span className="font-medium">{baseline}</span>
              </p>
            )}
          </div>
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
          <div className="grid gap-2">
            <Label>Date du mouvement</Label>
            <Input
              type="date"
              value={movedAt}
              onChange={(e) => setMovedAt(e.target.value)}
            />
          </div>
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
