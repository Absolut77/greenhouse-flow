import { useState } from "react";
import { Loader2 } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function DestructionFormDialog({
  open,
  onOpenChange,
  batchId,
  stageId,
  stageCode,
  stageLabel,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  batchId: string;
  stageId?: string | null;
  stageCode?: string | null;
  stageLabel?: string;
  onSaved?: () => void;
}) {
  const [weight, setWeight] = useState("");
  const [persons, setPersons] = useState("");
  const [products, setProducts] = useState("");
  const [duration, setDuration] = useState("");
  const [comments, setComments] = useState("");
  const [photos, setPhotos] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setWeight(""); setPersons(""); setProducts(""); setDuration(""); setComments(""); setPhotos("");
  };

  const submit = async () => {
    if (!weight || Number(weight) < 0) {
      toast.error("Le poids détruit est obligatoire");
      return;
    }
    setSaving(true);
    const { data: userRes } = await supabase.auth.getUser();
    const photoList = photos
      .split(/\s|,|\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    const { error } = await supabase.from("destructions" as any).insert({
      batch_id: batchId,
      stage_id: stageId ?? null,
      stage_code: stageCode ?? null,
      weight_grams: Number(weight),
      person_count: persons ? Number(persons) : null,
      sanitation_products: products.trim() || null,
      duration_minutes: duration ? Number(duration) : null,
      comments: comments.trim() || null,
      photos: photoList,
      created_by: userRes.user?.id ?? null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Destruction enregistrée");
    reset();
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Enregistrer une destruction</DialogTitle>
          {stageLabel && (
            <DialogDescription>Étape : {stageLabel}</DialogDescription>
          )}
        </DialogHeader>
        <div className="grid gap-4 py-2">
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
          <div className="grid gap-2">
            <Label>Produits de sanitation utilisés</Label>
            <Input value={products} onChange={(e) => setProducts(e.target.value)} />
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
            <Label>Photos (URLs, une par ligne)</Label>
            <Textarea rows={2} value={photos} onChange={(e) => setPhotos(e.target.value)} placeholder="https://..." />
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
