import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Pencil, Archive, Download, Unlock, Trash2 } from "lucide-react";
import { exportXlsx, fmtDate, fmtDateTime } from "@/lib/export-xlsx";


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
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import { StatusBadge } from "./batches";
import { WorkflowTimeline } from "@/components/batches/workflow-timeline";
import { DestructionsSection } from "@/components/batches/destructions-section";
import { useAuth } from "@/hooks/use-auth";

type Batch = Tables<"batches">;

export const Route = createFileRoute("/_authenticated/batches_/$id")({
  head: () => ({ meta: [{ title: "Batch — ONO Cannabis" }] }),
  component: BatchDetailPage,
});

function BatchDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { roles } = useAuth();
  const canEdit = roles.some((r) => r === "admin" || r === "supervisor" || r === "operator");
  const isAdmin = roles.includes("admin");
  const isSupervisor = roles.includes("supervisor");
  const canReopen = isAdmin || isSupervisor;
  const [batch, setBatch] = useState<Batch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [destructionRefresh, setDestructionRefresh] = useState(0);

  const load = async () => {
    const { data, error } = await supabase
      .from("batches")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) setError(error.message);
    else if (!data) setError("Batch introuvable");
    else setBatch(data);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const toggleStatus = async () => {
    if (!batch) return;
    const next = batch.status === "in_progress" ? "closed" : "in_progress";
    setUpdating(true);
    const { data, error } = await supabase
      .from("batches")
      .update({
        status: next,
        closed_at: next === "closed" ? new Date().toISOString() : null,
      })
      .eq("id", batch.id)
      .select()
      .single();
    setUpdating(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setBatch(data);
    toast.success(`Statut : ${next}`);
  };

  const archive = async () => {
    if (!batch) return;
    setUpdating(true);
    const { data, error } = await supabase
      .from("batches")
      .update({ status: "archived" })
      .eq("id", batch.id)
      .select()
      .single();
    setUpdating(false);
    setArchiveOpen(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setBatch(data);
    toast.success("Batch archivée");
  };

  if (error) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/batches" })}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Retour
        </Button>
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  if (!batch) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/batches" })}>
        <ArrowLeft className="mr-1 h-4 w-4" /> Retour
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{batch.batch_number}</h1>
          <span className="text-muted-foreground">— {batch.strain ?? "—"}</span>
          <StatusBadge status={batch.status} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              const [stagesR, dryingR, samplesR, weightsR] = await Promise.all([
                supabase.from("batch_stages").select("*").eq("batch_id", batch.id).order("started_at", { ascending: true }),
                supabase.from("drying_logs").select("*").eq("batch_id", batch.id).order("log_date", { ascending: true }),
                supabase.from("samples").select("*").eq("batch_id", batch.id).order("sample_date", { ascending: true }),
                supabase.from("weights").select("*").eq("batch_id", batch.id).order("recorded_at", { ascending: true }),
              ]);
              exportXlsx(`batch_${batch.batch_number}`, [
                {
                  name: "Infos",
                  rows: [
                    { Champ: "Numéro", Valeur: batch.batch_number },
                    { Champ: "Strain", Valeur: batch.strain ?? "" },
                    { Champ: "Nombre de plants", Valeur: batch.plant_count ?? "" },
                    { Champ: "Poids récolte (g)", Valeur: batch.weight_per_plant ?? "" },
                    { Champ: "Date récolte", Valeur: fmtDate(batch.harvest_date) },
                    { Champ: "Salle récolte", Valeur: batch.harvest_room ?? "" },
                    { Champ: "Séchage", Valeur: batch.drying_location ?? "" },
                    { Champ: "Statut", Valeur: batch.status },
                    { Champ: "Créée le", Valeur: fmtDateTime(batch.created_at) },
                    { Champ: "Fermée le", Valeur: fmtDateTime(batch.closed_at) },
                  ],
                },
                {
                  name: "Étapes",
                  rows: (stagesR.data ?? []).map((s) => ({
                    Étape: s.stage_type ?? "",
                    Début: fmtDateTime(s.started_at),
                    Fin: fmtDateTime(s.ended_at),
                  })),
                },
                {
                  name: "Séchage",
                  rows: (dryingR.data ?? []).map((d) => ({
                    Date: fmtDate(d.log_date),
                    Salle: d.room_number ?? "",
                    "Temp. actuelle (°C)": d.temp_current ?? "",
                    "Temp. consigne (°C)": d.temp_setpoint ?? "",
                    "Temp. externe (°C)": d.temp_external ?? "",
                    "Humidité actuelle (%)": d.humidity_current ?? "",
                    "Humidité consigne (%)": d.humidity_setpoint ?? "",
                    "Humidité externe (%)": d.humidity_external ?? "",
                    Commentaires: d.comments ?? "",
                  })),
                },
                {
                  name: "Échantillons",
                  rows: (samplesR.data ?? []).map((s) => ({
                    Date: fmtDate(s.sample_date),
                    Type: s.sample_type ?? "",
                    "Poids (g)": s.weight_grams ?? "",
                    Destruction: s.is_destruction ? "Oui" : "Non",
                    Notes: s.notes ?? "",
                  })),
                },
                {
                  name: "Pesées",
                  rows: (weightsR.data ?? []).map((w) => ({
                    Date: fmtDateTime(w.recorded_at),
                    Étape: w.stage ?? "",
                    Catégorie: w.category ?? "",
                    "Poids (g)": w.weight_grams ?? "",
                    "Nb contenants": w.container_count ?? "",
                    Commentaires: w.comments ?? "",
                  })),
                },
              ]);

            }}
          >
            <Download className="mr-1 h-4 w-4" /> Exporter la batch
          </Button>
          {batch.status !== "archived" && (
            <>
              <Button onClick={toggleStatus} disabled={updating} variant="secondary">
                {batch.status === "in_progress" ? "Fermer la batch" : "Rouvrir la batch"}
              </Button>
              <Button
                onClick={() => setArchiveOpen(true)}
                disabled={updating}
                variant="outline"
              >
                <Archive className="mr-1 h-4 w-4" /> Archiver
              </Button>
            </>
          )}

        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Informations générales</CardTitle>
          {batch.status !== "archived" && (
            <Button size="sm" variant="ghost" onClick={() => setEditOpen(true)}>
              <Pencil className="mr-1 h-4 w-4" /> Modifier
            </Button>
          )}
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Info label="Numéro" value={batch.batch_number} />
          <Info label="Strain" value={batch.strain} />
          <Info label="Nombre de plants" value={batch.plant_count?.toString()} />
          <Info
            label="Poids total de la récolte (g)"
            value={batch.weight_per_plant?.toString()}
          />
          <Info
            label="Date de récolte"
            value={batch.harvest_date ? new Date(batch.harvest_date).toLocaleDateString("fr-CA") : null}
          />
          <Info label="Salle de récolte" value={batch.harvest_room} />
          <Info label="Emplacement de séchage" value={batch.drying_location} />
          <Info
            label="Créée le"
            value={new Date(batch.created_at).toLocaleString("fr-CA")}
          />
        </CardContent>
      </Card>

      <WorkflowTimeline
        batch={batch}
        canEdit={canEdit}
        onBatchClosed={load}
        onDestructionSaved={() => setDestructionRefresh((n) => n + 1)}
      />
      <DestructionsSection batchId={batch.id} batchStatus={batch.status} refreshKey={destructionRefresh} />


      <EditBatchDialog
        key={batch.id + batch.strain}
        batch={batch}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={(b) => setBatch(b)}
      />

      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archiver cette batch ?</AlertDialogTitle>
            <AlertDialogDescription>
              La batch passera au statut « Archivée ». Vous pourrez toujours la
              consulter mais plus la modifier.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={archive} disabled={updating}>
              {updating && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Archiver
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-sm">{value?.trim() ? value : "—"}</div>
    </div>
  );
}

