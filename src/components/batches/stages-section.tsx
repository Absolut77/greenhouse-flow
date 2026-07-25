import { useEffect, useState } from "react";
import { Plus, Loader2 } from "lucide-react";
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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Étapes</CardTitle>
        <Button size="sm" onClick={() => setOpen(true)}>
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <StageDialog
        batchId={batchId}
        open={open}
        onOpenChange={setOpen}
        onCreated={load}
      />
    </Card>
  );
}

function StageDialog({
  batchId,
  open,
  onOpenChange,
  onCreated,
}: {
  batchId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  const [stageType, setStageType] = useState("drying");
  const [startedAt, setStartedAt] = useState("");
  const [endedAt, setEndedAt] = useState("");
  const [operators, setOperators] = useState("");
  const [duration, setDuration] = useState("");
  const [comments, setComments] = useState("");
  const [settings, setSettings] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setStageType("drying");
    setStartedAt("");
    setEndedAt("");
    setOperators("");
    setDuration("");
    setComments("");
    setSettings("");
  };

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
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("batch_stages").insert({
      batch_id: batchId,
      stage_type: stageType,
      started_at: startedAt ? new Date(startedAt).toISOString() : null,
      ended_at: endedAt ? new Date(endedAt).toISOString() : null,
      operators_count: operators ? Number(operators) : null,
      duration_minutes: duration ? Number(duration) : null,
      comments: comments.trim() || null,
      settings: parsedSettings as never,
      created_by: userData.user?.id ?? null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Étape ajoutée");
    reset();
    onOpenChange(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nouvelle étape</DialogTitle>
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
              />
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
            Créer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { toLocalInput };
