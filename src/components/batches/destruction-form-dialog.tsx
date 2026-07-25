import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
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

/** Seuil au-delà duquel une destruction déclenche l'étape de confirmation. */
export const DESTRUCTION_CONFIRM_THRESHOLD_G = 100;

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
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [confirmed, setConfirmed] = useState(false);

  const isSanitationLog = mode === "sanitation";
  const title = isSanitationLog ? "Log de sanitation" : "Enregistrer une destruction";

  const reset = () => {
    setWeight(""); setPersons(""); setSanitationType(""); setProducts("");
    setDuration(""); setComments(""); setPhotos([]);
    setStep("form"); setConfirmed(false);
  };

  useEffect(() => {
    if (!open) reset();
  }, [open]);

  const weightNum = Number(weight) || 0;
  const needsConfirmStep =
    !isSanitationLog && weightNum > DESTRUCTION_CONFIRM_THRESHOLD_G;

  const validate = (): boolean => {
    if (!isSanitationLog && (!weight || weightNum <= 0)) {
      toast.error("Le poids détruit doit être supérieur à 0");
      return false;
    }
    if (!sanitationType) {
      toast.error("Le type de sanitation est obligatoire");
      return false;
    }
    return true;
  };

  const handlePrimary = () => {
    if (!validate()) return;
    if (needsConfirmStep && step === "form") {
      setConfirmed(false);
      setStep("confirm");
      return;
    }
    void submit();
  };

  const submit = async () => {
    setSaving(true);
    const { data: userRes } = await supabase.auth.getUser();
    const { error } = await (supabase as any).from("destructions").insert({
      batch_id: batchId,
      stage_id: stageId ?? null,
      stage_code: stageCode ?? null,
      weight_grams: isSanitationLog ? 0 : weightNum,
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
          <DialogTitle>
            {step === "confirm" ? "Confirmer la destruction" : title}
          </DialogTitle>
          {stageLabel && step === "form" && (
            <DialogDescription>Étape : {stageLabel}</DialogDescription>
          )}
        </DialogHeader>

        {step === "form" && (
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
              <Label>Photos</Label>
              <PhotoUploader
                batchId={batchId}
                value={photos}
                onChange={setPhotos}
                folder={isSanitationLog ? "sanitations" : "destructions"}
              />
            </div>
            {needsConfirmStep && (
              <div className="text-xs text-amber-300/90">
                ⚠ Destruction &gt; {DESTRUCTION_CONFIRM_THRESHOLD_G} g — une étape de confirmation sera demandée.
              </div>
            )}
          </div>
        )}

        {step === "confirm" && (
          <div className="grid gap-4 py-2">
            <div className="rounded-md border bg-muted/30 p-4 space-y-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Récapitulatif</div>
              <div className="flex justify-between text-sm border-b border-border/50 pb-2">
                <span className="text-muted-foreground">Poids détruit</span>
                <span className="font-semibold tabular-nums text-destructive">
                  {weightNum.toFixed(2)} g
                </span>
              </div>
              {stageLabel && (
                <div className="flex justify-between text-sm border-b border-border/50 pb-2">
                  <span className="text-muted-foreground">Étape</span>
                  <span className="font-medium">{stageLabel}</span>
                </div>
              )}
              <div className="flex justify-between text-sm border-b border-border/50 pb-2">
                <span className="text-muted-foreground">Sanitation</span>
                <span className="font-medium capitalize">{sanitationType}</span>
              </div>
              {persons && (
                <div className="flex justify-between text-sm border-b border-border/50 pb-2">
                  <span className="text-muted-foreground">Personnes</span>
                  <span className="font-medium">{persons}</span>
                </div>
              )}
              {products.trim() && (
                <div className="flex justify-between text-sm border-b border-border/50 pb-2">
                  <span className="text-muted-foreground">Produits</span>
                  <span className="font-medium text-right">{products.trim()}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Photos</span>
                <span className="font-medium">{photos.length}</span>
              </div>
            </div>

            <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                Destruction importante (&gt; {DESTRUCTION_CONFIRM_THRESHOLD_G} g). Cette action est <b>définitive</b> et sera tracée dans le journal.
              </div>
            </div>

            <label className="flex items-start gap-3 cursor-pointer rounded-md border p-3 hover:bg-muted/30">
              <Checkbox
                checked={confirmed}
                onCheckedChange={(v) => setConfirmed(v === true)}
                className="mt-0.5"
              />
              <span className="text-sm">Je confirme que les quantités sont exactes.</span>
            </label>
          </div>
        )}

        <DialogFooter>
          {step === "form" ? (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button>
              <Button onClick={handlePrimary} disabled={saving}>
                {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                {needsConfirmStep ? "Continuer →" : "Enregistrer"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setStep("form")} disabled={saving}>
                ← Retour
              </Button>
              <Button onClick={submit} disabled={saving || !confirmed}>
                {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Confirmer la destruction
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
