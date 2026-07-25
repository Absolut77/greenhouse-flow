import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { Stage } from "@/lib/batch-workflow";

type DebuddingMeta = {
  hand_trim?: boolean;
  hand_trim_persons?: number | null;
  hand_trim_minutes?: number | null;
  mobius_inclination?: number | null;
  mobius_tumbler?: number | null;
  mobius_blades?: number | null;
  mobius_suction?: number | null;
  comments?: string;
};

export function DebuddingStepContent({
  stage,
  disabled,
  onSaved,
}: {
  stage: Stage | null;
  disabled: boolean;
  onSaved?: () => void;
}) {
  const initial: DebuddingMeta = (stage?.metadata as any) ?? {};
  const [handTrim, setHandTrim] = useState<boolean>(!!initial.hand_trim);
  const [persons, setPersons] = useState<string>(initial.hand_trim_persons?.toString() ?? "");
  const [minutes, setMinutes] = useState<string>(initial.hand_trim_minutes?.toString() ?? "");
  const [incl, setIncl] = useState<string>(initial.mobius_inclination?.toString() ?? "");
  const [tumbler, setTumbler] = useState<string>(initial.mobius_tumbler?.toString() ?? "");
  const [blades, setBlades] = useState<string>(initial.mobius_blades?.toString() ?? "");
  const [suction, setSuction] = useState<string>(initial.mobius_suction?.toString() ?? "");
  const [comments, setComments] = useState<string>(initial.comments ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const m: DebuddingMeta = (stage?.metadata as any) ?? {};
    setHandTrim(!!m.hand_trim);
    setPersons(m.hand_trim_persons?.toString() ?? "");
    setMinutes(m.hand_trim_minutes?.toString() ?? "");
    setIncl(m.mobius_inclination?.toString() ?? "");
    setTumbler(m.mobius_tumbler?.toString() ?? "");
    setBlades(m.mobius_blades?.toString() ?? "");
    setSuction(m.mobius_suction?.toString() ?? "");
    setComments(m.comments ?? "");
  }, [stage?.id]);

  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  const save = async () => {
    if (!stage) return;
    const check = (v: string, name: string) => {
      const n = num(v);
      if (n === null) return toast.error(`Mobius : ${name} obligatoire`);
      if (n < 0 || n > 12) return toast.error(`Mobius : ${name} entre 0 et 12`);
      return n;
    };
    const inclN = check(incl, "inclinaison");
    if (typeof inclN !== "number") return;
    const tumbN = check(tumbler, "tumbler");
    if (typeof tumbN !== "number") return;
    const bladN = check(blades, "lames");
    if (typeof bladN !== "number") return;
    const sucN = check(suction, "aspiration");
    if (typeof sucN !== "number") return;

    setSaving(true);
    const meta: DebuddingMeta = {
      hand_trim: handTrim,
      hand_trim_persons: handTrim ? num(persons) : null,
      hand_trim_minutes: handTrim ? num(minutes) : null,
      mobius_inclination: inclN,
      mobius_tumbler: tumbN,
      mobius_blades: bladN,
      mobius_suction: sucN,
      comments: comments.trim() || undefined,
    };
    const { error } = await supabase
      .from("batch_stages")
      .update({ metadata: meta as any })
      .eq("id", stage.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Paramètres enregistrés");
    onSaved?.();
  };

  return (
    <div className="space-y-5">
      <div className="rounded-md border p-4 space-y-3">
        <div className="flex items-center gap-3">
          <input
            id="hand-trim"
            type="checkbox"
            checked={handTrim}
            disabled={disabled}
            onChange={(e) => setHandTrim(e.target.checked)}
            className="h-4 w-4"
          />
          <Label htmlFor="hand-trim" className="cursor-pointer">Hand Trim effectué ?</Label>
        </div>
        {handTrim && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Nombre de personnes</Label>
              <Input type="number" min="0" value={persons} disabled={disabled} onChange={(e) => setPersons(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Temps (minutes)</Label>
              <Input type="number" min="0" value={minutes} disabled={disabled} onChange={(e) => setMinutes(e.target.value)} />
            </div>
          </div>
        )}
      </div>

      <div className="rounded-md border p-4 space-y-3">
        <p className="text-sm font-medium">Paramètres Mobius (obligatoires, 0-12)</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <NumField label="Inclinaison" value={incl} onChange={setIncl} disabled={disabled} />
          <NumField label="Vitesse tumbler" value={tumbler} onChange={setTumbler} disabled={disabled} />
          <NumField label="Vitesse des lames" value={blades} onChange={setBlades} disabled={disabled} />
          <NumField label="Puissance d'aspiration" value={suction} onChange={setSuction} disabled={disabled} />
        </div>
      </div>

      <div className="grid gap-2">
        <Label>Commentaires généraux</Label>
        <Textarea rows={3} value={comments} disabled={disabled} onChange={(e) => setComments(e.target.value)} />
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={save} disabled={saving || disabled}>
          {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
          Enregistrer les paramètres
        </Button>
      </div>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-2">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        min="0"
        max="12"
        step="0.1"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
