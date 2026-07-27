import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Pencil, Trash2 } from "lucide-react";

import { formatDateOnly } from "@/lib/dates";
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
import { useAuth } from "@/hooks/use-auth";
import {
  PROVINCES,
  ReelStatusBadge,
  computeBalance,
} from "./stamps";
import { StampMovementsSection } from "@/components/stamps/movements-section";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";


type Reel = Tables<"excise_reels">;
type Movement = Tables<"stamp_movements">;

export const Route = createFileRoute("/_authenticated/stamps_/$id")({
  head: () => ({ meta: [{ title: "Rouleau — ONO Cannabis" }] }),
  component: ReelDetailPage,
});

function ReelDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { roles } = useAuth();
  const isViewerOnly = roles.length > 0 && roles.every((r) => r === "viewer");
  const [reel, setReel] = useState<Reel | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setError(null);
    const { data, error } = await supabase
      .from("excise_reels")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      setError(error.message);
      return;
    }
    if (!data) {
      setError("Rouleau introuvable");
      return;
    }
    setReel(data);
  };

  const loadMovements = async () => {
    const { data } = await supabase
      .from("stamp_movements")
      .select("*")
      .eq("reel_id", id);
    setMovements(data ?? []);
  };

  useEffect(() => {
    load();
    loadMovements();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const changeStatus = async (next: string) => {
    if (!reel) return;
    setUpdating(true);
    const { data, error } = await supabase
      .from("excise_reels")
      .update({ status: next })
      .eq("id", reel.id)
      .select()
      .single();
    setUpdating(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setReel(data);
    toast.success("Statut mis à jour");
  };

  const doDelete = async () => {
    if (!reel) return;
    setDeleting(true);
    const { error } = await supabase
      .from("excise_reels")
      .delete()
      .eq("id", reel.id);
    setDeleting(false);
    if (error) {
      if (
        error.code === "23001" ||
        /mouvements de timbres/i.test(error.message)
      ) {
        toast.error(
          "Impossible de supprimer ce rouleau car il contient des mouvements de timbres.",
        );
      } else {
        toast.error(error.message);
      }
      loadMovements();
      setConfirmDelete(false);
      return;
    }
    toast.success("Rouleau supprimé");
    navigate({ to: "/stamps" });
  };


  if (error) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/stamps">
            <ArrowLeft className="mr-1 h-4 w-4" /> Retour
          </Link>
        </Button>
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  if (!reel) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement...
      </div>
    );
  }

  const { used, destroyed, returned, balance } = computeBalance(reel, movements);

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/stamps">
            <ArrowLeft className="mr-1 h-4 w-4" /> Retour aux rouleaux
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{reel.serial_number}</h1>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <ReelStatusBadge status={reel.status} />
            <span>{reel.province ?? "—"}</span>
            {reel.received_at && (
              <span>
                Reçu le {formatDateOnly(reel.received_at)}
              </span>
            )}
          </div>
        </div>
        {!isViewerOnly && (
          <div className="flex items-center gap-2">
            <Select
              value={reel.status ?? ""}
              onValueChange={changeStatus}
              disabled={updating}
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="available">Disponible</SelectItem>
                <SelectItem value="depleted">Épuisé</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="mr-1 h-4 w-4" /> Modifier
            </Button>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmDelete(true)}
                      disabled={movements.length > 0}
                    >
                      <Trash2 className="mr-1 h-4 w-4 text-destructive" />{" "}
                      Supprimer
                    </Button>
                  </span>
                </TooltipTrigger>
                {movements.length > 0 && (
                  <TooltipContent>
                    Impossible : ce rouleau contient {movements.length} mouvement
                    {movements.length > 1 ? "s" : ""} de timbres.
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>

          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Informations</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Info label="Province">{reel.province ?? "—"}</Info>
          <Info label="Box ID">{reel.box_id ?? "—"}</Info>
          <Info label="Reçu le">
            {formatDateOnly(reel.received_at)}
          </Info>
          <Info label="Quantité originale">{reel.original_quantity ?? "—"}</Info>
          <Info label="Spoiled à la réception">
            {reel.spoiled_at_reception ?? 0}
          </Info>
          <Info label="Utilisés">{used}</Info>
          <Info label="Détruits">{destroyed}</Info>
          <Info label="Retournés">{returned}</Info>
          <Info label="Balance restante">
            <span className="text-lg font-semibold">{balance}</span>
          </Info>
        </CardContent>
      </Card>

      <StampMovementsSection
        reelId={reel.id}
        balance={balance}
        movements={movements}
        onChanged={loadMovements}
        readOnly={isViewerOnly}
      />

      <EditReelDialog
        key={reel.id}
        reel={reel}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={load}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce rouleau ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est définitive. Elle n'est possible que si le
              rouleau ne contient aucun mouvement de timbres.
            </AlertDialogDescription>

          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Info({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-sm">{children}</p>
    </div>
  );
}

function EditReelDialog({
  reel,
  open,
  onOpenChange,
  onSaved,
}: {
  reel: Reel;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [serial, setSerial] = useState(reel.serial_number);
  const [province, setProvince] = useState<string>(reel.province ?? "SQDC");
  const [boxId, setBoxId] = useState(reel.box_id ?? "");
  const [original, setOriginal] = useState(String(reel.original_quantity ?? ""));
  const [spoiled, setSpoiled] = useState(String(reel.spoiled_at_reception ?? 0));
  const [receivedAt, setReceivedAt] = useState(reel.received_at ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!serial.trim()) {
      toast.error("Le numéro de série est obligatoire");
      return;
    }
    const o = Number(original);
    if (!original || Number.isNaN(o) || o <= 0) {
      toast.error("Quantité originale invalide");
      return;
    }
    const s = Number(spoiled);
    if (Number.isNaN(s) || s < 0) {
      toast.error("Spoiled invalide");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("excise_reels")
      .update({
        serial_number: serial.trim(),
        province,
        box_id: boxId.trim() || null,
        original_quantity: o,
        spoiled_at_reception: s,
        received_at: receivedAt || null,
      })
      .eq("id", reel.id);
    setSaving(false);
    if (error) {
      if (error.code === "23505") {
        toast.error("Ce numéro de série existe déjà");
      } else {
        toast.error(error.message);
      }
      return;
    }
    toast.success("Rouleau mis à jour");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Modifier le rouleau</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Numéro de série *</Label>
            <Input value={serial} onChange={(e) => setSerial(e.target.value)} />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Province</Label>
              <Select value={province} onValueChange={setProvince}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVINCES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Box ID</Label>
              <Input value={boxId} onChange={(e) => setBoxId(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Quantité originale *</Label>
              <Input
                type="number"
                min="1"
                value={original}
                onChange={(e) => setOriginal(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Spoiled à la réception</Label>
              <Input
                type="number"
                min="0"
                value={spoiled}
                onChange={(e) => setSpoiled(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Date de réception</Label>
            <Input
              type="date"
              value={receivedAt}
              onChange={(e) => setReceivedAt(e.target.value)}
            />
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
