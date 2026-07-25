import { useEffect, useState } from "react";
import { Plus, Trash2, Loader2, TestTube2, Pencil, FlaskConical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type DryingLog = Tables<"drying_logs">;
type Sample = Tables<"samples">;

export function DryingStepContent({
  batchId,
  stageId,
  disabled,
  onDestructionCreated,
}: {
  batchId: string;
  stageId: string | null;
  disabled: boolean;
  onDestructionCreated?: () => void;
}) {
  const [logs, setLogs] = useState<DryingLog[] | null>(null);
  const [samples, setSamples] = useState<Sample[] | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<DryingLog | null>(null);
  const [sampleOpen, setSampleOpen] = useState(false);
  const [editingSample, setEditingSample] = useState<Sample | null>(null);
  const [analysisFor, setAnalysisFor] = useState<Sample | null>(null);

  const loadLogs = async () => {
    const { data } = await supabase
      .from("drying_logs")
      .select("*")
      .eq("batch_id", batchId)
      .order("log_date", { ascending: false });
    setLogs(data ?? []);
  };
  const loadSamples = async () => {
    const { data } = await supabase
      .from("samples")
      .select("*")
      .eq("batch_id", batchId)
      .eq("sample_type", "drying")
      .order("sample_date", { ascending: false });
    setSamples(data ?? []);
  };
  const reload = () => Promise.all([loadLogs(), loadSamples()]);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  const removeLog = async (id: string) => {
    if (!confirm("Supprimer cette prise ?")) return;
    const { error } = await supabase.from("drying_logs").delete().eq("id", id);
    if (error) return toast.error(error.message);
    loadLogs();
  };
  const removeSample = async (s: Sample) => {
    if (!confirm("Supprimer cet échantillon ? (la destruction associée reste)")) return;
    const { error } = await supabase.from("samples").delete().eq("id", s.id);
    if (error) return toast.error(error.message);
    loadSamples();
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {/* LEFT: room specs */}
        <div className="rounded-md border">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <h4 className="text-sm font-medium">Specs de la salle</h4>
            <Button
              size="sm"
              disabled={disabled}
              onClick={() => { setEditingLog(null); setLogOpen(true); }}
            >
              <Plus className="mr-1 h-4 w-4" /> Ajouter
            </Button>
          </div>
          {!logs ? (
            <Loading />
          ) : logs.length === 0 ? (
            <Empty text="Aucune prise de spec." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Salle</TableHead>
                  <TableHead>T° / H% salle</TableHead>
                  <TableHead>T° / H% ext.</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>{new Date(l.log_date).toLocaleDateString("fr-CA")}</TableCell>
                    <TableCell>{l.room_number ?? "—"}</TableCell>
                    <TableCell>{fmtTH(l.temp_current, l.humidity_current)}</TableCell>
                    <TableCell>{fmtTH(l.temp_external, l.humidity_external)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" disabled={disabled} onClick={() => { setEditingLog(l); setLogOpen(true); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" disabled={disabled} onClick={() => removeLog(l.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* RIGHT: sample takes */}
        <div className="rounded-md border">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <h4 className="text-sm font-medium">Prises d'échantillons</h4>
            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => { setEditingSample(null); setSampleOpen(true); }}
            >
              <TestTube2 className="mr-1 h-4 w-4" /> Ajouter
            </Button>
          </div>
          {!samples ? (
            <Loading />
          ) : samples.length === 0 ? (
            <Empty text="Aucun échantillon." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Poids (g)</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Résultats d'analyse</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {samples.map((s) => (
                  <TableRow
                    key={s.id}
                    onDoubleClick={() => !disabled && setAnalysisFor(s)}
                    className="cursor-pointer"
                    title="Double-cliquez pour saisir/modifier les résultats"
                  >
                    <TableCell>{new Date(s.sample_date).toLocaleDateString("fr-CA")}</TableCell>
                    <TableCell>{s.weight_grams ?? "—"}</TableCell>
                    <TableCell className="max-w-[180px] truncate">{s.notes ?? "—"}</TableCell>
                    <TableCell className="max-w-[260px]"><AnalysisCell sample={s} /></TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" disabled={disabled} onClick={() => setAnalysisFor(s)}>
                          <FlaskConical className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" disabled={disabled} onClick={() => removeSample(s)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      <DryingLogDialog
        key={editingLog?.id ?? "new-log"}
        batchId={batchId}
        log={editingLog}
        open={logOpen}
        onOpenChange={(o) => { setLogOpen(o); if (!o) setEditingLog(null); }}
        onSaved={loadLogs}
      />

      <SampleDialog
        open={sampleOpen}
        onOpenChange={(o) => { setSampleOpen(o); if (!o) setEditingSample(null); }}
        batchId={batchId}
        stageId={stageId}
        stageCode="drying"
        onSaved={() => { loadSamples(); onDestructionCreated?.(); }}
      />

      <AnalysisDialog
        key={analysisFor?.id ?? "no-analysis"}
        sample={analysisFor}
        open={!!analysisFor}
        onOpenChange={(o) => { if (!o) setAnalysisFor(null); }}
        onSaved={loadSamples}
        disabled={disabled}
      />
    </div>
  );
}

function fmtTH(t?: number | null, h?: number | null) {
  if (t == null && h == null) return "—";
  return `${t ?? "—"}°C / ${h ?? "—"}%`;
}
function Loading() {
  return <div className="p-3 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Chargement...</div>;
}
function Empty({ text }: { text: string }) {
  return <p className="p-3 text-sm italic text-muted-foreground">{text}</p>;
}

function DryingLogDialog({
  batchId,
  log,
  open,
  onOpenChange,
  onSaved,
}: {
  batchId: string;
  log: DryingLog | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [logDate, setLogDate] = useState(log?.log_date ?? today);
  const [room, setRoom] = useState(log?.room_number ?? "");
  const [tempCur, setTempCur] = useState(log?.temp_current?.toString() ?? "");
  const [humCur, setHumCur] = useState(log?.humidity_current?.toString() ?? "");
  const [tempExt, setTempExt] = useState(log?.temp_external?.toString() ?? "");
  const [humExt, setHumExt] = useState(log?.humidity_external?.toString() ?? "");
  const [comments, setComments] = useState(log?.comments ?? "");
  const [saving, setSaving] = useState(false);

  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  const submit = async () => {
    if (!logDate) return toast.error("Date obligatoire");
    setSaving(true);
    const payload = {
      log_date: logDate,
      room_number: room.trim() || null,
      temp_current: num(tempCur),
      humidity_current: num(humCur),
      temp_external: num(tempExt),
      humidity_external: num(humExt),
      comments: comments.trim() || null,
    };
    let error;
    if (log) {
      ({ error } = await supabase.from("drying_logs").update(payload).eq("id", log.id));
    } else {
      const { data: u } = await supabase.auth.getUser();
      ({ error } = await supabase.from("drying_logs").insert({
        ...payload,
        batch_id: batchId,
        created_by: u.user?.id ?? null,
      }));
    }
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(log ? "Prise mise à jour" : "Prise ajoutée");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{log ? "Modifier la prise" : "Nouvelle prise de spec"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Date *</Label>
              <Input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Numéro de salle</Label>
              <Input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="Ex. D-2" />
            </div>
            <div className="grid gap-2">
              <Label>Température salle (°C)</Label>
              <Input type="number" step="0.1" value={tempCur} onChange={(e) => setTempCur(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Humidité salle (%)</Label>
              <Input type="number" step="0.1" value={humCur} onChange={(e) => setHumCur(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Température extérieure (°C)</Label>
              <Input type="number" step="0.1" value={tempExt} onChange={(e) => setTempExt(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Humidité extérieure (%)</Label>
              <Input type="number" step="0.1" value={humExt} onChange={(e) => setHumExt(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Commentaires</Label>
            <Textarea rows={2} value={comments} onChange={(e) => setComments(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Sample take dialog. For drying: creates a sample row + a fresh destruction (weight deducted).
 * For curing: also picks a container.
 */
export function SampleDialog({
  open,
  onOpenChange,
  batchId,
  stageId,
  stageCode,
  containers,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  batchId: string;
  stageId: string | null;
  stageCode: "drying" | "curing";
  containers?: { id: string; label: string; content: string | null }[];
  onSaved?: () => void;
}) {
  const [weight, setWeight] = useState("");
  const [notes, setNotes] = useState("");
  const [containerId, setContainerId] = useState<string>("");
  const [filterContent, setFilterContent] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setWeight(""); setNotes(""); setContainerId(""); setFilterContent("");
    }
  }, [open]);

  const contents = Array.from(new Set((containers ?? []).map((c) => c.content).filter(Boolean))) as string[];
  const filteredContainers = (containers ?? []).filter((c) => !filterContent || c.content === filterContent);

  const submit = async () => {
    const w = Number(weight);
    if (!w || w <= 0) return toast.error("Poids > 0 obligatoire");
    if (stageCode === "curing" && !containerId) return toast.error("Sélectionnez un conteneur");
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const nowIso = new Date().toISOString().slice(0, 10);
    const { error: sErr } = await supabase.from("samples").insert({
      batch_id: batchId,
      stage_id: stageId,
      sample_type: stageCode,
      sample_date: nowIso,
      weight_grams: w,
      is_destruction: true,
      container_id: stageCode === "curing" ? containerId : null,
      notes: notes.trim() || null,
      created_by: u.user?.id ?? null,
    } as any);
    if (sErr) { setSaving(false); return toast.error(sErr.message); }

    const { error: dErr } = await (supabase as any).from("destructions").insert({
      batch_id: batchId,
      stage_id: stageId,
      stage_code: stageCode,
      weight_grams: w,
      reason: `sample_${stageCode}`,
      comments: notes.trim() ? `Prise d'échantillon — ${notes.trim()}` : `Prise d'échantillon`,
      is_sanitation_log: false,
      created_by: u.user?.id ?? null,
    });

    // Deduct from container in curing
    if (stageCode === "curing" && containerId) {
      await (supabase as any).rpc; // no-op placeholder to keep typing
      const { data: c } = await (supabase as any)
        .from("curing_containers")
        .select("weight_in_grams")
        .eq("id", containerId)
        .maybeSingle();
      if (c) {
        await (supabase as any)
          .from("curing_containers")
          .update({ weight_in_grams: Math.max(0, Number(c.weight_in_grams || 0) - w) })
          .eq("id", containerId);
      }
    }

    setSaving(false);
    if (dErr) toast.error(dErr.message);
    else toast.success(`Échantillon enregistré (${w} g déduit)`);
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Prise d'échantillon</DialogTitle>
          <DialogDescription>
            Le poids sera automatiquement déduit et loggé comme destruction (fresh).
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Poids exact (g) *</Label>
            <Input type="number" step="0.001" min="0" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </div>
          {stageCode === "curing" && (
            <>
              {contents.length > 0 && (
                <div className="grid gap-2">
                  <Label>Filtrer par type de fleur</Label>
                  <select
                    value={filterContent}
                    onChange={(e) => { setFilterContent(e.target.value); setContainerId(""); }}
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="">Tous</option>
                    {contents.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}
              <div className="grid gap-2">
                <Label>Conteneur *</Label>
                <select
                  value={containerId}
                  onChange={(e) => setContainerId(e.target.value)}
                  className="h-10 rounded-md border bg-background px-3 text-sm"
                >
                  <option value="">— Sélectionner —</option>
                  {filteredContainers.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}{c.content ? ` — ${c.content}` : ""}</option>
                  ))}
                </select>
              </div>
            </>
          )}
          <div className="grid gap-2">
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AnalysisDialog({
  sample,
  open,
  onOpenChange,
  onSaved,
  disabled,
}: {
  sample: Sample | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
  disabled?: boolean;
}) {
  const [analysisWeight, setAnalysisWeight] = useState<string>(sample?.analysis_weight_grams?.toString() ?? "");
  const [entries, setEntries] = useState<{ key: string; value: string }[]>(() => {
    const d = (sample?.analysis_data as any) ?? {};
    return Object.entries(d).map(([k, v]) => ({ key: k, value: String(v) }));
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setAnalysisWeight(sample?.analysis_weight_grams?.toString() ?? "");
    const d = (sample?.analysis_data as any) ?? {};
    setEntries(Object.entries(d).map(([k, v]) => ({ key: k, value: String(v) })));
  }, [sample?.id]);

  const save = async () => {
    if (!sample) return;
    const data: Record<string, string> = {};
    entries.forEach((e) => { if (e.key.trim()) data[e.key.trim()] = e.value; });
    setSaving(true);
    const { error } = await supabase
      .from("samples")
      .update({
        analysis_weight_grams: analysisWeight.trim() === "" ? null : Number(analysisWeight),
        analysis_data: Object.keys(data).length ? (data as any) : null,
      } as any)
      .eq("id", sample.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Analyse enregistrée");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Résultats d'analyse</DialogTitle>
          <DialogDescription>Poids utilisé et valeurs mesurées.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Poids utilisé (g)</Label>
            <Input type="number" step="0.001" value={analysisWeight} disabled={disabled} onChange={(e) => setAnalysisWeight(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Valeurs</Label>
            {entries.map((e, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <Input placeholder="Ex. Humidité" value={e.key} disabled={disabled}
                  onChange={(ev) => setEntries((arr) => arr.map((x, ix) => ix === i ? { ...x, key: ev.target.value } : x))} />
                <Input placeholder="Ex. 11.2%" value={e.value} disabled={disabled}
                  onChange={(ev) => setEntries((arr) => arr.map((x, ix) => ix === i ? { ...x, value: ev.target.value } : x))} />
                <Button variant="ghost" size="icon" disabled={disabled}
                  onClick={() => setEntries((arr) => arr.filter((_, ix) => ix !== i))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" disabled={disabled}
              onClick={() => setEntries((arr) => [...arr, { key: "", value: "" }])}>
              <Plus className="mr-1 h-4 w-4" /> Ajouter une valeur
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Fermer</Button>
          <Button onClick={save} disabled={saving || disabled}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
