import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Pencil, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import { EventStatusBadge, EVENT_TYPES } from "./events";
import { EventItemsSection } from "@/components/events/event-items-section";
import { EventStampsSection } from "@/components/events/event-stamps-section";
import { PackagedLotsSection } from "@/components/events/packaged-lots-section";
import { useAuth } from "@/hooks/use-auth";

type Event = Tables<"events">;
type Batch = Tables<"batches">;

const NONE = "__none__";

export const Route = createFileRoute("/_authenticated/events_/$id")({
  head: () => ({ meta: [{ title: "Événement — ONO Cannabis" }] }),
  component: EventDetailPage,
});

function EventDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { roles } = useAuth();
  const isViewerOnly = roles.length > 0 && roles.every((r) => r === "viewer");
  const [event, setEvent] = useState<Event | null>(null);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [creator, setCreator] = useState<{
    full_name: string | null;
    email: string | null;
  } | null>(null);
  const [itemCount, setItemCount] = useState<number | null>(null);
  const [stampCount, setStampCount] = useState<number | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setError(null);
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      setError(error.message);
      return;
    }
    if (!data) {
      setError("Événement introuvable");
      return;
    }
    setEvent(data);
    if (data.related_batch_id) {
      const { data: b } = await supabase
        .from("batches")
        .select("*")
        .eq("id", data.related_batch_id)
        .maybeSingle();
      setBatch(b);
    } else setBatch(null);
    if (data.created_by) {
      const { data: p } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", data.created_by)
        .maybeSingle();
      setCreator(p);
    } else setCreator(null);
    const [{ count: iCount }, { count: sCount }] = await Promise.all([
      supabase
        .from("event_items")
        .select("id", { count: "exact", head: true })
        .eq("event_id", id),
      supabase
        .from("stamp_movements")
        .select("id", { count: "exact", head: true })
        .eq("event_id", id),
    ]);
    setItemCount(iCount ?? 0);
    setStampCount(sCount ?? 0);

  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleDelete = async () => {
    if (!event) return;
    setDeleting(true);
    const { error } = await supabase.from("events").delete().eq("id", event.id);
    setDeleting(false);
    if (error) {
      if (
        error.code === "23001" ||
        /mouvements de stock|mouvements de timbres/i.test(error.message)
      ) {
        toast.error(
          "Impossible de supprimer cet événement car il contient des mouvements de stock ou de timbres. Utilisez un événement de type destruction ou expédition.",
        );
      } else {
        toast.error(error.message);
      }

      // Refresh count in case it changed
      load();
      setConfirmDelete(false);
      return;
    }
    toast.success("Événement supprimé");
    setConfirmDelete(false);
    navigate({ to: "/events" });
  };

  const changeStatus = async (next: string) => {
    if (!event) return;
    setUpdating(true);
    const { data, error } = await supabase
      .from("events")
      .update({
        status: next,
        completed_at:
          next === "completed"
            ? new Date().toISOString()
            : next === "open"
              ? null
              : event.completed_at,
      })
      .eq("id", event.id)
      .select()
      .single();
    setUpdating(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setEvent(data);
    toast.success("Statut mis à jour");
  };

  if (error) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/events">
            <ArrowLeft className="mr-1 h-4 w-4" /> Retour
          </Link>
        </Button>
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement...
      </div>
    );
  }

  const typeLabel =
    EVENT_TYPES.find((t) => t.value === event.event_type)?.label ??
    event.event_type ??
    "—";

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/events">
            <ArrowLeft className="mr-1 h-4 w-4" /> Retour aux événements
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{event.event_number}</h1>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <EventStatusBadge status={event.status} />
            <span>{typeLabel}</span>
            <span>
              Créé le {new Date(event.created_at).toLocaleDateString("fr-CA")}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={event.status ?? ""}
            onValueChange={changeStatus}
            disabled={updating}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Ouvert</SelectItem>
              <SelectItem value="completed">Complété</SelectItem>
              <SelectItem value="cancelled">Annulé</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="mr-1 h-4 w-4" /> Modifier
          </Button>
          {!isViewerOnly && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmDelete(true)}
                      disabled={
                        itemCount === null ||
                        stampCount === null ||
                        itemCount > 0 ||
                        stampCount > 0
                      }
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="mr-1 h-4 w-4" /> Supprimer
                    </Button>
                  </span>
                </TooltipTrigger>
                {((itemCount ?? 0) > 0 || (stampCount ?? 0) > 0) && (
                  <TooltipContent>
                    Impossible : cet événement contient{" "}
                    {(itemCount ?? 0) > 0 &&
                      `${itemCount} mouvement${itemCount! > 1 ? "s" : ""} de stock`}
                    {(itemCount ?? 0) > 0 && (stampCount ?? 0) > 0 && " et "}
                    {(stampCount ?? 0) > 0 &&
                      `${stampCount} mouvement${stampCount! > 1 ? "s" : ""} de timbres`}
                    .
                  </TooltipContent>
                )}

              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Informations</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Info label="Type">{typeLabel}</Info>
          <Info label="Batch liée">
            {batch ? (
              <Link
                to="/batches/$id"
                params={{ id: batch.id }}
                className="hover:underline"
              >
                {batch.batch_number}
                {batch.strain ? ` — ${batch.strain}` : ""}
              </Link>
            ) : (
              "—"
            )}
          </Info>
          <Info label="Complété le">
            {event.completed_at
              ? new Date(event.completed_at).toLocaleString("fr-CA")
              : "—"}
          </Info>
          <Info label="Créé par">
            {creator?.full_name ?? creator?.email ?? "—"}
          </Info>
          <div className="sm:col-span-2">
            <Info label="Notes">
              {event.notes ? (
                <span className="whitespace-pre-wrap">{event.notes}</span>
              ) : (
                "—"
              )}
            </Info>
          </div>
        </CardContent>
      </Card>

      <EventItemsSection eventId={event.id} eventStatus={event.status} />

      {event.event_type === "packaging" && (
        <>
          <PackagedLotsSection eventId={event.id} eventStatus={event.status} />
          <EventStampsSection eventId={event.id} eventStatus={event.status} />
        </>
      )}

      <EditEventDialog
        key={event.id}
        event={event}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={load}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cet événement ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est définitive. Elle n'est possible que si
              l'événement ne contient aucun mouvement de stock ni de timbres.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-sm">{children}</p>
    </div>
  );
}

