import { useEffect, useState } from "react";
import { Plus, Trash2, Loader2, TestTube2, Pencil } from "lucide-react";
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
  const [logOpen, setLogOpen] = useState(false);
  const [editing, setEditing] = useState<DryingLog | null>(null);
  const [sampleOpen, setSampleOpen] = useState(false);

  const load = async () => {
    const { data, error } = await supabase
      .from("drying_logs")
      .select("*")
      .eq("batch_id", batchId)
      .order("log_date", { ascending: false });
    if (error) toast.error(error.message);
    else setLogs(data ?? []);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  const remove = async (id: string) => {
    if (!confirm("Supprimer ce log ?")) return;
    const { error } = await supabase.from("drying_logs").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-medium">Prises de données</h4>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => setSampleOpen(true)}
          >
            <TestTube2 className="mr-1 h-4 w-4" /> Prise d'échantillon
          </Button>
          <Button
            size="sm"
            disabled={disabled}
            onClick={() => {
              setEditing(null);
              setLogOpen(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> Ajouter une prise
          </Button>
        </div>
      </div>

      {!logs ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement...
        </div>
      ) : logs.length === 0 ? (
        <p className="text-sm italic text-muted-foreground">
          Aucune prise de données pour le moment.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Temp. salle</TableHead>
                <TableHead>Hum. salle</TableHead>
                <TableHead>Temp. ext.</TableHead>
                <TableHead>Hum. ext.</TableHead>
                <TableHead>Commentaires</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{new Date(l.log_date).toLocaleDateString("fr-CA")}</TableCell>
                  <TableCell>{l.temp_current ?? "—"}</TableCell>
                  <TableCell>{l.humidity_current ?? "—"}</TableCell>
                  <TableCell>{l.temp_external ?? "—"}</TableCell>
                  <TableCell>{l.humidity_external ?? "—"}</TableCell>
                  <TableCell className="max-w-xs truncate">{l.comments ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={disabled}
                        onClick={() => {
                          setEditing(l);
                          setLogOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={disabled}
                        onClick={() => remove(l.id)}
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

      <DryingLogDialog
        key={editing?.id ?? "new"}
        batchId={batchId}
        log={editing}
        open={logOpen}
        onOpenChange={(o) => {
          setLogOpen(o);
          if (!o) setEditing(null);
        }}
        onSaved={load}
      />

      <SampleDialog
        open={sampleOpen}
        onOpenChange={setSampleOpen}
        batchId={batchId}
        stageId={stageId}
        stageCode="drying"
        onSaved={() => {
          onDestructionCreated?.();
        }}
      />
    </div>
  );
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
          <DialogTitle>{log ? "Modifier la prise" : "Nouvelle prise de séchage"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Date *</Label>
            <Input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
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

export function SampleDialog({
  open,
  onOpenChange,
  batchId,
  stageId,
  stageCode,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  batchId: string;
  stageId: string | null;
  stageCode: "drying" | "curing";
  onSaved?: () => void;
}) {
  const [kind, setKind] = useState<"aqualab" | "sartorius">("aqualab");
  const [weight, setWeight] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setWeight("");
      setNotes("");
      setKind("aqualab");
    }
  }, [open]);

  const submit = async () => {
    const w = Number(weight);
    if (!w || w <= 0) return toast.error("Poids > 0 obligatoire");
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const label = kind === "aqualab" ? "Aqualab" : "Sartorius";
    const { error } = await (supabase as any).from("destructions").insert({
      batch_id: batchId,
      stage_id: stageId,
      stage_code: stageCode,
      weight_grams: w,
      reason: `sample_${kind}`,
      comments: notes.trim() ? `Échantillon ${label} — ${notes.trim()}` : `Échantillon ${label}`,
      is_sanitation_log: false,
      created_by: u.user?.id ?? null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Échantillon ${label} enregistré et déduit (${w} g)`);
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Prise d'échantillon</DialogTitle>
          <DialogDescription>
            Le poids sera automatiquement déduit de la récolte et loggé comme destruction.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Type d'échantillon</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={kind === "aqualab" ? "default" : "outline"}
                onClick={() => setKind("aqualab")}
              >
                Aqualab
              </Button>
              <Button
                type="button"
                size="sm"
                variant={kind === "sartorius" ? "default" : "outline"}
                onClick={() => setKind("sartorius")}
              >
                Sartorius
              </Button>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Poids exact (g) *</Label>
            <Input type="number" step="0.001" min="0" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </div>
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
