import { useEffect, useState } from "react";
import { Plus, Loader2, Pencil, Trash2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type Weight = Tables<"weights">;

const STAGES = [
  { value: "pre_curing", label: "Pre-curing" },
  { value: "bulk", label: "Bulk" },
];

const CATEGORIES = [
  { value: "flower_big_hand_trim", label: "Flower Big Hand Trim" },
  { value: "flower_big", label: "Flower Big" },
  { value: "flower_medium", label: "Flower Medium" },
  { value: "flower_small", label: "Flower Small" },
  { value: "trim", label: "Trim" },
];

const labelOf = (arr: { value: string; label: string }[], v: string | null) =>
  arr.find((x) => x.value === v)?.label ?? v ?? "—";

export function WeightsSection({ batchId }: { batchId: string }) {
  const [weights, setWeights] = useState<Weight[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Weight | null>(null);
  const [toDelete, setToDelete] = useState<Weight | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setError(null);
    const { data, error } = await supabase
      .from("weights")
      .select("*")
      .eq("batch_id", batchId)
      .order("recorded_at", { ascending: false });
    if (error) setError(error.message);
    else setWeights(data ?? []);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    const { error } = await supabase
      .from("weights")
      .delete()
      .eq("id", toDelete.id);
    setDeleting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Pesée supprimée");
    setToDelete(null);
    load();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Pesées</CardTitle>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="mr-1 h-4 w-4" /> Ajouter une pesée
        </Button>
      </CardHeader>
      <CardContent>
        {error && <p className="text-destructive text-sm">{error}</p>}
        {!error && weights === null && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement...
          </div>
        )}
        {weights && weights.length === 0 && (
          <p className="text-sm italic text-muted-foreground">
            Aucune pesée enregistrée.
          </p>
        )}
        {weights && weights.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Étape</TableHead>
                  <TableHead>Catégorie</TableHead>
                  <TableHead>Poids (g)</TableHead>
                  <TableHead>Conteneurs</TableHead>
                  <TableHead>Commentaires</TableHead>
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {weights.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell>
                      {new Date(w.recorded_at).toLocaleDateString("fr-CA")}
                    </TableCell>
                    <TableCell>{labelOf(STAGES, w.stage)}</TableCell>
                    <TableCell>{labelOf(CATEGORIES, w.category)}</TableCell>
                    <TableCell className="font-medium">
                      {w.weight_grams ?? "—"}
                    </TableCell>
                    <TableCell>{w.container_count ?? "—"}</TableCell>
                    <TableCell className="max-w-xs truncate">
                      {w.comments ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setEditing(w);
                            setOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setToDelete(w)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <WeightDialog
        key={editing?.id ?? "new"}
        batchId={batchId}
        weight={editing}
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setEditing(null);
        }}
        onSaved={load}
      />

      <AlertDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette pesée ?</AlertDialogTitle>
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

function WeightDialog({
  batchId,
  weight,
  open,
  onOpenChange,
  onSaved,
}: {
  batchId: string;
  weight: Weight | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [recordedAt, setRecordedAt] = useState(
    weight?.recorded_at ? weight.recorded_at.slice(0, 10) : today,
  );
  const [stage, setStage] = useState(weight?.stage ?? "");
  const [category, setCategory] = useState(weight?.category ?? "");
  const [weightGrams, setWeightGrams] = useState(
    weight?.weight_grams?.toString() ?? "",
  );
  const [containerCount, setContainerCount] = useState(
    weight?.container_count?.toString() ?? "",
  );
  const [comments, setComments] = useState(weight?.comments ?? "");
  const [saving, setSaving] = useState(false);

  const isEdit = !!weight;

  const submit = async () => {
    if (!recordedAt) {
      toast.error("La date est obligatoire");
      return;
    }
    if (!stage) {
      toast.error("L'étape est obligatoire");
      return;
    }
    if (!category) {
      toast.error("La catégorie est obligatoire");
      return;
    }
    const w = Number(weightGrams);
    if (!weightGrams || Number.isNaN(w) || w <= 0) {
      toast.error("Le poids doit être supérieur à 0");
      return;
    }
    let cc: number | null = null;
    if (containerCount.trim()) {
      const n = Number(containerCount);
      if (Number.isNaN(n) || n < 0) {
        toast.error("Nombre de conteneurs invalide");
        return;
      }
      cc = n;
    }
    setSaving(true);
    const payload = {
      recorded_at: new Date(recordedAt).toISOString(),
      stage,
      category,
      weight_grams: w,
      container_count: cc,
      comments: comments.trim() || null,
    };
    let error;
    if (isEdit && weight) {
      ({ error } = await supabase
        .from("weights")
        .update(payload)
        .eq("id", weight.id));
    } else {
      ({ error } = await supabase
        .from("weights")
        .insert({ ...payload, batch_id: batchId }));
    }
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(isEdit ? "Pesée mise à jour" : "Pesée ajoutée");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Modifier la pesée" : "Nouvelle pesée"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Date *</Label>
              <Input
                type="date"
                value={recordedAt}
                onChange={(e) => setRecordedAt(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Étape *</Label>
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner" />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Catégorie *</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Poids (g) *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={weightGrams}
                onChange={(e) => setWeightGrams(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Nombre de conteneurs</Label>
              <Input
                type="number"
                min="0"
                value={containerCount}
                onChange={(e) => setContainerCount(e.target.value)}
              />
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
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {isEdit ? "Enregistrer" : "Créer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