function EditEventDialog({
  event,
  open,
  onOpenChange,
  onSaved,
}: {
  event: Event;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [eventNumber, setEventNumber] = useState(event.event_number);
  const [eventType, setEventType] = useState(event.event_type ?? "");
  const [batchId, setBatchId] = useState<string>(event.related_batch_id ?? NONE);
  const [notes, setNotes] = useState(event.notes ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from("batches")
        .select("*")
        .order("created_at", { ascending: false });
      setBatches(data ?? []);
    })();
  }, [open]);

  const submit = async () => {
    if (!eventNumber.trim()) {
      toast.error("Le numéro est obligatoire");
      return;
    }
    if (!eventType) {
      toast.error("Le type est obligatoire");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("events")
      .update({
        event_number: eventNumber.trim(),
        event_type: eventType,
        related_batch_id: batchId === NONE ? null : batchId,
        notes: notes.trim() || null,
      })
      .eq("id", event.id);
    setSaving(false);
    if (error) {
      if (error.code === "23505") {
        toast.error("Ce numéro d'événement existe déjà");
      } else {
        toast.error(error.message);
      }
      return;
    }
    toast.success("Événement mis à jour");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Modifier l'événement</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Numéro *</Label>
            <Input
              value={eventNumber}
              onChange={(e) => setEventNumber(e.target.value)}
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
                  {EVENT_TYPES.map((t) => (
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
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
