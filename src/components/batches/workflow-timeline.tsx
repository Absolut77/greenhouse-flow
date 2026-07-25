import { useEffect, useMemo, useState } from "react";
import {
  Lock,
  Play,
  CheckCircle2,
  PauseCircle,
  Loader2,
  Circle,
  Settings2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  computeWorkflow,
  type Stage,
  type StageCode,
  type WorkflowStep,
} from "@/lib/batch-workflow";
import { DestructionPromptDialog } from "./destruction-prompt-dialog";
import { DestructionFormDialog } from "./destruction-form-dialog";

const fmt = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("fr-CA", { dateStyle: "short", timeStyle: "short" }) : "—";

function StatusPill({ status }: { status: WorkflowStep["status"] }) {
  const map: Record<WorkflowStep["status"], { label: string; icon: React.ReactNode; className: string }> = {
    locked: { label: "Verrouillée", icon: <Lock className="h-3 w-3" />, className: "bg-muted text-muted-foreground" },
    available: { label: "Disponible", icon: <Circle className="h-3 w-3" />, className: "bg-secondary text-secondary-foreground" },
    in_progress: { label: "En cours", icon: <Play className="h-3 w-3" />, className: "bg-amber-500/20 text-amber-500" },
    on_hold: { label: "En pause", icon: <PauseCircle className="h-3 w-3" />, className: "bg-blue-500/20 text-blue-400" },
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
  batchId,
  canEdit,
  onDestructionSaved,
  onBatchClosed,
}: {
  batchId: string;
  canEdit: boolean;
  onDestructionSaved?: () => void;
  onBatchClosed?: () => void;
}) {
  const [stages, setStages] = useState<Stage[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<{ open: boolean; step: WorkflowStep | null }>({ open: false, step: null });
  const [destruction, setDestruction] = useState<{ open: boolean; stageId: string | null; code: StageCode | null; label: string }>({
    open: false, stageId: null, code: null, label: "",
  });
  const [metaEdit, setMetaEdit] = useState<WorkflowStep | null>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from("batch_stages")
      .select("*")
      .eq("batch_id", batchId)
      .order("created_at", { ascending: true });
    if (error) toast.error(error.message);
    else setStages(data ?? []);
  };

  useEffect(() => {
    load();
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
    } else {
      const { data, error } = await supabase
        .from("batch_stages")
        .insert({ batch_id: batchId, stage_type: code, ...(patch as any) })
        .select()
        .single();
      if (error) { toast.error(error.message); return null; }
      return data as Stage;
    }
  };

  const startStage = async (step: WorkflowStep) => {
    setBusy(step.code);
    await upsertStage(step.code, step.row, {
      status: "in_progress",
      started_at: step.row?.started_at ?? new Date().toISOString(),
      ended_at: null,
    } as any);
    setBusy(null);
    await load();
  };

  const holdStage = async (step: WorkflowStep) => {
    setBusy(step.code);
    await upsertStage(step.code, step.row, { status: "on_hold" } as any);
    setBusy(null);
    await load();
  };

  const finishStage = async (step: WorkflowStep) => {
    setBusy(step.code);
    const updated = await upsertStage(step.code, step.row, {
      status: "done",
      started_at: step.row?.started_at ?? new Date().toISOString(),
      ended_at: new Date().toISOString(),
    } as any);
    setBusy(null);
    if (!updated) return;
    // Bulk packaging → close batch
    if (step.code === "bulk_packaging") {
      const { error } = await supabase
        .from("batches")
        .update({ status: "closed", closed_at: new Date().toISOString() })
        .eq("id", batchId);
      if (error) toast.error(error.message);
      else toast.success("Bulk Packaging validé — batch fermée");
      onBatchClosed?.();
    } else {
      toast.success(`${step.label} terminée`);
    }
    await load();
    if (step.askDestruction) {
      setPrompt({ open: true, step: { ...step, row: updated } });
    }
  };

  const handlePromptAnswer = (yes: boolean) => {
    const step = prompt.step;
    setPrompt({ open: false, step: null });
    if (yes && step) {
      setDestruction({
        open: true,
        stageId: step.row?.id ?? null,
        code: step.code,
        label: step.label,
      });
    }
  };

  const nonSanitation = workflow.filter((s) => s.code !== "sanitation");
  const sanitation = workflow.find((s) => s.code === "sanitation")!;

  if (!stages) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement du workflow...
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Workflow de production</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="relative space-y-6 border-l border-border pl-6">
            <li className="relative">
              <span className="absolute -left-[30px] flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-500">
                <CheckCircle2 className="h-4 w-4" />
              </span>
              <div className="flex items-center gap-2">
                <p className="font-medium">Création</p>
                <StatusPill status="done" />
              </div>
              <p className="text-xs text-muted-foreground">Batch initialisée</p>
            </li>
            {nonSanitation.map((step) => (
              <li key={step.code} className="relative">
                <span className={`absolute -left-[30px] flex h-6 w-6 items-center justify-center rounded-full ${
                  step.status === "done" ? "bg-emerald-500/20 text-emerald-500"
                  : step.status === "in_progress" ? "bg-amber-500/20 text-amber-500"
                  : step.status === "on_hold" ? "bg-blue-500/20 text-blue-400"
                  : step.status === "locked" ? "bg-muted text-muted-foreground"
                  : "bg-secondary text-secondary-foreground"
                }`}>
                  {step.status === "done" ? <CheckCircle2 className="h-4 w-4" />
                    : step.status === "in_progress" ? <Play className="h-4 w-4" />
                    : step.status === "on_hold" ? <PauseCircle className="h-4 w-4" />
                    : step.status === "locked" ? <Lock className="h-4 w-4" />
                    : <Circle className="h-4 w-4" />}
                </span>
                <StepCard
                  step={step}
                  canEdit={canEdit}
                  busy={busy === step.code}
                  onStart={() => startStage(step)}
                  onFinish={() => finishStage(step)}
                  onEditMeta={() => setMetaEdit(step)}
                />
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {/* Sanitation - independent */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Sanitation
            <Badge variant="outline">Étape indépendante</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <StepCard
            step={sanitation}
            canEdit={canEdit}
            busy={busy === "sanitation"}
            onStart={() => startStage(sanitation)}
            onFinish={() => finishStage(sanitation)}
            onHold={() => holdStage(sanitation)}
            showStandby
          />
        </CardContent>
      </Card>

      <DestructionPromptDialog
        open={prompt.open}
        onOpenChange={(o) => !o && setPrompt({ open: false, step: null })}
        stageLabel={prompt.step?.label ?? ""}
        onAnswer={handlePromptAnswer}
      />

      <DestructionFormDialog
        open={destruction.open}
        onOpenChange={(o) => setDestruction((d) => ({ ...d, open: o }))}
        batchId={batchId}
        stageId={destruction.stageId}
        stageCode={destruction.code}
        stageLabel={destruction.label}
        onSaved={onDestructionSaved}
      />

      {metaEdit && (
        <StageMetadataDialog
          step={metaEdit}
          onClose={() => setMetaEdit(null)}
          onSaved={async (meta) => {
            await upsertStage(metaEdit.code, metaEdit.row, { metadata: meta } as any);
            setMetaEdit(null);
            load();
          }}
        />
      )}
    </>
  );
}

function StepCard({
  step,
  canEdit,
  busy,
  onStart,
  onFinish,
  onHold,
  onEditMeta,
  showStandby,
}: {
  step: WorkflowStep;
  canEdit: boolean;
  busy: boolean;
  onStart: () => void;
  onFinish: () => void;
  onHold?: () => void;
  onEditMeta?: () => void;
  showStandby?: boolean;
}) {
  const locked = step.status === "locked";
  const isMetaStage = step.code === "debudding_manual" || step.code === "mobius";
  return (
    <div className={`rounded-lg border p-4 ${locked ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="font-medium">{step.label}</p>
          <StatusPill status={step.status} />
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && isMetaStage && step.status !== "locked" && onEditMeta && (
            <Button size="sm" variant="ghost" onClick={onEditMeta}>
              <Settings2 className="mr-1 h-4 w-4" /> Paramètres
            </Button>
          )}
          {canEdit && step.status === "available" && (
            <Button size="sm" onClick={onStart} disabled={busy}>
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Démarrer
            </Button>
          )}
          {canEdit && (step.status === "in_progress" || step.status === "on_hold") && (
            <>
              {showStandby && step.status === "in_progress" && onHold && (
                <Button size="sm" variant="outline" onClick={onHold} disabled={busy}>
                  <PauseCircle className="mr-1 h-4 w-4" /> Standby
                </Button>
              )}
              {step.status === "on_hold" && (
                <Button size="sm" variant="outline" onClick={onStart} disabled={busy}>
                  Reprendre
                </Button>
              )}
              <Button size="sm" variant="secondary" onClick={onFinish} disabled={busy}>
                {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Terminer cette étape
              </Button>
            </>
          )}
        </div>
      </div>
      <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
        <span>Début : {fmt(step.row?.started_at)}</span>
        <span>Fin : {fmt(step.row?.ended_at)}</span>
      </div>
      {isMetaStage && step.row?.metadata && Object.keys(step.row.metadata as any).length > 0 && (
        <div className="mt-3 rounded-md bg-muted/40 p-3 text-xs">
          <StageMetaSummary code={step.code} metadata={step.row.metadata as any} />
        </div>
      )}
    </div>
  );
}

function StageMetaSummary({ code, metadata }: { code: StageCode; metadata: any }) {
  if (code === "debudding_manual") {
    return (
      <div className="grid gap-1 sm:grid-cols-2">
        <span>Type : {metadata.type ?? "—"}</span>
        <span>Personnes : {metadata.persons ?? "—"}</span>
        <span>Temps (min) : {metadata.duration ?? "—"}</span>
        {metadata.comments && <span className="sm:col-span-2">Commentaires : {metadata.comments}</span>}
      </div>
    );
  }
  if (code === "mobius") {
    return (
      <div className="grid gap-1 sm:grid-cols-2">
        <span>Inclinaison : {metadata.inclination ?? "—"}</span>
        <span>Tumbler : {metadata.tumbler ?? "—"}/12</span>
        <span>Lames : {metadata.blades ?? "—"}/12</span>
        <span>Aspiration : {metadata.suction ?? "—"}/12</span>
        {metadata.comments && <span className="sm:col-span-2">Commentaires : {metadata.comments}</span>}
      </div>
    );
  }
  return null;
}

function StageMetadataDialog({
  step,
  onClose,
  onSaved,
}: {
  step: WorkflowStep;
  onClose: () => void;
  onSaved: (meta: any) => void;
}) {
  const initial = (step.row?.metadata as any) ?? {};
  const [meta, setMeta] = useState<any>(initial);
  const [saving, setSaving] = useState(false);

  const isManual = step.code === "debudding_manual";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Paramètres — {step.label}</DialogTitle>
          <DialogDescription>
            {isManual ? "Renseignez les détails du debudage manuel." : "Réglages du Mobius (0 à 12)."}
          </DialogDescription>
        </DialogHeader>
        {isManual ? (
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Type de debudage</Label>
              <Select value={meta.type ?? ""} onValueChange={(v) => setMeta({ ...meta, type: v })}>
                <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sec">À sec</SelectItem>
                  <SelectItem value="humide">Humide</SelectItem>
                  <SelectItem value="mixte">Mixte</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Nombre de personnes</Label>
                <Input type="number" min="0" value={meta.persons ?? ""} onChange={(e) => setMeta({ ...meta, persons: e.target.value ? Number(e.target.value) : null })} />
              </div>
              <div className="grid gap-2">
                <Label>Temps (minutes)</Label>
                <Input type="number" min="0" value={meta.duration ?? ""} onChange={(e) => setMeta({ ...meta, duration: e.target.value ? Number(e.target.value) : null })} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Commentaires</Label>
              <Textarea rows={3} value={meta.comments ?? ""} onChange={(e) => setMeta({ ...meta, comments: e.target.value })} />
            </div>
          </div>
        ) : (
          <div className="grid gap-4 py-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Inclinaison</Label>
                <Input value={meta.inclination ?? ""} onChange={(e) => setMeta({ ...meta, inclination: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Tumbler (0-12)</Label>
                <Input type="number" min="0" max="12" value={meta.tumbler ?? ""} onChange={(e) => setMeta({ ...meta, tumbler: e.target.value ? Number(e.target.value) : null })} />
              </div>
              <div className="grid gap-2">
                <Label>Lames (0-12)</Label>
                <Input type="number" min="0" max="12" value={meta.blades ?? ""} onChange={(e) => setMeta({ ...meta, blades: e.target.value ? Number(e.target.value) : null })} />
              </div>
              <div className="grid gap-2">
                <Label>Aspiration (0-12)</Label>
                <Input type="number" min="0" max="12" value={meta.suction ?? ""} onChange={(e) => setMeta({ ...meta, suction: e.target.value ? Number(e.target.value) : null })} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Commentaires</Label>
              <Textarea rows={3} value={meta.comments ?? ""} onChange={(e) => setMeta({ ...meta, comments: e.target.value })} />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button
            onClick={async () => { setSaving(true); await onSaved(meta); setSaving(false); }}
            disabled={saving}
          >
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
