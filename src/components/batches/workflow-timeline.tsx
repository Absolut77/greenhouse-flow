import { useEffect, useMemo, useState } from "react";
import type React from "react";
import {
  Lock,
  Play,
  CheckCircle2,
  Loader2,
  Circle,
  Wind,
  Scissors,
  Package,
  Boxes,
  Undo2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  computeWorkflow,
  formatDuration,
  STAGE_ORDER,
  findStage,
  type Stage,
  type StageCode,
  type WorkflowStep,
} from "@/lib/batch-workflow";
import { useAuth } from "@/hooks/use-auth";
import { DryingStepContent } from "./steps/drying-step";
import { DebuddingStepContent } from "./steps/debudding-step";
import { CuringStepContent, CuringFinishDialog } from "./steps/curing-step";
import { BulkPackagingStepContent } from "./steps/bulk-packaging-step";
import type { Tables } from "@/integrations/supabase/types";

type Batch = Tables<"batches">;

const STEP_ICONS: Record<StageCode, React.ReactNode> = {
  drying: <Wind className="h-4 w-4" />,
  debudding: <Scissors className="h-4 w-4" />,
  curing: <Boxes className="h-4 w-4" />,
  bulk_packaging: <Package className="h-4 w-4" />,
};

function StatusPill({ status }: { status: WorkflowStep["status"] }) {
  const map: Record<WorkflowStep["status"], { label: string; icon: React.ReactNode; className: string }> = {
    locked: { label: "Verrouillée", icon: <Lock className="h-3 w-3" />, className: "bg-muted text-muted-foreground" },
    available: { label: "Disponible", icon: <Circle className="h-3 w-3" />, className: "bg-secondary text-secondary-foreground" },
    in_progress: { label: "En cours", icon: <Play className="h-3 w-3" />, className: "bg-amber-500/20 text-amber-500" },
    done: { label: "Terminée", icon: <CheckCircle2 className="h-3 w-3" />, className: "bg-emerald-500/20 text-emerald-500" },
  };
  const m = map[status];
  return (
    <Badge variant="outline" className={`gap-1 border-transparent ${m.className}`}>
      {m.icon} {m.label}
    </Badge>
  );
}