function EditBatchDialog({
  batch,
  open,
  onOpenChange,
  onSaved,
}: {
  batch: Batch;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: (b: Batch) => void;
}) {
  const [strain, setStrain] = useState(batch.strain ?? "");
  const [plantCount, setPlantCount] = useState(batch.plant_count?.toString() ?? "");
  const [totalHarvestWeight, setTotalHarvestWeight] = useState(
    batch.weight_per_plant?.toString() ?? "",
  );
  const [harvestDate, setHarvestDate] = useState(batch.harvest_date ?? "");
  const [harvestRoom, setHarvestRoom] = useState(batch.harvest_room ?? "");
  const [dryingLocation, setDryingLocation] = useState(batch.drying_location ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!strain.trim()) {
      toast.error("Le strain est obligatoire");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("batches")
      .update({
        strain: strain.trim(),
        plant_count: plantCount ? Number(plantCount) : null,
        weight_per_plant: totalHarvestWeight ? Number(totalHarvestWeight) : null,
        harvest_date: harvestDate || null,
        harvest_room: harvestRoom.trim() || null,
        drying_location: dryingLocation.trim() || null,
      })
      .eq("id", batch.id)
      .select()
      .single();
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Batch mise à jour");
    onSaved(data);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Modifier la batch</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Strain *</Label>
            <Input value={strain} onChange={(e) => setStrain(e.target.value)} />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Nombre de plants</Label>
              <Input
                type="number"
                min="0"
                value={plantCount}
                onChange={(e) => setPlantCount(e.target.value)}
              />
            </div>
            <div>
              <Label>Poids total de la récolte (g)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={totalHarvestWeight}
                onChange={(e) => setTotalHarvestWeight(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Date de récolte</Label>
              <Input
                type="date"
                value={harvestDate}
                onChange={(e) => setHarvestDate(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Salle de récolte</Label>
              <Input
                value={harvestRoom}
                onChange={(e) => setHarvestRoom(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Emplacement de séchage</Label>
            <Input
              value={dryingLocation}
              onChange={(e) => setDryingLocation(e.target.value)}
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
