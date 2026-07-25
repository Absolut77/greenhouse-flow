import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import { StatusBadge } from "./batches";
import { StagesSection } from "@/components/batches/stages-section";
import { DryingLogsSection } from "@/components/batches/drying-logs-section";
import { SamplesSection } from "@/components/batches/samples-section";

type Batch = Tables<"batches">;

export const Route = createFileRoute("/_authenticated/batches_/$id")({
  head: () => ({ meta: [{ title: "Batch — ONO Cannabis" }] }),
  component: BatchDetailPage,
});

function BatchDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [batch, setBatch] = useState<Batch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  const load = async () => {
    const { data, error } = await supabase
      .from("batches")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) setError(error.message);
    else if (!data) setError("Batch introuvable");
    else setBatch(data);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const toggleStatus = async () => {
    if (!batch) return;
    const next = batch.status === "in_progress" ? "closed" : "in_progress";
    setUpdating(true);
    const { data, error } = await supabase
      .from("batches")
      .update({
        status: next,
        closed_at: next === "closed" ? new Date().toISOString() : null,
      })
      .eq("id", batch.id)
      .select()
      .single();
    setUpdating(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setBatch(data);
    toast.success(`Statut : ${next}`);
  };

  if (error) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/batches" })}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Retour
        </Button>
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  if (!batch) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/batches" })}>
        <ArrowLeft className="mr-1 h-4 w-4" /> Retour
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{batch.batch_number}</h1>
          <span className="text-muted-foreground">— {batch.strain ?? "—"}</span>
          <StatusBadge status={batch.status} />
        </div>
        {batch.status !== "archived" && (
          <Button onClick={toggleStatus} disabled={updating} variant="secondary">
            {batch.status === "in_progress" ? "Fermer la batch" : "Rouvrir la batch"}
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Informations générales</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Info label="Numéro" value={batch.batch_number} />
          <Info label="Strain" value={batch.strain} />
          <Info label="Nombre de plants" value={batch.plant_count?.toString()} />
          <Info
            label="Poids par plant (g)"
            value={batch.weight_per_plant?.toString()}
          />
          <Info
            label="Date de récolte"
            value={batch.harvest_date ? new Date(batch.harvest_date).toLocaleDateString("fr-CA") : null}
          />
          <Info label="Salle de récolte" value={batch.harvest_room} />
          <Info label="Emplacement de séchage" value={batch.drying_location} />
          <Info
            label="Créée le"
            value={new Date(batch.created_at).toLocaleString("fr-CA")}
          />
        </CardContent>
      </Card>

      <StagesSection batchId={batch.id} />
      <DryingLogsSection batchId={batch.id} />
      <Section title="Pesées" description="Historique des pesées." />
      <Section title="Pesées" description="Historique des pesées." />
      <SamplesSection batchId={batch.id} />
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-sm">{value?.trim() ? value : "—"}</div>
    </div>
  );
}

function Section({ title, description }: { title: string; description: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{description}</p>
        <Separator className="my-4" />
        <p className="text-sm text-muted-foreground italic">
          Aucune donnée pour le moment.
        </p>
      </CardContent>
    </Card>
  );
}