export function WorkflowTimeline({
  batch,
  canEdit,
  onBatchClosed,
  onDestructionSaved,
}: {
  batch: Batch;
  canEdit: boolean;
  onBatchClosed?: () => void;
  onDestructionSaved?: () => void;
}) {
  const batchId = batch.id;
  const isClosed = batch.status !== "in_progress";
  const { roles } = useAuth();
  const canRevert = roles.includes("admin") || roles.includes("supervisor");
  const [stages, setStages] = useState<Stage[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmFinish, setConfirmFinish] = useState<WorkflowStep | null>(null);
  const [confirmRevert, setConfirmRevert] = useState<WorkflowStep | null>(null);
  const [curingFinishOpen, setCuringFinishOpen] = useState(false);
  const [curingRefreshKey, setCuringRefreshKey] = useState(0);
  const [availableGramsForPackaging, setAvailable] = useState<number | null>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from("batch_stages")
      .select("*")
      .eq("batch_id", batchId)
      .order("created_at", { ascending: true });
    if (error) toast.error(error.message);
    else setStages(data ?? []);
  };

  // available for bulk packaging = total weight_out des conteneurs curing
  const loadAvailable = async () => {
    const { data } = await (supabase as any)
      .from("curing_containers")
      .select("weight_out_grams")
      .eq("batch_id", batchId);
    const total = (data ?? []).reduce(
      (s: number, r: any) => s + (r.weight_out_grams != null ? Number(r.weight_out_grams) : 0),
      0,
    );
    setAvailable(total);
  };

  useEffect(() => {
    load();
    loadAvailable();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  // Auto-start drying if missing (should already exist from creation form).
  useEffect(() => {
    if (!stages) return;
    if (isClosed) return;
    const drying = findStage(stages, "drying");
    if (!drying) {
      (async () => {
        await supabase.from("batch_stages").insert({
          batch_id: batchId,
          stage_type: "drying",
          status: "in_progress",
          started_at: batch.created_at,
        } as any);
        load();
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stages, isClosed]);

  const workflow = useMemo(() => computeWorkflow(stages ?? []), [stages]);

  const upsertStage = async (
    code: StageCode,
    existing: Stage | null,
    patch: Partial<Stage> & { status?: string; metadata?: any },
  ): Promise<Stage | null> => {
    if (existing) {
      const { data, error } = await supabase
        .from("batch_stages")
        .update(patch as any)
        .eq("id", existing.id)
        .select()
        .single();
      if (error) { toast.error(error.message); return null; }
      return data as Stage;
    }
    const { data, error } = await supabase
      .from("batch_stages")
      .insert({ batch_id: batchId, stage_type: code, ...(patch as any) })
      .select()
      .single();
    if (error) { toast.error(error.message); return null; }
    return data as Stage;
  };

  const finalizeBulkPackaging = async (step: WorkflowStep): Promise<boolean> => {
    const { data: bags, error: bagsErr } = await (supabase as any)
      .from("packaging_bags")
      .select("*")
      .eq("batch_id", batchId);
    if (bagsErr) { toast.error(bagsErr.message); return false; }
    const list = (bags ?? []) as any[];
    if (list.length === 0) {
      toast.error("Aucun sac défini pour le bulk packaging.");
      return false;
    }
    if (list.some((b) => !b.location || !String(b.location).trim())) {
      toast.error("Chaque sac doit avoir un emplacement défini.");
      return false;
    }
    const totalPackaged = list.reduce(
      (s, b) => s + Number(b.net_weight_grams) * Number(b.bag_count),
      0,
    );
    if (availableGramsForPackaging != null && totalPackaged > availableGramsForPackaging + 1e-6) {
      toast.error(
        `Poids packagé (${totalPackaged.toFixed(2)} g) > sortie curing (${availableGramsForPackaging.toFixed(2)} g).`,
      );
      return false;
    }

    const prefix = `${batch.batch_number ?? batchId.slice(0, 6)} – ${batch.strain ?? "sans nom"}`;
    const pendingBags = list.filter((b) => !b.inventory_lot_id);
    for (let i = 0; i < pendingBags.length; i++) {
      const b = pendingBags[i];
      const lotNumber = pendingBags.length > 1
        ? `${prefix} (${String(i + 1).padStart(2, "0")})`
        : prefix;
      const totalGrams = Number(b.net_weight_grams) * Number(b.bag_count);
      const { data: lot, error: lotErr } = await supabase
        .from("inventory_lots")
        .insert({
          lot_number: lotNumber,
          batch_id: batchId,
          product_type: "packaged",
          format: "bulk",
          flower_size: b.flower_type,
          quantity_grams: totalGrams,
          units: b.bag_count,
          status: "available",
          notes: b.location ? `Emplacement : ${b.location}` : null,
        } as any)
        .select()
        .single();
      if (lotErr) { toast.error(`Lot ${lotNumber}: ${lotErr.message}`); return false; }
      await (supabase as any)
        .from("packaging_bags")
        .update({ inventory_lot_id: lot.id })
        .eq("id", b.id);
    }

    // Créer les 3 échantillons fixes s'ils n'existent pas déjà
    const { data: existingSamples } = await supabase
      .from("samples")
      .select("sample_type")
      .eq("batch_id", batchId);
    const existing = new Set((existingSamples ?? []).map((s: any) => s.sample_type));
    const fixed = ["Laboratoire", "Interne", "Rétention"] as const;
    const toInsert = fixed
      .filter((t) => !existing.has(t))
      .map((t) => ({
        batch_id: batchId,
        stage_id: step.row?.id ?? null,
        sample_type: t,
        weight_grams: null,
        is_destruction: false,
        notes: t === "Rétention"
          ? "Créé automatiquement — à conserver 3 ans"
          : "Créé automatiquement à la fin du bulk packaging",
      }));
    if (toInsert.length > 0) {
      await supabase.from("samples").insert(toInsert as any);
    }
    return true;
  };

  const startNext = async (currentCode: StageCode) => {
    const idx = STAGE_ORDER.indexOf(currentCode);
    const nextCode = STAGE_ORDER[idx + 1];
    if (!nextCode) return;
    const nextRow = findStage(stages ?? [], nextCode);
    await upsertStage(nextCode, nextRow, {
      status: "in_progress",
      started_at: nextRow?.started_at ?? new Date().toISOString(),
      ended_at: null,
    } as any);
  };

  const finishStage = async (step: WorkflowStep) => {
    setBusy(step.code);
    if (step.code === "bulk_packaging") {
      const ok = await finalizeBulkPackaging(step);
      if (!ok) { setBusy(null); return; }
    }
    const updated = await upsertStage(step.code, step.row, {
      status: "done",
      started_at: step.row?.started_at ?? new Date().toISOString(),
      ended_at: new Date().toISOString(),
    } as any);
    if (!updated) { setBusy(null); return; }

    if (step.code === "bulk_packaging") {
      const { error } = await supabase
        .from("batches")
        .update({ status: "closed", closed_at: new Date().toISOString() })
        .eq("id", batchId);
      if (error) toast.error(error.message);
      else toast.success("Bulk Packaging validé — batch fermée.");
      onBatchClosed?.();
    } else {
      toast.success(`${step.label} terminée — étape suivante démarrée.`);
      await startNext(step.code);
    }
    setBusy(null);
    await load();
    await loadAvailable();
    onDestructionSaved?.();
  };

  // Curing: on click "Terminer", first ask for weight_out per container.
  const askFinishCuring = () => setCuringFinishOpen(true);

  const revertStage = async (step: WorkflowStep) => {
    setBusy(step.code);
    // Reset current stage to available (delete row) and reset any subsequent done rows
    const codes = STAGE_ORDER.slice(STAGE_ORDER.indexOf(step.code));
    for (const code of codes) {
      const row = findStage(stages ?? [], code);
      if (row) {
        await supabase
          .from("batch_stages")
          .update({
            status: code === step.code ? "in_progress" : "locked",
            ended_at: null,
            started_at: code === step.code ? (row.started_at ?? new Date().toISOString()) : null,
          } as any)
          .eq("id", row.id);
      }
    }
    // If batch was closed, reopen it
    if (batch.status === "closed") {
      await supabase.from("batches").update({ status: "in_progress", closed_at: null }).eq("id", batchId);
      onBatchClosed?.();
    }
    setBusy(null);
    setConfirmRevert(null);
    await load();
    await loadAvailable();
    toast.success(`Retour à l'étape « ${step.label} »`);
  };

  if (!stages) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement du workflow...
      </div>
    );
  }

  return (
    <>
      <ol className="relative space-y-6 border-l border-border pl-6">
        <li className="relative">
          <span className="absolute -left-[30px] flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-500">
            <CheckCircle2 className="h-4 w-4" />
          </span>
          <div className="rounded-lg border p-4">
            <div className="flex items-center gap-2">
              <p className="font-medium">Création</p>
              <StatusPill status="done" />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Batch initialisée le {new Date(batch.created_at).toLocaleString("fr-CA")} —
              séchage démarré automatiquement à cette date.
            </p>
          </div>
        </li>

        {workflow.map((step) => (
          <li key={step.code} className="relative">
            <span
              className={`absolute -left-[30px] flex h-6 w-6 items-center justify-center rounded-full ${
                step.status === "done"
                  ? "bg-emerald-500/20 text-emerald-500"
                  : step.status === "in_progress"
                  ? "bg-amber-500/20 text-amber-500"
                  : step.status === "locked"
                  ? "bg-muted text-muted-foreground"
                  : "bg-secondary text-secondary-foreground"
              }`}
            >
              {step.status === "done" ? <CheckCircle2 className="h-4 w-4" />
                : step.status === "in_progress" ? <Play className="h-4 w-4" />
                : step.status === "locked" ? <Lock className="h-4 w-4" />
                : <Circle className="h-4 w-4" />}
            </span>
            <StepCard
              batch={batch}
              step={step}
              canEdit={canEdit && !isClosed}
              canRevert={canRevert}
              busy={busy === step.code}
              availableGramsForPackaging={availableGramsForPackaging}
              curingRefreshKey={curingRefreshKey}
              onFinishRequest={() => {
                if (step.code === "curing") askFinishCuring();
                else setConfirmFinish(step);
              }}
              onRevertRequest={() => setConfirmRevert(step)}
              onDataChanged={() => {
                loadAvailable();
                onDestructionSaved?.();
              }}
            />
          </li>
        ))}
      </ol>

      <AlertDialog open={!!confirmFinish} onOpenChange={(o) => !o && setConfirmFinish(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Terminer « {confirmFinish?.label} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmFinish?.code === "bulk_packaging"
                ? "Les sacs seront convertis en lots d'inventaire (strictement liés à cette batch), les échantillons fixes créés, et la batch sera fermée."
                : "L'étape sera marquée comme terminée et l'étape suivante démarrera automatiquement."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const step = confirmFinish;
                setConfirmFinish(null);
                if (step) finishStage(step);
              }}
            >
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmRevert} onOpenChange={(o) => !o && setConfirmRevert(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revenir à « {confirmRevert?.label} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              L'étape actuelle et toutes les étapes ultérieures seront réouvertes. Les données saisies restent enregistrées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmRevert && revertStage(confirmRevert)}
            >
              Revenir en arrière
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CuringFinishDialog
        open={curingFinishOpen}
        onOpenChange={setCuringFinishOpen}
        batchId={batchId}
        onDone={async () => {
          setCuringRefreshKey((n) => n + 1);
          const curingStep = workflow.find((s) => s.code === "curing");
          if (!curingStep) return;
          await finishStage(curingStep);
        }}
      />
    </>
  );
}

function StepCard({
  batch,
  step,
  canEdit,
  canRevert,
  busy,
  availableGramsForPackaging,
  curingRefreshKey,
  onFinishRequest,
  onRevertRequest,
  onDataChanged,
}: {
  batch: Batch;
  step: WorkflowStep;
  canEdit: boolean;
  canRevert: boolean;
  busy: boolean;
  availableGramsForPackaging: number | null;
  curingRefreshKey: number;
  onFinishRequest: () => void;
  onRevertRequest: () => void;
  onDataChanged: () => void;
}) {
  const locked = step.status === "locked";
  const active = step.status === "in_progress";
  const done = step.status === "done";
  const stageId = step.row?.id ?? null;

  return (
    <div className={`rounded-lg border p-4 ${locked ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{STEP_ICONS[step.code]}</span>
          <p className="font-medium">{step.label}</p>
          <StatusPill status={step.status} />
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && active && (
            <Button size="sm" variant="secondary" onClick={onFinishRequest} disabled={busy}>
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Terminer {step.label.toLowerCase()}
            </Button>
          )}
          {canRevert && (active || done) && step.row && (
            <Button size="sm" variant="ghost" onClick={onRevertRequest} disabled={busy}>
              <Undo2 className="mr-1 h-4 w-4" /> Revenir en arrière
            </Button>
          )}
        </div>
      </div>

      <div className="mt-1 grid gap-1 text-xs text-muted-foreground sm:grid-cols-3">
        <span>Début : {fmt(step.row?.started_at)}</span>
        <span>Fin : {fmt(step.row?.ended_at)}</span>
        <span>Durée : {formatDuration(step.row?.started_at, step.row?.ended_at)}</span>
      </div>

      {(active || done) && (
        <div className="mt-4">
          {step.code === "drying" && (
            <DryingStepContent
              batchId={batch.id}
              stageId={stageId}
              disabled={!canEdit || done}
              onDestructionCreated={onDataChanged}
            />
          )}
          {step.code === "debudding" && (
            <DebuddingStepContent
              stage={step.row}
              disabled={!canEdit || done}
              onSaved={onDataChanged}
            />
          )}
          {step.code === "curing" && (
            <CuringStepContent
              batchId={batch.id}
              stageId={stageId}
              disabled={!canEdit || done}
              refreshKey={curingRefreshKey}
              onSampleCreated={onDataChanged}
            />
          )}
          {step.code === "bulk_packaging" && (
            <BulkPackagingStepContent
              batchId={batch.id}
              stageId={stageId}
              disabled={!canEdit || done}
              availableGrams={availableGramsForPackaging}
              onChanged={onDataChanged}
            />
          )}
        </div>
      )}
    </div>
  );
}

const fmt = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("fr-CA", { dateStyle: "short", timeStyle: "short" }) : "—";
