import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { PhotoUploader } from "@/components/batches/photo-uploader";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type DestructionFormMode = "destruction" | "sanitation";

export function DestructionFormDialog({
  open,
  onOpenChange,
  batchId,
  stageId,
  stageCode,
  stageLabel,
  mode = "destruction",
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  batchId: string;
  stageId?: string | null;
  stageCode?: string | null;
  stageLabel?: string;
  mode?: DestructionFormMode;
  onSaved?: () => void;
}) {
  const [weight, setWeight] = useState("");
  const [persons, setPersons] = useState("");
  const [sanitationType, setSanitationType] = useState<string>("");
  const [products, setProducts] = useState("");
  const [duration, setDuration] = useState("");
  const [comments, setComments] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [newPhoto, setNewPhoto] = useState("");
  const [saving, setSaving] = useState(false);

  const isSanitationLog = mode === "sanitation";
  const title = isSanitationLog ? "Log de sanitation" : "Enregistrer une destruction";

  const reset = () => {
    setWeight(""); setPersons(""); setSanitationType(""); setProducts("");
    setDuration(""); setComments(""); setPhotos([]); setNewPhoto("");
  };

  useEffect(() => {
    if (!open) reset();
  }, [open]);

  const addPhoto = () => {
    const v = newPhoto.trim();
    if (!v) return;
    setPhotos((p) => [...p, v]);
    setNewPhoto("");
  };

  const submit = async () => {
    if (!isSanitationLog && (!weight || Number(weight) <= 0)) {
      toast.error("Le poids détruit doit être supérieur à 0");
      return;
    }
    if (!sanitationType) {
      toast.error("Le type de sanitation est obligatoire");
      return;
    }
    setSaving(true);
    const { data: userRes } = await supabase.auth.getUser();
    const { error } = await (supabase as any).from("destructions").insert({
      batch_id: batchId,
      stage_id: stageId ?? null,
      stage_code: stageCode ?? null,
      weight_grams: isSanitationLog ? 0 : Number(weight),
      person_count: persons ? Number(persons) : null,
      sanitation_type: sanitationType,
      sanitation_products: products.trim() || null,
      duration_minutes: duration ? Number(duration) : null,
      comments: comments.trim() || null,
      photos,
      is_sanitation_log: isSanitationLog,
      created_by: userRes.user?.id ?? null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(isSanitationLog ? "Log de sanitation enregistré" : "Destruction enregistrée");
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {stageLabel && <DialogDescription>Étape : {stageLabel}</DialogDescription>}
        </DialogHeader>
        <div className="grid gap-4 py-2">
          {!isSanitationLog && (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Poids récupéré (g) *</Label>
                <Input type="number" step="0.01" min="0" value={weight} onChange={(e) => setWeight(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Nombre de personnes</Label>
                <Input type="number" min="0" value={persons} onChange={(e) => setPersons(e.target.value)} />
              </div>
            </div>
          )}
          {isSanitationLog && (
            <div className="grid gap-2">
              <Label>Nombre de personnes</Label>
              <Input type="number" min="0" value={persons} onChange={(e) => setPersons(e.target.value)} />
            </div>
          )}
          <div className="grid gap-2">
            <Label>Type de sanitation *</Label>
            <Select value={sanitationType} onValueChange={setSanitationType}>
              <SelectTrigger><SelectValue placeholder="Soft ou Full" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="soft">Soft</SelectItem>
                <SelectItem value="full">Full</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Produits utilisés</Label>
            <Input
              value={products}
              onChange={(e) => setProducts(e.target.value)}
              placeholder="Ex. alcool 70%, détergent, peroxyde…"
            />
          </div>
          <div className="grid gap-2">
            <Label>Temps (minutes)</Label>
            <Input type="number" min="0" value={duration} onChange={(e) => setDuration(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Commentaires</Label>
            <Textarea rows={3} value={comments} onChange={(e) => setComments(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Photos (URLs)</Label>
            <div className="flex gap-2">
              <Input
                value={newPhoto}
                onChange={(e) => setNewPhoto(e.target.value)}
                placeholder="https://..."
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPhoto(); } }}
              />
              <Button type="button" variant="outline" onClick={addPhoto}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {photos.length > 0 && (
              <ul className="mt-1 space-y-1">
                {photos.map((p, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 rounded bg-muted/40 px-2 py-1 text-xs">
                    <span className="truncate">{p}</span>
                    <Button
                      type="button" size="icon" variant="ghost"
                      className="h-6 w-6"
                      onClick={() => setPhotos((all) => all.filter((_, idx) => idx !== i))}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
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
