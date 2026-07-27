import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, Loader2, Pencil, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

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
import { EventStatusBadge, EVENT_TYPES, RECEPTION_KINDS, SHIPMENT_KINDS } from "./events";
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
  const [completeOpen, setCompleteOpen] = useState(false);
  const [completedAtInput, setCompletedAtInput] = useState("");

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

  const isCloseable =
    event?.event_type === "packaging" || event?.event_type === "rework";

  const changeStatus = async (next: string, completedAtIso?: string) => {
    if (!event) return;
    if (next === "completed") {
      if (isCloseable) {
        // Open dedicated close dialog with lot creation & surplus handling.
        setCompleteOpen(true);
        return;
      }
      if (!completedAtIso) {
        const d = new Date();
        const pad = (n: number) => String(n).padStart(2, "0");
        setCompletedAtInput(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
        setCompleteOpen(true);
        return;
      }
    }
    setUpdating(true);
    const { data, error } = await supabase
      .from("events")
      .update({
        status: next,
        completed_at:
          next === "completed"
            ? (completedAtIso ?? new Date().toISOString())
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

      {event.event_type === "reception" && (
        <ReceptionDetailsSection event={event} />
      )}

      {event.event_type === "shipment" && (
        <ShipmentDetailsSection event={event} />
      )}

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

      {isCloseable ? (
        <CloseEventDialog
          open={completeOpen}
          onOpenChange={setCompleteOpen}
          event={event}
          onClosed={load}
        />
      ) : (
        <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Terminer l'événement</DialogTitle>
            </DialogHeader>
            <div className="grid gap-2 py-2">
              <Label>Date et heure de fin</Label>
              <Input
                type="datetime-local"
                value={completedAtInput}
                min={event?.created_at ? (() => {
                  const d = new Date(event.created_at);
                  const p = (n: number) => String(n).padStart(2, "0");
                  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
                })() : undefined}
                onChange={(e) => setCompletedAtInput(e.target.value)}
              />
              {event?.created_at && (
                <p className="text-xs text-muted-foreground">
                  Créé le {new Date(event.created_at).toLocaleString("fr-CA")}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setCompleteOpen(false)}>Annuler</Button>
              <Button
                onClick={() => {
                  if (!completedAtInput) return;
                  const iso = new Date(completedAtInput).toISOString();
                  if (event?.created_at && new Date(iso).getTime() < new Date(event.created_at).getTime()) {
                    toast.error("La date de fin ne peut pas être antérieure à la date de création.");
                    return;
                  }
                  setCompleteOpen(false);
                  changeStatus("completed", iso);
                }}
              >
                Confirmer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
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

function ReceptionDetailsSection({ event }: { event: Event }) {
  const [items, setItems] = useState<Tables<"non_cannabis_receptions">[] | null>(null);
  const [linkedShipment, setLinkedShipment] = useState<Event | null>(null);
  const kindLabel = RECEPTION_KINDS.find((k) => k.value === event.reception_kind)?.label
    ?? event.reception_kind
    ?? "—";

  useEffect(() => {
    if (event.reception_kind === "non_cannabis") {
      (async () => {
        const { data } = await supabase
          .from("non_cannabis_receptions")
          .select("*")
          .eq("event_id", event.id)
          .order("created_at", { ascending: true });
        setItems(data ?? []);
      })();
    }
    if (event.linked_shipment_event_id) {
      (async () => {
        const { data } = await supabase
          .from("events")
          .select("*")
          .eq("id", event.linked_shipment_event_id!)
          .maybeSingle();
        setLinkedShipment(data ?? null);
      })();
    }
  }, [event.id, event.reception_kind, event.linked_shipment_event_id]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Détails de la réception</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <Info label="Type de réception">{kindLabel}</Info>
        <Info label="Fournisseur">{event.supplier ?? "—"}</Info>
        <Info label="Référence">{event.reference_number ?? "—"}</Info>
        <Info label="Expédition liée">
          {linkedShipment ? (
            <Link
              to="/events/$id"
              params={{ id: linkedShipment.id }}
              className="hover:underline text-primary"
            >
              {linkedShipment.event_number}
            </Link>
          ) : (
            "—"
          )}
        </Info>
        {event.reception_kind === "non_cannabis" && (
          <div className="sm:col-span-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
              Articles reçus
            </p>
            {items === null ? (
              <p className="text-sm text-muted-foreground">Chargement…</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun article.</p>
            ) : (
              <div className="rounded-md border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2">Nom</th>
                      <th className="text-left px-3 py-2">Catégorie</th>
                      <th className="text-right px-3 py-2">Qté</th>
                      <th className="text-left px-3 py-2">Unité</th>
                      <th className="text-left px-3 py-2">Emplacement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <tr key={it.id} className="border-t border-border">
                        <td className="px-3 py-2">{it.item_name}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {it.category ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-right">{it.quantity ?? "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {it.unit ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {it.location ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ShipmentDetailsSection({ event }: { event: Event }) {
  const anyEvent = event as any;
  const kindLabel =
    SHIPMENT_KINDS.find((k) => k.value === anyEvent.shipment_kind)?.label ??
    anyEvent.shipment_kind ??
    "—";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Détails expédition</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Info label="Type">{kindLabel}</Info>
          <Info label="Destination">{anyEvent.destination ?? "—"}</Info>
          <Info label="Transporteur">{anyEvent.carrier ?? "—"}</Info>
          <Info label="Référence / manifeste">
            {anyEvent.reference_number ?? "—"}
          </Info>
        </div>
      </CardContent>
    </Card>
  );
}

/** One returnable source line: a precise bag when the lot is structured, or the
 *  whole lot when it isn't. */
type SourceRow = {
  key: string;
  lot_id: string;
  lot_number: string;
  container_id: string | null;
  container_code: string | null;
  out_grams: number;
  out_units: number;
  return_grams: string;
  return_units: string;
};

function CloseEventDialog({
  open,
  onOpenChange,
  event,
  onClosed,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  event: Event | null;
  onClosed: () => void;
}) {
  const [lotName, setLotName] = useState("");
  const [units, setUnits] = useState("");
  const [unitWeight, setUnitWeight] = useState("");
  const [processingLoss, setProcessingLoss] = useState("0");
  const [dryDestroyed, setDryDestroyed] = useState("0");
  const [completedAt, setCompletedAt] = useState("");
  const [sourceRows, setSourceRows] = useState<SourceRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [confirmed, setConfirmed] = useState(false);

  const sourceOut = sourceRows.reduce((a, r) => a + r.out_grams, 0);

  useEffect(() => {
    if (!open || !event) return;
    setLotName(event.event_number || "");
    setStep("form");
    setConfirmed(false);
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    setCompletedAt(
      `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`,
    );
    (async () => {
      const { data } = await (supabase as any)
        .from("event_items")
        .select(
          "inventory_lot_id, container_id, quantity_grams, units, inventory_lots(lot_number), stock_containers(container_code)",
        )
        .eq("event_id", event.id)
        .eq("direction", "out");
      const map = new Map<string, SourceRow>();
      for (const r of (data ?? []) as any[]) {
        if (!r.inventory_lot_id) continue;
        const containerId: string | null = r.container_id ?? null;
        const key = `${r.inventory_lot_id}::${containerId ?? "lot"}`;
        const g = Number(r.quantity_grams || 0);
        const un = Number(r.units || 0);
        const prev = map.get(key);
        if (prev) {
          prev.out_grams += g;
          prev.out_units += un;
        } else {
          map.set(key, {
            key,
            lot_id: r.inventory_lot_id,
            lot_number: r.inventory_lots?.lot_number ?? r.inventory_lot_id.slice(0, 8),
            container_id: containerId,
            container_code: r.stock_containers?.container_code ?? null,
            out_grams: g,
            out_units: un,
            return_grams: "0",
            return_units: "0",
          });
        }
      }
      setSourceRows(Array.from(map.values()));
    })();
  }, [open, event]);

  const u = Number(units) || 0;
  const w = Number(unitWeight) || 0;
  const produced = u * w;
  const loss = Number(processingLoss) || 0;
  const dry = Number(dryDestroyed) || 0;
  const usedG = produced + loss;
  const surplus = sourceOut - usedG - dry;
  const invalid = surplus < -0.001;

  const returnedTotal = sourceRows.reduce((a, r) => a + (Number(r.return_grams) || 0), 0);
  const returnMismatch = surplus > 0.001 && Math.abs(returnedTotal - surplus) > 0.01;
  const overReturn = sourceRows.some(
    (r) =>
      (Number(r.return_grams) || 0) > r.out_grams + 1e-6 ||
      (Number(r.return_units) || 0) > r.out_units,
  );
  const hasBags = sourceRows.some((r) => r.container_id);

  const patchRow = (key: string, patch: Partial<SourceRow>) =>
    setSourceRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const distributeProportional = () => {
    if (surplus <= 0 || sourceOut <= 0) return;
    setSourceRows((rows) =>
      rows.map((r) => {
        const ratio = r.out_grams / sourceOut;
        return {
          ...r,
          return_grams: (ratio * surplus).toFixed(2),
          return_units: String(Math.floor(r.out_units * ratio)),
        };
      }),
    );
  };
  const distributeToFirst = () => {
    if (surplus <= 0 || sourceRows.length === 0) return;
    setSourceRows((rows) =>
      rows.map((r, i) =>
        i === 0
          ? { ...r, return_grams: surplus.toFixed(2), return_units: String(r.out_units) }
          : { ...r, return_grams: "0", return_units: "0" },
      ),
    );
  };
  const clearReturns = () =>
    setSourceRows((rows) => rows.map((r) => ({ ...r, return_grams: "0", return_units: "0" })));

  const validate = (): boolean => {
    if (!event) return false;
    if (!lotName.trim()) { toast.error("Nom du lot obligatoire"); return false; }
    if (u <= 0 || w <= 0) { toast.error("Unités et poids/unité > 0"); return false; }
    if (invalid) { toast.error("Utilisé + destruction dépasse la sortie totale."); return false; }
    if (overReturn) { toast.error("Un retour dépasse la quantité sortie du sac / lot."); return false; }
    if (returnMismatch) {
      toast.error(`La répartition du surplus (${returnedTotal.toFixed(2)} g) doit égaler ${surplus.toFixed(2)} g.`);
      return false;
    }
    return true;
  };

  const goToConfirm = () => {
    if (!validate()) return;
    setConfirmed(false);
    setStep("confirm");
  };

  const submit = async () => {
    if (!event || !validate()) return;
    const returns = sourceRows
      .map((r) => ({
        lot_id: r.lot_id,
        container_id: r.container_id,
        grams: Number(r.return_grams) || 0,
        units: Number(r.return_units) || 0,
      }))
      .filter((r) => r.grams > 0);
    setSaving(true);
    const { error } = await (supabase as any).rpc("close_event", {
      _event_id: event.id,
      _lot_name: lotName.trim(),
      _units: u,
      _unit_weight_g: w,
      _used_g: usedG,
      _dry_destroyed_g: dry,
      _completed_at: new Date(completedAt).toISOString(),
      _surplus_returns: surplus > 0.001 ? returns : null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Événement clôturé — lot créé, surplus réintégré");
    onOpenChange(false);
    onClosed();
  };

  const surplusReturns = sourceRows.filter((r) => (Number(r.return_grams) || 0) > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === "form" ? "Clôturer l'événement" : "Confirmer la clôture"}
          </DialogTitle>
        </DialogHeader>

        {step === "form" && (
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label>Nom du lot produit *</Label>
              <Input value={lotName} onChange={(e) => setLotName(e.target.value)} />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Unités produites *</Label>
                <Input type="number" min="0" value={units} onChange={(e) => setUnits(e.target.value)} placeholder="Ex. 24" />
              </div>
              <div className="grid gap-2">
                <Label>Poids / unité (g) *</Label>
                <Input type="number" step="0.01" min="0" value={unitWeight} onChange={(e) => setUnitWeight(e.target.value)} placeholder="Ex. 2.5" />
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Processing loss (g)</Label>
                <Input type="number" step="0.01" min="0" value={processingLoss} onChange={(e) => setProcessingLoss(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Destruction dry (g)</Label>
                <Input type="number" step="0.01" min="0" value={dryDestroyed} onChange={(e) => setDryDestroyed(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Date et heure de clôture</Label>
              <Input type="datetime-local" value={completedAt} onChange={(e) => setCompletedAt(e.target.value)} />
            </div>

            <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
              <div>Sortie totale (source) : <b>{sourceOut.toFixed(2)} g</b></div>
              <div>Produit : <b>{produced.toFixed(2)} g</b> ({u} × {w} g)</div>
              <div>Processing loss : <b>{loss.toFixed(2)} g</b></div>
              <div>Destruction dry : <b>{dry.toFixed(2)} g</b></div>
              <div className={invalid ? "text-destructive font-medium" : ""}>
                Surplus à retourner : <b>{surplus.toFixed(2)} g</b>
              </div>
            </div>

            {surplus > 0.001 && sourceRows.length > 0 && (
              <div className="rounded-md border p-3 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium">
                    Retour du surplus {hasBags ? "par sac source" : "par lot source"}
                  </div>
                  <div className="flex gap-1">
                    {sourceRows.length > 1 && (
                      <Button type="button" size="sm" variant="outline" onClick={distributeProportional}>
                        Proportionnel
                      </Button>
                    )}
                    <Button type="button" size="sm" variant="outline" onClick={distributeToFirst}>
                      Tout sur le 1er
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={clearReturns}>
                      Vider
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  {sourceRows.map((r) => {
                    const rg = Number(r.return_grams) || 0;
                    const ru = Number(r.return_units) || 0;
                    const over = rg > r.out_grams + 1e-6 || ru > r.out_units;
                    const full = Math.abs(rg - r.out_grams) < 0.01;
                    return (
                      <div
                        key={r.key}
                        className="grid gap-2 rounded-md border border-border/50 bg-muted/20 p-2 sm:grid-cols-[1.4fr_1fr_0.8fr_auto] sm:items-end"
                      >
                        <div>
                          <div className="text-sm font-medium">
                            {r.container_code ?? r.lot_number}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {r.container_code ? `${r.lot_number} · ` : ""}
                            Sorti : {r.out_grams.toFixed(2)} g
                            {r.out_units > 0 ? ` · ${r.out_units} u` : ""}
                          </div>
                        </div>
                        <div className="grid gap-1.5">
                          <Label className="text-xs">Retour (g)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            max={r.out_grams}
                            value={r.return_grams}
                            onChange={(e) => patchRow(r.key, { return_grams: e.target.value })}
                            className={over ? "border-destructive" : ""}
                          />
                        </div>
                        <div className="grid gap-1.5">
                          <Label className="text-xs">Unités</Label>
                          <Input
                            type="number"
                            min="0"
                            max={r.out_units}
                            value={r.return_units}
                            onChange={(e) => patchRow(r.key, { return_units: e.target.value })}
                            className={ru > r.out_units ? "border-destructive" : ""}
                          />
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant={full ? "secondary" : "outline"}
                          onClick={() =>
                            patchRow(r.key, {
                              return_grams: r.out_grams.toFixed(2),
                              return_units: String(r.out_units),
                            })
                          }
                        >
                          {r.container_code ? "Sac complet" : "Tout"}
                        </Button>
                      </div>
                    );
                  })}
                </div>
                <div className={`text-xs ${returnMismatch ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                  Total réparti : <b>{returnedTotal.toFixed(2)} g</b> / attendu <b>{surplus.toFixed(2)} g</b>
                  {returnMismatch && ` (écart ${(returnedTotal - surplus).toFixed(2)} g)`}
                </div>
                {overReturn && (
                  <div className="text-xs text-destructive">
                    Un retour dépasse la quantité sortie du sac / lot correspondant.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {step === "confirm" && (
          <div className="grid gap-4 py-2">
            <div className="rounded-md border bg-muted/30 p-4 space-y-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Récapitulatif</div>
              <div className="grid gap-2 text-sm">
                <div className="flex justify-between border-b border-border/50 pb-2">
                  <span className="text-muted-foreground">Sortie totale (source)</span>
                  <span className="font-semibold tabular-nums">{sourceOut.toFixed(2)} g</span>
                </div>
                <div className="flex justify-between border-b border-border/50 pb-2">
                  <span className="text-muted-foreground">Lot produit</span>
                  <span className="font-semibold text-right">
                    {lotName} — {u} × {w} g = <span className="tabular-nums">{produced.toFixed(2)} g</span>
                  </span>
                </div>
                <div className="flex justify-between border-b border-border/50 pb-2">
                  <span className="text-muted-foreground">Processing loss</span>
                  <span className="font-semibold tabular-nums">{loss.toFixed(2)} g</span>
                </div>
                <div className="flex justify-between border-b border-border/50 pb-2">
                  <span className="text-muted-foreground">Destruction dry</span>
                  <span className="font-semibold tabular-nums">{dry.toFixed(2)} g</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Surplus retourné</span>
                  <span className="font-semibold tabular-nums">{surplus > 0.001 ? `${surplus.toFixed(2)} g` : "—"}</span>
                </div>
              </div>

              {surplusReturns.length > 0 && (
                <div className="mt-2 space-y-1 rounded border border-border/60 bg-background/40 p-2">
                  <div className="text-xs text-muted-foreground">
                    Réintégration {hasBags ? "sac par sac" : "par lot"}
                  </div>
                  {surplusReturns.map((r) => (
                    <div key={r.key} className="flex justify-between text-xs">
                      <span>
                        {r.container_code ? `${r.container_code} (${r.lot_number})` : r.lot_number}
                      </span>
                      <span className="tabular-nums font-medium">
                        +{(Number(r.return_grams) || 0).toFixed(2)} g
                        {Number(r.return_units) > 0 ? ` · ${Number(r.return_units)} u` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                Cette action est <b>définitive</b> : elle crée le lot produit, ajuste les stocks source et clôture l'événement.
                Vérifiez les quantités avant de confirmer.
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
              <Button onClick={goToConfirm} disabled={invalid || returnMismatch || overReturn}>
                Continuer →
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setStep("form")} disabled={saving}>
                ← Retour
              </Button>
              <Button onClick={submit} disabled={saving || !confirmed}>
                {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Confirmer et clôturer
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


