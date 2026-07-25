import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { CREATABLE_EVENT_TYPES } from "./events";

type Batch = Tables<"batches">;

const NONE = "__none__";

export const Route = createFileRoute("/_authenticated/events_/new")({
  head: () => ({ meta: [{ title: "Nouvel événement — ONO Cannabis" }] }),
  component: NewEventPage,
});

function NewEventPage() {
  const navigate = useNavigate();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [eventNumber, setEventNumber] = useState("");
  const [eventType, setEventType] = useState("");
  const [batchId, setBatchId] = useState<string>(NONE);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("batches")
        .select("*")
        .order("created_at", { ascending: false });
      setBatches(data ?? []);
    })();
  }, []);

  const submit = async () => {
    if (!eventNumber.trim()) {
      toast.error("Le numéro d'événement est obligatoire");
      return;
    }
    if (!eventType) {
      toast.error("Le type d'événement est obligatoire");
      return;
    }
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("events")
      .insert({
        event_number: eventNumber.trim(),
        event_type: eventType,
        related_batch_id: batchId === NONE ? null : batchId,
        notes: notes.trim() || null,
        status: "open",
        created_by: userData.user?.id ?? null,
      })
      .select()
      .single();
    setSaving(false);
    if (error) {
      if (error.code === "23505") {
        toast.error("Ce numéro d'événement existe déjà");
      } else {
        toast.error(error.message);
      }
      return;
    }
    toast.success("Événement créé");
    navigate({ to: "/events/$id", params: { id: data.id } });
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/events">
            <ArrowLeft className="mr-1 h-4 w-4" /> Retour aux événements
          </Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Nouvel événement</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label>Numéro d'événement *</Label>
            <Input
              value={eventNumber}
              onChange={(e) => setEventNumber(e.target.value)}
              placeholder="EVT-2026-001"
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Type *</Label>
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner" />
                </SelectTrigger>
                <SelectContent>
                  {CREATABLE_EVENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Batch liée</Label>
              <Select value={batchId} onValueChange={setBatchId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Aucune</SelectItem>
                  {batches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.batch_number}
                      {b.strain ? ` — ${b.strain}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => navigate({ to: "/events" })}>
              Annuler
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Créer
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
