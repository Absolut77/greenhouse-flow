import { useEffect, useMemo, useState } from "react";
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
import { toast } from "sonner";
import {
  computeWorkflow,
  type Stage,
  type StageCode,
  type WorkflowStep,
} from "@/lib/batch-workflow";
import { DryingStepContent } from "./steps/drying-step";
import { DebuddingStepContent } from "./steps/debudding-step";
import { CuringStepContent } from "./steps/curing-step";
import { BulkPackagingStepContent } from "./steps/bulk-packaging-step";
import type { Tables } from "@/integrations/supabase/types";

type Batch = Tables<"batches">;

const STEP_ICONS: Record<StageCode, JSX.Element> = {
  drying: <Wind className="h-4 w-4" />,
  debudding: <Scissors className="h-4 w-4" />,
  curing: <Boxes className="h-4 w-4" />,
  bulk_packaging: <Package className="h-4 w-4" />,
};

function StatusPill({ status }: { status: WorkflowStep["status"] }) {
  const map: Record<WorkflowStep["status"], { label: string; icon: JSX.Element; className: string }> = {
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
  const [stages, setStages] = useState<Stage[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmFinish, setConfirmFinish] = useState<WorkflowStep | null>(null);
  const [availableGrams, setAvailableGrams] = useState<number | null>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from("batch_stages")
      .select("*")
      .eq("batch_id", batchId)
      .order("created_at", { ascending: true });
    if (error) toast.error(error.message);
    else setStages(data ?? []);
  };

  const loadAvailable = async () => {
    // available = weight_per_plant - sum(destructions)
    const { data: destr } = await (supabase as any)
      .from("destructions")
      .select("weight_grams, is_sanitation_log")
      .eq("batch_id", batchId);
    const totalDestroyed = (destr ?? [])
      .filter((d: any) => !d.is_sanitation_log)
      .reduce((s: number, d: any) => s + Number(d.weight_grams || 0), 0);
    const base = batch.weight_per_plant != null ? Number(batch.weight_per_plant) : null;
    setAvailableGrams(base != null ? base - totalDestroyed : null);
  };

  useEffect(() => {
    load();
    loadAvailable();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

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

  const startStage = async (step: WorkflowStep) => {
    setBusy(step.code);
    // For drying, use batch creation date as the start (fixed).
    const startedAt = step.code === "drying" ? batch.created_at : new Date().toISOString();
    await upsertStage(step.code, step.row, {
      status: "in_progress",
      started_at: step.row?.started_at ?? startedAt,
      ended_at: null,
    } as any);
    setBusy(null);
    await load();
  };

  const finalizeBulkPackaging = async (step: WorkflowStep): Promise<boolean> => {
    // Load bags for this batch
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
    const totalPackaged = list.reduce(
      (s, b) => s + Number(b.net_weight_grams) * Number(b.bag_count),
      0,
    );
    if (availableGrams != null && totalPackaged > availableGrams + 1e-6) {
      toast.error(
        `Poids packagé (${totalPackaged.toFixed(2)} g) > disponible (${availableGrams.toFixed(2)} g).`,
      );
      return false;
    }

    const prefix = batch.batch_number ?? batchId.slice(0, 6);
    const pendingBags = list.filter((b) => !b.inventory_lot_id);
    for (let i = 0; i < pendingBags.length; i++) {
      const b = pendingBags[i];
      const lotNumber = `${prefix}-${b.bag_type === "sample" ? "S" : "P"}-${String(i + 1).padStart(3, "0")}`;
      const totalGrams = Number(b.net_weight_grams) * Number(b.bag_count);
      const { data: lot, error: lotErr } = await supabase
        .from("inventory_lots")
        .insert({
          lot_number: lotNumber,
          batch_id: batchId,
          product_type: b.bag_type === "sample" ? "packaged_sample" : "packaged",
          format: b.bag_type === "sample" ? "sample" : "bulk_1kg",
          flower_size: b.flower_type,
          quantity_grams: totalGrams,
          units: b.bag_count,
          status: "available",
        })
        .select()
        .single();
      if (lotErr) { toast.error(`Lot ${lotNumber}: ${lotErr.message}`); return false; }
      await (supabase as any)
        .from("packaging_bags")
        .update({ inventory_lot_id: lot.id })
        .eq("id", b.id);
    }

    // Create the 3 fixed samples: Laboratoire, Interne, Rétention
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
        notes: "Créé automatiquement à la fin du bulk packaging",
      }));
    if (toInsert.length > 0) {
      await supabase.from("samples").insert(toInsert as any);
    }
    return true;
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
      toast.success(`${step.label} terminée.`);
    }
    setBusy(null);
    await load();
    await loadAvailable();
    onDestructionSaved?.();
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
              séchage démarré à cette date.
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
              busy={busy === step.code}
              availableGrams={availableGrams}
              onStart={() => startStage(step)}
              onFinishRequest={() => setConfirmFinish(step)}
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
                ? "Les sacs seront convertis en inventaire, les échantillons fixes créés, et la batch sera fermée. Cette action est définitive."
                : "L'étape sera marquée comme terminée et l'étape suivante sera débloquée."}
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
    </>
  );
}

function StepCard({
  batch,
  step,
  canEdit,
  busy,
  availableGrams,
  onStart,
  onFinishRequest,
  onDataChanged,
}: {
  batch: Batch;
  step: WorkflowStep;
  canEdit: boolean;
  busy: boolean;
  availableGrams: number | null;
  onStart: () => void;
  onFinishRequest: () => void;
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
          {canEdit && step.status === "available" && (
            <Button size="sm" onClick={onStart} disabled={busy}>
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Démarrer {step.label.toLowerCase()}
            </Button>
          )}
          {canEdit && active && (
            <Button size="sm" variant="secondary" onClick={onFinishRequest} disabled={busy}>
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Terminer {step.label.toLowerCase()}
            </Button>
          )}
        </div>
      </div>

      <div className="mt-1 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
        <span>Début : {fmt(step.row?.started_at)}</span>
        <span>Fin : {fmt(step.row?.ended_at)}</span>
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
              onSampleCreated={onDataChanged}
            />
          )}
          {step.code === "bulk_packaging" && (
            <BulkPackagingStepContent
              batchId={batch.id}
              stageId={stageId}
              disabled={!canEdit || done}
              availableGrams={availableGrams}
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
