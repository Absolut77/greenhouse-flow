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
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type DryingLog = Tables<"drying_logs">;

export function DryingLogsSection({ batchId }: { batchId: string }) {
  const [logs, setLogs] = useState<DryingLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DryingLog | null>(null);
  const [toDelete, setToDelete] = useState<DryingLog | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setError(null);
    const { data, error } = await supabase
      .from("drying_logs")
      .select("*")
      .eq("batch_id", batchId)
      .order("log_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setLogs(data ?? []);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    const { error } = await supabase
      .from("drying_logs")
      .delete()
      .eq("id", toDelete.id);
    setDeleting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Log supprimé");
    setToDelete(null);
    load();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Logs de séchage</CardTitle>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="mr-1 h-4 w-4" /> Ajouter un log
        </Button>
      </CardHeader>
      <CardContent>
        {error && <p className="text-destructive text-sm">{error}</p>}
        {!error && logs === null && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement...
          </div>
        )}
        {logs && logs.length === 0 && (
          <p className="text-sm italic text-muted-foreground">
            Aucun log de séchage.
          </p>
        )}
        {logs && logs.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Salle</TableHead>
                  <TableHead>Temp. act.</TableHead>
                  <TableHead>Hum. act.</TableHead>
                  <TableHead>SP Temp</TableHead>
                  <TableHead>SP Hum.</TableHead>
                  <TableHead>Temp. ext.</TableHead>
                  <TableHead>Hum. ext.</TableHead>
                  <TableHead>Commentaires</TableHead>
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      {new Date(l.log_date).toLocaleDateString("fr-CA")}
                    </TableCell>
                    <TableCell>{l.room_number ?? "—"}</TableCell>
                    <TableCell>{l.temp_current ?? "—"}</TableCell>
                    <TableCell>{l.humidity_current ?? "—"}</TableCell>
                    <TableCell>{l.temp_setpoint ?? "—"}</TableCell>
                    <TableCell>{l.humidity_setpoint ?? "—"}</TableCell>
                    <TableCell>{l.temp_external ?? "—"}</TableCell>
                    <TableCell>{l.humidity_external ?? "—"}</TableCell>
                    <TableCell className="max-w-xs truncate">
                      {l.comments ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setEditing(l);
                            setOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setToDelete(l)}
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

      <DryingLogDialog
        key={editing?.id ?? "new"}
        batchId={batchId}
        log={editing}
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
            <AlertDialogTitle>Supprimer ce log ?</AlertDialogTitle>
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
  const [tempSp, setTempSp] = useState(log?.temp_setpoint?.toString() ?? "");
  const [humSp, setHumSp] = useState(log?.humidity_setpoint?.toString() ?? "");
  const [tempExt, setTempExt] = useState(log?.temp_external?.toString() ?? "");
  const [humExt, setHumExt] = useState(log?.humidity_external?.toString() ?? "");
  const [comments, setComments] = useState(log?.comments ?? "");
  const [saving, setSaving] = useState(false);

  const isEdit = !!log;
  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  const submit = async () => {
    if (!logDate) {
      toast.error("La date est obligatoire");
      return;
    }
    setSaving(true);
    const payload = {
      log_date: logDate,
      room_number: room.trim() || null,
      temp_current: num(tempCur),
      humidity_current: num(humCur),
      temp_setpoint: num(tempSp),
      humidity_setpoint: num(humSp),
      temp_external: num(tempExt),
      humidity_external: num(humExt),
      comments: comments.trim() || null,
    };
    let error;
    if (isEdit && log) {
      ({ error } = await supabase
        .from("drying_logs")
        .update(payload)
        .eq("id", log.id));
    } else {
      const { data: userData } = await supabase.auth.getUser();
      ({ error } = await supabase.from("drying_logs").insert({
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
    toast.success(isEdit ? "Log mis à jour" : "Log ajouté");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Modifier le log" : "Nouveau log de séchage"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Date *</Label>
              <Input
                type="date"
                value={logDate}
                onChange={(e) => setLogDate(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Numéro de salle</Label>
              <Input value={room} onChange={(e) => setRoom(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Température actuelle (°C)" value={tempCur} onChange={setTempCur} />
            <Field label="Humidité actuelle (%)" value={humCur} onChange={setHumCur} />
            <Field label="Setpoint température (°C)" value={tempSp} onChange={setTempSp} />
            <Field label="Setpoint humidité (%)" value={humSp} onChange={setHumSp} />
            <Field label="Température extérieure (°C)" value={tempExt} onChange={setTempExt} />
            <Field label="Humidité extérieure (%)" value={humExt} onChange={setHumExt} />
          </div>
          <div className="grid gap-2">
            <Label>Commentaires</Label>
            <Textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              rows={2}
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

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        step="0.1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
