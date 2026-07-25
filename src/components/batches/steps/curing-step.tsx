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
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { SampleDialog } from "./drying-step";

type Container = {
  id: string;
  batch_id: string;
  stage_id: string | null;
  label: string;
  content: string | null;
  weight_in_grams: number;
  weight_out_grams: number | null;
  notes: string | null;
  created_at: string;
};

const CONTENT_OPTIONS = ["Flower Big", "Flower Medium", "Flower Small", "Hand Trim", "Trim"];

export function CuringStepContent({
  batchId,
  stageId,
  disabled,
  onSampleCreated,
}: {
  batchId: string;
  stageId: string | null;
  disabled: boolean;
  onSampleCreated?: () => void;
}) {
  const [rows, setRows] = useState<Container[] | null>(null);
  const [editing, setEditing] = useState<Container | null>(null);
  const [open, setOpen] = useState(false);
  const [sampleOpen, setSampleOpen] = useState(false);

  const load = async () => {
    const { data, error } = await (supabase as any)
      .from("curing_containers")
      .select("*")
      .eq("batch_id", batchId)
      .order("created_at", { ascending: true });
    if (error) toast.error(error.message);
    else setRows((data ?? []) as Container[]);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  const remove = async (id: string) => {
    if (!confirm("Supprimer ce conteneur ?")) return;
    const { error } = await (supabase as any).from("curing_containers").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const totalIn = (rows ?? []).reduce((s, r) => s + Number(r.weight_in_grams || 0), 0);
  const totalOut = (rows ?? []).reduce(
    (s, r) => s + (r.weight_out_grams != null ? Number(r.weight_out_grams) : 0),
    0,
  );
  const allOut = rows && rows.length > 0 && rows.every((r) => r.weight_out_grams != null);
  const loss = allOut ? totalIn - totalOut : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-medium">Conteneurs de curing</h4>
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
              setOpen(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> Ajouter un conteneur
          </Button>
        </div>
      </div>

      {!rows ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement...
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm italic text-muted-foreground">
          Aucun conteneur pour le moment. Créez-en un pour commencer.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Contenu</TableHead>
                <TableHead className="text-right">Poids entrée (g)</TableHead>
                <TableHead className="text-right">Poids sortie (g)</TableHead>
                <TableHead className="text-right">Loss (g)</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const l =
                  r.weight_out_grams != null
                    ? Number(r.weight_in_grams) - Number(r.weight_out_grams)
                    : null;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.label}</TableCell>
                    <TableCell>{r.content ?? "—"}</TableCell>
                    <TableCell className="text-right">{Number(r.weight_in_grams).toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      {r.weight_out_grams != null ? Number(r.weight_out_grams).toFixed(2) : "—"}
                    </TableCell>
                    <TableCell className={`text-right ${l != null && l > 0 ? "text-amber-500" : ""}`}>
                      {l != null ? l.toFixed(2) : "—"}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">{r.notes ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={disabled}
                          onClick={() => {
                            setEditing(r);
                            setOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={disabled}
                          onClick={() => remove(r.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Total entrée" value={`${totalIn.toFixed(2)} g`} />
          <StatCard label="Total sortie" value={allOut ? `${totalOut.toFixed(2)} g` : "En attente"} />
          <StatCard
            label="Processing loss"
            value={loss != null ? `${loss.toFixed(2)} g` : "—"}
            tone={loss != null && loss > 0 ? "warn" : undefined}
          />
        </div>
      )}

      <ContainerDialog
        key={editing?.id ?? "new"}
        batchId={batchId}
        stageId={stageId}
        container={editing}
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setEditing(null);
        }}
        onSaved={load}
      />

      <SampleDialog
        open={sampleOpen}
        onOpenChange={setSampleOpen}
        batchId={batchId}
        stageId={stageId}
        stageCode="curing"
        onSaved={() => onSampleCreated?.()}
      />
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold ${tone === "warn" ? "text-amber-500" : ""}`}>{value}</div>
    </div>
  );
}

function ContainerDialog({
  batchId,
  stageId,
  container,
  open,
  onOpenChange,
  onSaved,
}: {
  batchId: string;
  stageId: string | null;
  container: Container | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState(container?.label ?? "");
  const [content, setContent] = useState(container?.content ?? "");
  const [wIn, setWIn] = useState(container?.weight_in_grams?.toString() ?? "");
  const [wOut, setWOut] = useState(container?.weight_out_grams?.toString() ?? "");
  const [notes, setNotes] = useState(container?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!label.trim()) return toast.error("Label obligatoire");
    const wInN = Number(wIn);
    if (!wIn || wInN < 0) return toast.error("Poids d'entrée invalide");
    setSaving(true);
    const payload: any = {
      label: label.trim(),
      content: content || null,
      weight_in_grams: wInN,
      weight_out_grams: wOut.trim() === "" ? null : Number(wOut),
      notes: notes.trim() || null,
    };
    let error;
    if (container) {
      ({ error } = await (supabase as any)
        .from("curing_containers")
        .update(payload)
        .eq("id", container.id));
    } else {
      const { data: u } = await supabase.auth.getUser();
      ({ error } = await (supabase as any).from("curing_containers").insert({
        ...payload,
        batch_id: batchId,
        stage_id: stageId,
        created_by: u.user?.id ?? null,
      }));
    }
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(container ? "Conteneur mis à jour" : "Conteneur créé");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{container ? "Modifier le conteneur" : "Nouveau conteneur"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Label / Identifiant *</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex. C-01" />
          </div>
          <div className="grid gap-2">
            <Label>Contenu</Label>
            <select
              value={content ?? ""}
              onChange={(e) => setContent(e.target.value)}
              className="h-10 rounded-md border bg-background px-3 text-sm"
            >
              <option value="">— Sélectionner —</option>
              {CONTENT_OPTIONS.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Poids entrée (g) *</Label>
              <Input type="number" step="0.01" min="0" value={wIn} onChange={(e) => setWIn(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Poids sortie (g)</Label>
              <Input type="number" step="0.01" min="0" value={wOut} onChange={(e) => setWOut(e.target.value)} />
            </div>
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
