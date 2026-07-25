import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/batches_/new")({
  head: () => ({ meta: [{ title: "Nouvelle Batch — ONO Cannabis" }] }),
  component: NewBatchPage,
});

function NewBatchPage() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const todayIso = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    batch_number: "",
    strain: "",
    plant_count: "",
    total_harvest_weight: "",
    harvest_date: "",
    harvest_room: "",
    drying_location: "",
    drying_start_date: todayIso, // = date d'entrée en séchage = date de création
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const update = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.batch_number.trim()) errs.batch_number = "Requis";
    if (!form.strain.trim()) errs.strain = "Requis";
    if (!form.drying_start_date) errs.drying_start_date = "Requis";
    if (form.harvest_date && form.drying_start_date && form.harvest_date > form.drying_start_date) {
      errs.drying_start_date = "Doit être postérieure à la récolte";
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSubmitting(true);
    const { data: userData } = await supabase.auth.getUser();
    const createdAt = new Date(`${form.drying_start_date}T08:00:00`).toISOString();
    const { data, error } = await supabase
      .from("batches")
      .insert({
        batch_number: form.batch_number.trim(),
        strain: form.strain.trim(),
        plant_count: form.plant_count ? Number(form.plant_count) : null,
        weight_per_plant: form.total_harvest_weight
          ? Number(form.total_harvest_weight)
          : null,
        harvest_date: form.harvest_date || null,
        harvest_room: form.harvest_room.trim() || null,
        drying_location: form.drying_location.trim() || null,
        status: "in_progress",
        created_by: userData.user?.id ?? null,
        created_at: createdAt,
      } as any)
      .select()
      .single();

    if (error) {
      setSubmitting(false);
      const code = (error as { code?: string }).code;
      if (code === "23505" || /duplicate|unique/i.test(error.message)) {
        setErrors({ batch_number: "Ce numéro de batch existe déjà" });
        toast.error("Ce numéro de batch existe déjà");
      } else {
        toast.error(error.message);
      }
      return;
    }

    // Démarre automatiquement l'étape Séchage à la date choisie
    await supabase.from("batch_stages").insert({
      batch_id: data.id,
      stage_type: "drying",
      status: "in_progress",
      started_at: createdAt,
    } as any);

    setSubmitting(false);
    toast.success("Batch créée — séchage démarré");
    navigate({ to: "/batches/$id", params: { id: data.id } });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/batches" })}>
        <ArrowLeft className="mr-1 h-4 w-4" /> Retour
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Nouvelle batch</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="batch_number">Numéro de batch *</Label>
              <Input id="batch_number" value={form.batch_number} onChange={update("batch_number")} maxLength={64} />
              {errors.batch_number && <p className="mt-1 text-xs text-destructive">{errors.batch_number}</p>}
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="strain">Nom de la variété *</Label>
              <Input id="strain" value={form.strain} onChange={update("strain")} maxLength={128} />
              {errors.strain && <p className="mt-1 text-xs text-destructive">{errors.strain}</p>}
            </div>
            <div>
              <Label htmlFor="plant_count">Nombre de plants</Label>
              <Input id="plant_count" type="number" min="0" value={form.plant_count} onChange={update("plant_count")} />
            </div>
            <div>
              <Label htmlFor="total_harvest_weight">Poids total de la récolte humide (g)</Label>
              <Input
                id="total_harvest_weight"
                type="number"
                min="0"
                step="0.01"
                value={form.total_harvest_weight}
                onChange={update("total_harvest_weight")}
              />
            </div>
            <div>
              <Label htmlFor="harvest_date">Date de récolte</Label>
              <Input id="harvest_date" type="date" value={form.harvest_date} onChange={update("harvest_date")} />
            </div>
            <div>
              <Label htmlFor="harvest_room">Salle de récolte</Label>
              <Input id="harvest_room" value={form.harvest_room} onChange={update("harvest_room")} maxLength={64} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="drying_location">Emplacement de séchage</Label>
              <Input
                id="drying_location"
                value={form.drying_location}
                onChange={update("drying_location")}
                maxLength={128}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="drying_start_date">
                Date d'entrée en séchage (= date de création) *
              </Label>
              <Input
                id="drying_start_date"
                type="date"
                value={form.drying_start_date}
                onChange={update("drying_start_date")}
              />
              {errors.drying_start_date && (
                <p className="mt-1 text-xs text-destructive">{errors.drying_start_date}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                Le séchage démarrera automatiquement à cette date.
              </p>
            </div>
            <div className="sm:col-span-2 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => navigate({ to: "/batches" })}>
                Annuler
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Création..." : "Créer la batch"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
