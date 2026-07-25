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
import { Checkbox } from "@/components/ui/checkbox";
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

type Sample = Tables<"samples">;
type Stage = Tables<"batch_stages">;

const SAMPLE_TYPES = [
  { value: "aqualab", label: "Aqualab" },
  { value: "sartorius", label: "Sartorius" },
  { value: "internal", label: "Internal" },
  { value: "lab", label: "Lab" },
  { value: "retain", label: "Retain" },
  { value: "b2b", label: "B2B" },
];

const STAGE_LABELS: Record<string, string> = {
  drying: "Séchage",
  debudding: "Effeuillage",
  sanitation: "Sanitation",
  mobius: "Mobius",
  weighing: "Pesée",
  curing: "Curing",
  bulk_packaging: "Emballage vrac",
};

const NONE = "__none__";

export function SamplesSection({ batchId }: { batchId: string }) {
  const [samples, setSamples] = useState<Sample[] | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [creators, setCreators] = useState<
    Record<string, { full_name: string | null; email: string | null }>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Sample | null>(null);
  const [toDelete, setToDelete] = useState<Sample | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setError(null);
    const [{ data: sData, error: sErr }, { data: stData }] = await Promise.all([
      supabase
        .from("samples")
        .select("*")
        .eq("batch_id", batchId)
        .order("sample_date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("batch_stages")
        .select("*")
        .eq("batch_id", batchId)
        .order("started_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false }),
    ]);
    if (sErr) {
      setError(sErr.message);
      return;
    }
    const rows = sData ?? [];
    setSamples(rows);
    setStages(stData ?? []);

    const ids = Array.from(
      new Set(rows.map((r) => r.created_by).filter((x): x is string => !!x)),
    );
    if (ids.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);
      const map: Record<string, { full_name: string | null; email: string | null }> = {};
      (profs ?? []).forEach((p) => {
        map[p.id] = { full_name: p.full_name, email: p.email };
      });
      setCreators(map);
    } else {
      setCreators({});
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  const stageLabelFor = (id: string | null) => {
    if (!id) return "—";
    const s = stages.find((x) => x.id === id);
    if (!s) return "—";
    return STAGE_LABELS[s.stage_type] ?? s.stage_type;
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    const { error } = await supabase
      .from("samples")
      .delete()
      .eq("id", toDelete.id);
    setDeleting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Échantillon supprimé");
    setToDelete(null);
    load();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Échantillons</CardTitle>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="mr-1 h-4 w-4" /> Ajouter un échantillon
        </Button>
      </CardHeader>
      <CardContent>
        {error && <p className="text-destructive text-sm">{error}</p>}
        {!error && samples === null && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement...
          </div>
        )}
        {samples && samples.length === 0 && (
          <p className="text-sm italic text-muted-foreground">
            Aucun échantillon enregistré.
          </p>
        )}
        {samples && samples.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Poids (g)</TableHead>
                  <TableHead>Étape liée</TableHead>
                  <TableHead>Destruction</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Créé par</TableHead>
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {samples.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      {s.sample_date
                        ? new Date(s.sample_date).toLocaleDateString("fr-CA")
                        : "—"}
                    </TableCell>
                    <TableCell className="font-medium">
                      {SAMPLE_TYPES.find((t) => t.value === s.sample_type)
                        ?.label ?? s.sample_type ?? "—"}
                    </TableCell>
                    <TableCell>{s.weight_grams ?? "—"}</TableCell>
                    <TableCell>{stageLabelFor(s.stage_id)}</TableCell>
                    <TableCell>
                      {s.is_destruction ? (
                        <Badge
                          variant="outline"
                          className="bg-red-500/15 text-red-400 border-red-500/30"
                        >
                          Oui
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="bg-zinc-500/15 text-zinc-300 border-zinc-500/30"
                        >
                          Non
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs truncate">
                      {s.notes ?? "—"}
                    </TableCell>
                    <TableCell>
                      {s.created_by
                        ? creators[s.created_by]?.full_name ??
                          creators[s.created_by]?.email ??
                          "—"
                        : "—"}
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
          </div>
        )}
      </CardContent>

      <SampleDialog
        key={editing?.id ?? "new"}
        batchId={batchId}
        stages={stages}
        sample={editing}
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
            <AlertDialogTitle>Supprimer cet échantillon ?</AlertDialogTitle>
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

function SampleDialog({
  batchId,
  stages,
  sample,
  open,
  onOpenChange,
  onSaved,
}: {
  batchId: string;
  stages: Stage[];
  sample: Sample | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [sampleDate, setSampleDate] = useState(sample?.sample_date ?? today);
  const [sampleType, setSampleType] = useState(sample?.sample_type ?? "");
  const [weight, setWeight] = useState(sample?.weight_grams?.toString() ?? "");
  const [stageId, setStageId] = useState<string>(sample?.stage_id ?? NONE);
  const [isDestruction, setIsDestruction] = useState(
    sample?.is_destruction ?? true,
  );
  const [notes, setNotes] = useState(sample?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const isEdit = !!sample;

  const submit = async () => {
    if (!sampleType) {
      toast.error("Le type d'échantillon est obligatoire");
      return;
    }
    if (!sampleDate) {
      toast.error("La date est obligatoire");
      return;
    }
    const w = Number(weight);
    if (!weight || Number.isNaN(w) || w <= 0) {
      toast.error("Le poids doit être supérieur à 0");
      return;
    }
    setSaving(true);
    const payload = {
      sample_date: sampleDate,
      sample_type: sampleType,
      weight_grams: w,
      stage_id: stageId === NONE ? null : stageId,
      is_destruction: isDestruction,
      notes: notes.trim() || null,
    };
    let error;
    if (isEdit && sample) {
      ({ error } = await supabase
        .from("samples")
        .update(payload)
        .eq("id", sample.id));
    } else {
      const { data: userData } = await supabase.auth.getUser();
      ({ error } = await supabase.from("samples").insert({
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
    toast.success(isEdit ? "Échantillon mis à jour" : "Échantillon ajouté");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Modifier l'échantillon" : "Nouvel échantillon"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Date *</Label>
              <Input
                type="date"
                value={sampleDate}
                onChange={(e) => setSampleDate(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Type d'échantillon *</Label>
              <Select value={sampleType} onValueChange={setSampleType}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner" />
                </SelectTrigger>
                <SelectContent>
                  {SAMPLE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Poids (g) *</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>Étape liée</Label>
            <Select value={stageId} onValueChange={setStageId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Aucune</SelectItem>
                {stages.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {STAGE_LABELS[s.stage_type] ?? s.stage_type}
                    {s.started_at
                      ? ` — ${new Date(s.started_at).toLocaleDateString("fr-CA")}`
                      : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="is-destruction"
              checked={isDestruction}
              onCheckedChange={(v) => setIsDestruction(v === true)}
            />
            <Label htmlFor="is-destruction" className="cursor-pointer">
              Destruction
            </Label>
          </div>
          <div className="grid gap-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
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
