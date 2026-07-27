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
import { Checkbox } from "@/components/ui/checkbox";
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
import { formatZonedDateTime } from "@/lib/dates";

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

export function toLocalDatetimeInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
  const [finishEndedAt, setFinishEndedAt] = useState<string>("");
  const [finishConfirmed, setFinishConfirmed] = useState(false);
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
    if (pendingBags.length === 0) return true;

    // Split pending bags into 3 lot kinds
    const groups: Record<"bulk" | "sample" | "retention", any[]> = {
      bulk: [],
      sample: [],
      retention: [],
    };
    for (const b of pendingBags) {
      const t = String(b.flower_type ?? "").toLowerCase();
      if (t.startsWith("échantillon") || t.startsWith("echantillon") || t.startsWith("sample")) {
        groups.sample.push(b);
      } else if (t.startsWith("rétention") || t.startsWith("retention")) {
        groups.retention.push(b);
      } else {
        groups.bulk.push(b);
      }
    }

    const kindMeta: Record<
      "bulk" | "sample" | "retention",
      { product_type: string; lot_kind: string; format: string; lot_number: string; notes: string }
    > = {
      bulk: {
        product_type: "packaged",
        lot_kind: "bulk",
        format: "bulk",
        lot_number: prefix,
        notes: "Détail des sacs disponible sur la fiche du lot.",
      },
      sample: {
        product_type: "sample",
        lot_kind: "sample",
        format: "sample",
        lot_number: `SMP – ${prefix}`,
        notes: "Lot d'échantillons créé à la clôture du bulk packaging.",
      },
      retention: {
        product_type: "retention",
        lot_kind: "retention",
        format: "retention",
        lot_number: `RET – ${prefix}`,
        notes: "Lot de rétention — bloqué. À conserver 3 ans avant destruction.",
      },
    };

    for (const kind of ["bulk", "sample", "retention"] as const) {
      const bags = groups[kind];
      if (bags.length === 0) continue;

      const totalPending = bags.reduce(
        (s, b) => s + Number(b.net_weight_grams) * Number(b.bag_count),
        0,
      );
      const totalUnits = bags.reduce((s, b) => s + Number(b.bag_count), 0);
      const flowerTypes = Array.from(new Set(bags.map((b) => b.flower_type))).join(", ");
      const meta = kindMeta[kind];

      const { data: existingLot } = await supabase
        .from("inventory_lots")
        .select("*")
        .eq("batch_id", batchId)
        .eq("lot_kind", meta.lot_kind)
        .maybeSingle();

      let lotId: string;
      if (existingLot) {
        const { data: upd, error: updErr } = await supabase
          .from("inventory_lots")
          .update({
            quantity_grams: Number(existingLot.quantity_grams ?? 0) + totalPending,
            units: Number(existingLot.units ?? 0) + totalUnits,
          } as any)
          .eq("id", existingLot.id)
          .select()
          .single();
        if (updErr) { toast.error(updErr.message); return false; }
        lotId = upd.id;
      } else {
        const { data: lot, error: lotErr } = await supabase
          .from("inventory_lots")
          .insert({
            lot_number: meta.lot_number,
            batch_id: batchId,
            product_type: meta.product_type,
            format: meta.format,
            flower_size: flowerTypes || null,
            quantity_grams: totalPending,
            units: totalUnits,
            status: "available",
            lot_kind: meta.lot_kind,
            notes: meta.notes,
          } as any)
          .select()
          .single();
        if (lotErr) { toast.error(`Lot ${meta.lot_number}: ${lotErr.message}`); return false; }
        lotId = lot.id;
      }

      for (const b of bags) {
        await (supabase as any)
          .from("packaging_bags")
          .update({ inventory_lot_id: lotId })
          .eq("id", b.id);
      }
    }

    // Créer les 3 échantillons "logbook" fixes s'ils n'existent pas déjà (traçabilité labo/interne/rétention)
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


  const startNext = async (currentCode: StageCode, startedAt: string) => {
    const idx = STAGE_ORDER.indexOf(currentCode);
    const nextCode = STAGE_ORDER[idx + 1];
    if (!nextCode) return;
    const nextRow = findStage(stages ?? [], nextCode);
    await upsertStage(nextCode, nextRow, {
      status: "in_progress",
      started_at: startedAt,
      ended_at: null,
    } as any);
  };

  const finishStage = async (step: WorkflowStep, endedAtIso?: string) => {
    setBusy(step.code);
    const startedAt = step.row?.started_at ?? new Date().toISOString();
    const endedAt = endedAtIso ?? new Date().toISOString();
    if (new Date(endedAt).getTime() < new Date(startedAt).getTime()) {
      toast.error("La date de fin ne peut pas être antérieure à la date de début.");
      setBusy(null);
      return;
    }
    if (step.code === "bulk_packaging") {
      const ok = await finalizeBulkPackaging(step);
      if (!ok) { setBusy(null); return; }
    }
    const updated = await upsertStage(step.code, step.row, {
      status: "done",
      started_at: startedAt,
      ended_at: endedAt,
    } as any);
    if (!updated) { setBusy(null); return; }

    if (step.code === "bulk_packaging") {
      // Verrouille le plafond de stock = poids sec total réellement packagé
      // (tous les sacs de l'étape : bulk, trim, samples, lab samples, rétention…)
      const { data: allBags } = await (supabase as any)
        .from("packaging_bags")
        .select("net_weight_grams,bag_count")
        .eq("batch_id", batchId);
      const dryCap = ((allBags ?? []) as any[]).reduce(
        (s, b) => s + Number(b.net_weight_grams ?? 0) * Number(b.bag_count ?? 0),
        0,
      );
      const { error } = await supabase
        .from("batches")
        .update({
          status: "closed",
          closed_at: endedAt,
          dry_cap_grams: dryCap,
          dry_cap_locked_at: endedAt,
        } as any)
        .eq("id", batchId);
      if (error) toast.error(error.message);
      else
        toast.success(
          `Bulk Packaging validé — batch fermée. Plafond de stock verrouillé à ${dryCap.toFixed(2)} g.`,
        );
      onBatchClosed?.();
    } else {

      toast.success(`${step.label} terminée — étape suivante démarrée.`);
      await startNext(step.code, endedAt);
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
              Batch initialisée le {formatZonedDateTime(batch.created_at)} —
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
                else {
                  setFinishEndedAt(toLocalDatetimeInput(new Date()));
                  setFinishConfirmed(false);
                  setConfirmFinish(step);
                }
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

      <Dialog open={!!confirmFinish} onOpenChange={(o) => !o && setConfirmFinish(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Terminer « {confirmFinish?.label} » ?</DialogTitle>
            <DialogDescription>
              {confirmFinish?.code === "bulk_packaging"
                ? "Les sacs seront convertis en un lot d'inventaire unique lié à cette batch, les échantillons fixes créés, et la batch sera fermée."
                : "L'étape sera marquée comme terminée et l'étape suivante démarrera automatiquement."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label>Date et heure de fin</Label>
            <Input
              type="datetime-local"
              value={finishEndedAt}
              min={confirmFinish?.row?.started_at ? toLocalDatetimeInput(new Date(confirmFinish.row.started_at)) : undefined}
              onChange={(e) => setFinishEndedAt(e.target.value)}
            />
            {confirmFinish?.row?.started_at && (
              <p className="text-xs text-muted-foreground">
                Démarrée le {formatZonedDateTime(confirmFinish.row.started_at)}
              </p>
            )}
          </div>
          {confirmFinish?.code === "bulk_packaging" && (
            <div className="space-y-3">
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
                ⚠ Action définitive : la batch sera <b>fermée</b> et les lots d'inventaire créés. Vérifiez les sacs avant de confirmer.
              </div>
              <label className="flex items-start gap-3 cursor-pointer rounded-md border p-3 hover:bg-muted/30">
                <Checkbox
                  checked={finishConfirmed}
                  onCheckedChange={(v) => setFinishConfirmed(v === true)}
                  className="mt-0.5"
                />
                <span className="text-sm">Je confirme que les quantités sont exactes.</span>
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmFinish(null)}>Annuler</Button>
            <Button
              disabled={confirmFinish?.code === "bulk_packaging" && !finishConfirmed}
              onClick={() => {
                const step = confirmFinish;
                const iso = finishEndedAt ? new Date(finishEndedAt).toISOString() : new Date().toISOString();
                setConfirmFinish(null);
                if (step) finishStage(step, iso);
              }}
            >
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
        startedAt={workflow.find((s) => s.code === "curing")?.row?.started_at ?? null}
        onDone={async (endedAtIso) => {
          setCuringRefreshKey((n) => n + 1);
          const curingStep = workflow.find((s) => s.code === "curing");
          if (!curingStep) return;
          await finishStage(curingStep, endedAtIso);
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
              freshHarvestGrams={batch.weight_per_plant}
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
  iso ? formatZonedDateTime(iso) : "—";
