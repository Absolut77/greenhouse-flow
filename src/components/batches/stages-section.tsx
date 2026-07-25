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

type Stage = Tables<"batch_stages">;

const STAGE_TYPES = [
  { value: "drying", label: "Séchage" },
  { value: "debudding", label: "Effeuillage" },
  { value: "sanitation", label: "Sanitation" },
  { value: "mobius", label: "Mobius" },
  { value: "weighing", label: "Pesée" },
  { value: "curing", label: "Curing" },
  { value: "bulk_packaging", label: "Emballage vrac" },
];

const stageLabel = (t: string) =>
  STAGE_TYPES.find((s) => s.value === t)?.label ?? t;

const toLocalInput = (iso: string | null) =>
  iso ? new Date(iso).toISOString().slice(0, 16) : "";

export function StagesSection({ batchId }: { batchId: string }) {
  const [stages, setStages] = useState<Stage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Stage | null>(null);
  const [toDelete, setToDelete] = useState<Stage | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setError(null);
    const { data, error } = await supabase
      .from("batch_stages")
      .select("*")
      .eq("batch_id", batchId)
      .order("started_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setStages(data ?? []);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    const { error } = await supabase
      .from("batch_stages")
      .delete()
      .eq("id", toDelete.id);
    setDeleting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Étape supprimée");
    setToDelete(null);
    load();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Étapes</CardTitle>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="mr-1 h-4 w-4" /> Ajouter une étape
        </Button>
      </CardHeader>
      <CardContent>
        {error && <p className="text-destructive text-sm">{error}</p>}
        {!error && stages === null && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement...
          </div>
        )}
        {stages && stages.length === 0 && (
          <p className="text-sm italic text-muted-foreground">
            Aucune étape enregistrée.
          </p>
        )}
        {stages && stages.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Début</TableHead>
                <TableHead>Fin</TableHead>
                <TableHead>Opérateurs</TableHead>
                <TableHead>Durée (min)</TableHead>
                <TableHead>Commentaires</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stages.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">
                    {stageLabel(s.stage_type)}
                  </TableCell>
                  <TableCell>
                    {s.started_at
                      ? new Date(s.started_at).toLocaleString("fr-CA")
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {s.ended_at
                      ? new Date(s.ended_at).toLocaleString("fr-CA")
                      : "—"}
                  </TableCell>
                  <TableCell>{s.operators_count ?? "—"}</TableCell>
                  <TableCell>{s.duration_minutes ?? "—"}</TableCell>
                  <TableCell className="max-w-xs truncate">
                    {s.comments ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setEditing(s);
                          setOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setToDelete(s)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <StageDialog
        key={editing?.id ?? "new"}
        batchId={batchId}
        stage={editing}
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
            <AlertDialogTitle>Supprimer cette étape ?</AlertDialogTitle>
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

function StageDialog({
  batchId,
  stage,
  open,
  onOpenChange,
  onSaved,
}: {
  batchId: string;
  stage: Stage | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [stageType, setStageType] = useState(stage?.stage_type ?? "drying");
  const [startedAt, setStartedAt] = useState(toLocalInput(stage?.started_at ?? null));
  const [endedAt, setEndedAt] = useState(toLocalInput(stage?.ended_at ?? null));
  const [operators, setOperators] = useState(
    stage?.operators_count?.toString() ?? "",
  );
  const [duration, setDuration] = useState(
    stage?.duration_minutes?.toString() ?? "",
  );
  const [comments, setComments] = useState(stage?.comments ?? "");
  const [settings, setSettings] = useState(
    stage?.settings ? JSON.stringify(stage.settings, null, 2) : "",
  );
  const [saving, setSaving] = useState(false);

  const isEdit = !!stage;

  const submit = async () => {
    let parsedSettings: unknown = null;
    if (settings.trim()) {
      try {
        parsedSettings = JSON.parse(settings);
      } catch {
        toast.error("Settings : JSON invalide");
        return;
      }
    }

    const startIso = startedAt ? new Date(startedAt).toISOString() : null;
    const endIso = endedAt ? new Date(endedAt).toISOString() : null;

    if (startIso && endIso && new Date(endIso) < new Date(startIso)) {
      toast.error("La date de fin ne peut pas être antérieure au début");
      return;
    }

    let computedDuration: number | null = duration ? Number(duration) : null;
    if (startIso && endIso) {
      computedDuration = Math.round(
        (new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000,
      );
    }

    setSaving(true);
    const payload = {
      stage_type: stageType,
      started_at: startIso,
      ended_at: endIso,
      operators_count: operators ? Number(operators) : null,
      duration_minutes: computedDuration,
      comments: comments.trim() || null,
      settings: parsedSettings as never,
    };

    let error;
    if (isEdit && stage) {
      ({ error } = await supabase
        .from("batch_stages")
        .update(payload)
        .eq("id", stage.id));
    } else {
      const { data: userData } = await supabase.auth.getUser();
      ({ error } = await supabase.from("batch_stages").insert({
        ...payload,
        batch_id: batchId,
        created_by: userData.user?.id ?? null,
      }));
    }
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(isEdit ? "Étape mise à jour" : "Étape ajoutée");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Modifier l'étape" : "Nouvelle étape"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Type d'étape</Label>
            <Select value={stageType} onValueChange={setStageType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAGE_TYPES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Début</Label>
              <Input
                type="datetime-local"
                value={startedAt}
                onChange={(e) => setStartedAt(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Fin</Label>
              <Input
                type="datetime-local"
                value={endedAt}
                onChange={(e) => setEndedAt(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Nombre d'opérateurs</Label>
              <Input
                type="number"
                min={0}
                value={operators}
                onChange={(e) => setOperators(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Durée (min)</Label>
              <Input
                type="number"
                min={0}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder={startedAt && endedAt ? "Auto" : ""}
                disabled={!!(startedAt && endedAt)}
              />
              {startedAt && endedAt && (
                <p className="text-xs text-muted-foreground">
                  Calculée automatiquement à partir du début et de la fin.
                </p>
              )}
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Commentaires</Label>
            <Textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              rows={2}
            />
          </div>
          <div className="grid gap-2">
            <Label>Settings (JSON)</Label>
            <Textarea
              value={settings}
              onChange={(e) => setSettings(e.target.value)}
              rows={3}
              placeholder='{"rpm": 30}'
              className="font-mono text-xs"
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

export { toLocalInput };
